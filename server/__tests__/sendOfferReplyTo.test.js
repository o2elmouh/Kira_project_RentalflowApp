/**
 * Regression test for v1.13.7
 *
 * Resend SDK v6 expects `replyTo` (camelCase) on emails.send(). The previous
 * v1.13.4 fix passed `reply_to` (snake_case), which the SDK silently dropped.
 * Result: every quote-offer email left the Reply-To header unset, so client
 * replies went to the Resend From address (noreply@…) and never reached the
 * agency's IMAP-polled Gmail inbox — leads stayed stuck in "offer_sent" even
 * after the client clearly accepted.
 *
 * This test asserts the outgoing send payload uses `replyTo` (not `reply_to`)
 * and that it is set to the agency's connected Gmail.
 *
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach } from 'vitest'

process.env.RESEND_API_KEY = 'test-key'
process.env.RESEND_FROM = 'RentaFlow <noreply@kiraflow.ma>'

// ── Capture Resend payloads ──────────────────────────────────────────────────
const _resendCalls = []
vi.mock('resend', () => ({
  Resend: class {
    constructor() {}
    get emails() {
      return {
        send: async (payload) => {
          _resendCalls.push(payload)
          return { id: 'resend-id-1' }
        },
      }
    }
  },
}))

// ── supabaseAdmin mock — lead + agency + vehicle lookups, update ─────────────
let _agencyGmail = 'kira.boost.ai@gmail.com'
vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'pending_demands') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: { id: 'lead-1', sender_id: 'client@example.com', status: 'waiting' },
                  error: null,
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }
      }
      if (table === 'agencies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { gmail_address: _agencyGmail },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'vehicles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: { id: 'veh-1', brand: 'Audi', model: 'A1' },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  },
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))

vi.mock('../lib/conversation.js', () => ({
  appendConversation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/pushNotifications.js', () => ({
  sendToAgency: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/contractSigning.js', () => ({
  escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
}))

// Lazy import AFTER mocks
const express = (await import('express')).default
const supertest = (await import('supertest')).default
const emailRouter = (await import('../routes/email.js')).default

const app = express()
app.use(express.json())
app.use('/email', emailRouter)

beforeEach(() => {
  _resendCalls.length = 0
  _agencyGmail = 'kira.boost.ai@gmail.com'
})

test('send-offer payload uses replyTo (camelCase) set to agency gmail', async () => {
  const res = await supertest(app)
    .post('/email/send-offer')
    .send({ leadId: 'lead-1', vehicleId: 'veh-1', priceTotal: 43424 })

  expect(res.status).toBe(200)
  expect(_resendCalls.length).toBe(1)

  const payload = _resendCalls[0]
  // The bug: SDK v6 ignores snake_case reply_to → must be camelCase.
  expect(payload.replyTo).toBe('kira.boost.ai@gmail.com')
  expect(payload.reply_to).toBeUndefined()
})

test('agency without gmail_address omits replyTo entirely (no header set)', async () => {
  _agencyGmail = null

  const res = await supertest(app)
    .post('/email/send-offer')
    .send({ leadId: 'lead-1', vehicleId: 'veh-1', priceTotal: 43424 })

  expect(res.status).toBe(200)
  const payload = _resendCalls[0]
  expect(payload.replyTo).toBeUndefined()
  expect(payload.reply_to).toBeUndefined()
})
