/**
 * Empty-lead guard regression tests (v1.14.19)
 *
 * Regression coverage for the bug where media-only WhatsApp messages
 * (stickers / videos / reactions / locations / contacts) created empty
 * pending_demands rows that surfaced in the corbeille as
 * "Numéro masqué (WhatsApp) — Aucun document extrait".
 *
 * Confirmed in production log:
 *   [pipeline:wa] ← message | sender=66958707974242@lid | image=false | text=""
 *   [pipeline:wa] → match: none — new lead
 *   [pipeline:wa] ✓ lead inserted id=a6c89a27-...
 *
 * Root cause: handleInboundWhatsApp fell through every triage / extraction
 * block when bodyText was empty AND imageBuffer was null, then INSERTed a
 * pending_demands row with extracted_data: null.
 *
 * Fix: safety guard before findMatchingDemand — if extractedData is null,
 * drop the message instead of inserting.
 *
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach } from 'vitest'

process.env.ANTHROPIC_API_KEY = 'test-key'

const _insertCalls = []
const _updateCalls = []

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: '{}' }] }),
      }
    }
  },
}))

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          // findActiveLeadByPhone: returns no active lead for this sender
          in: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
          }),
          // findOfferSentLeadByEmail path (gmail), not exercised here
          eq: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
            gte: () => ({
              order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
            }),
          }),
        }),
      }),
      update: (payload) => {
        _updateCalls.push({ table, payload })
        return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
      },
      insert: (payload) => {
        _insertCalls.push({ table, payload })
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'should-not-happen' }, error: null }),
          }),
        }
      },
    }),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))

vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('fra'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'ok', matchedKeywords: [] }),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
  detectMissingDocs: vi.fn().mockReturnValue({ needsCIN: true, needsPermis: true }),
}))

vi.mock('../lib/conversation.js', () => ({
  appendConversation: vi.fn().mockResolvedValue(undefined),
}))

const sendToAgencyMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/pushNotifications.js', () => ({
  sendToAgency: sendToAgencyMock,
}))

vi.mock('../lib/twilioClient.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
  formatWhatsAppNumber: (p) => `${p}@s.whatsapp.net`,
}))

const { handleInboundWhatsApp } = await import('../routes/leads.js')

const AGENCY_ID = 'agency-test'
const LID_SENDER  = '66958707974242@lid'
const PHONE_SENDER = '212612345678@s.whatsapp.net'

beforeEach(() => {
  _insertCalls.length = 0
  _updateCalls.length = 0
  sendToAgencyMock.mockClear()
})

test('@lid sender + empty body + no image → message dropped, no insert', async () => {
  // Exact reproduction of the production log:
  //   sender=66958707974242@lid | image=false | text=""
  await handleInboundWhatsApp(AGENCY_ID, LID_SENDER, null, null, '')

  expect(_insertCalls.length).toBe(0)
  expect(_updateCalls.length).toBe(0)
})

test('phone sender + whitespace-only body + no image → message dropped, no insert', async () => {
  // Sticker / video reactions arrive with empty conversation/caption — same path.
  await handleInboundWhatsApp(AGENCY_ID, PHONE_SENDER, null, null, '   \n  ')

  expect(_insertCalls.length).toBe(0)
  expect(_updateCalls.length).toBe(0)
})

test('null body + no image → message dropped, no insert', async () => {
  await handleInboundWhatsApp(AGENCY_ID, PHONE_SENDER, null, null, null)

  expect(_insertCalls.length).toBe(0)
  expect(_updateCalls.length).toBe(0)
})

test('non-leadable sender (group) + empty body → message dropped, no insert', async () => {
  // Sender-shape gate already drops group messages, but verify the guard
  // also holds if a group sender somehow leaks through.
  await handleInboundWhatsApp(AGENCY_ID, '120363000000000000@g.us', null, null, '')

  expect(_insertCalls.length).toBe(0)
  expect(_updateCalls.length).toBe(0)
})
