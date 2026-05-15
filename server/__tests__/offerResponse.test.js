/**
 * Offer-response pre-triage — unit tests
 * Runner: Vitest (converted from node:test)
 *
 * Tests that handleInboundWhatsApp bypasses keyword triage when the sender has
 * an offer_sent lead, resets the lead status to 'waiting', and appends the
 * reply to raw_payload.replies.
 *
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach } from 'vitest'

process.env.ANTHROPIC_API_KEY = 'test-key'

// ── Mutable state shared across tests ────────────────────────────────────────
let _intentReply = '{"intent":"question"}'
let _offerLead = null
const _updateCalls = []

// ── Anthropic mock ────────────────────────────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: _intentReply }] }),
      }
    }
  },
}))

// ── supabaseAdmin mock ────────────────────────────────────────────────────────
vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => ({
      select: () => ({
        eq: (_col1, _val1) => ({
          eq: (_col2, val2) => {
            // Offer-sent lead lookup — returns configured _offerLead
            if (val2 === 'offer_sent') {
              const resolved = { data: _offerLead ? [_offerLead] : [] }
              const orderLimit = {
                order: () => ({ limit: () => Promise.resolve(resolved) }),
              }
              return { ...orderLimit, eq: () => orderLimit }
            }
            // findMatchingDemand (status=pending)
            return {
              gte: () => ({
                order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
              }),
            }
          },
        }),
      }),
      update: (payload) => {
        _updateCalls.push({ table, payload })
        return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
      },
      insert: () => ({
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'new-id' }, error: null }),
        }),
      }),
      not: () => Promise.resolve({ data: [] }),
    }),
  },
}))

// Stub middleware
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))
vi.mock('../middleware/premium.js', () => ({
  requirePremium: (_req, _res, next) => next(),
}))
vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockResolvedValue('fr'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'pass', matchedKeywords: ['location'] }),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
}))
vi.mock('../lib/conversation.js', () => ({
  appendConversation: vi.fn().mockResolvedValue(undefined),
}))

// Lazy import AFTER mocks
const { handleInboundWhatsApp } = await import('../routes/leads.js')

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetState() {
  _offerLead = null
  _intentReply = '{"intent":"question"}'
  _updateCalls.length = 0
}

const AGENCY_ID = 'agency-abc'
const SENDER_JID = '212612345678@s.whatsapp.net'

const makeOfferLead = (overrides = {}) => ({
  id: 'lead-offer-1',
  sender_id: SENDER_JID,
  raw_payload: { body: 'original offer text', replies: [] },
  extracted_data: { classification: 'new_lead' },
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => resetState())

test('offer reply: status reset to waiting, reply appended to raw_payload.replies', async () => {
  _offerLead = makeOfferLead()
  _intentReply = '{"intent":"accepted"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'wakha mwafaq')

  expect(_updateCalls.length).toBe(1)
  const update = _updateCalls[0]
  expect(update.payload.status).toBe('waiting')
  expect(update.payload.last_client_note).toBe('wakha mwafaq')
  expect(Array.isArray(update.payload.raw_payload.replies)).toBe(true)
  expect(update.payload.raw_payload.replies.length).toBe(1)
  expect(update.payload.raw_payload.replies[0].text).toBe('wakha mwafaq')
  expect(update.payload.raw_payload.replies[0].intent).toBe('accepted')
})

test('offer reply: appends to existing replies in raw_payload', async () => {
  const existingReply = { text: 'first reply', intent: 'question', timestamp: '2026-04-01T10:00:00Z' }
  _offerLead = makeOfferLead({ raw_payload: { body: 'original', replies: [existingReply] } })
  _intentReply = '{"intent":"rejected"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'non merci, trop cher')

  const replies = _updateCalls[0].payload.raw_payload.replies
  expect(replies.length).toBe(2)
  expect(replies[0].text).toBe('first reply')
  expect(replies[1].text).toBe('non merci, trop cher')
  expect(replies[1].intent).toBe('rejected')
})

test('offer reply with empty body: intent defaults to question, status still resets', async () => {
  _offerLead = makeOfferLead()

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', '')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBe('waiting')
  expect(_updateCalls[0].payload.raw_payload.replies[0].intent).toBe('question')
})

test('sender phone normalisation: 9-digit suffix matches across variants', async () => {
  _offerLead = makeOfferLead({ sender_id: '+212612345678' })
  _intentReply = '{"intent":"accepted"}'

  await handleInboundWhatsApp(AGENCY_ID, '212612345678@s.whatsapp.net', null, 'image/jpeg', 'ok')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBe('waiting')
})

test('no offer_sent lead: pipeline continues normally (no update call)', async () => {
  _offerLead = null

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux louer une voiture')

  const offerUpdates = _updateCalls.filter(c => c.payload?.status === 'waiting')
  expect(offerUpdates.length).toBe(0)
})
