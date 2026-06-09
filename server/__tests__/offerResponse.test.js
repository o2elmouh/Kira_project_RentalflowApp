/**
 * Offer-response pre-triage — unit tests
 * Runner: Vitest
 *
 * Tests that handleInboundWhatsApp bypasses keyword triage when the sender has
 * an active (offer_sent or accepted) lead, branches on Claude intent
 * (accepted / rejected / question), and updates status + side effects accordingly.
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
          // findActiveLeadByPhone uses .in('status', ['offer_sent', 'accepted'])
          in: (_col, _vals) => {
            const resolved = { data: _offerLead ? [_offerLead] : [] }
            return {
              order: () => ({ limit: () => Promise.resolve(resolved) }),
            }
          },
          eq: (_col2, val2) => {
            // Legacy path: offer-sent lead lookup (still used by Gmail / findOfferSentLeadByEmail)
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

// Triage mock — include detectMissingDocs (used by handleOfferResponse on accepted)
vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockResolvedValue('fr'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'pass', matchedKeywords: ['location'] }),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
  detectMissingDocs: vi.fn().mockReturnValue({ needsCIN: true, needsPermis: true }),
}))

vi.mock('../lib/conversation.js', () => ({
  appendConversation: vi.fn().mockResolvedValue(undefined),
}))

// Push notifications — spy so tests can assert it fired
const sendToAgencyMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/pushNotifications.js', () => ({
  sendToAgency: sendToAgencyMock,
}))

// Twilio / Baileys WhatsApp send — spy for the auto-ack assertion
const sendWhatsAppMessageMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('../lib/twilioClient.js', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
  formatWhatsAppNumber: (p) => `${p}@s.whatsapp.net`,
}))

// Lazy import AFTER mocks
const { handleInboundWhatsApp } = await import('../routes/leads.js')

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetState() {
  _offerLead = null
  _intentReply = '{"intent":"question"}'
  _updateCalls.length = 0
  sendToAgencyMock.mockClear()
  sendWhatsAppMessageMock.mockClear()
}

const AGENCY_ID = 'agency-abc'
const SENDER_JID = '212612345678@s.whatsapp.net'

const makeOfferLead = (overrides = {}) => ({
  id: 'lead-offer-1',
  sender_id: SENDER_JID,
  status: 'offer_sent',
  raw_payload: { body: 'original offer text', replies: [] },
  extracted_data: { classification: 'new_lead' },
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => resetState())

test('accepted intent → status=accepted, accepted_at set, agency notif + auto-ack sent', async () => {
  _offerLead = makeOfferLead()
  _intentReply = '{"intent":"accepted"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'wakha mwafaq')

  expect(_updateCalls.length).toBe(1)
  const update = _updateCalls[0]
  expect(update.payload.status).toBe('accepted')
  expect(update.payload.accepted_at).toBeTruthy()
  expect(update.payload.last_client_note).toBe('wakha mwafaq')
  expect(update.payload.raw_payload.replies[0].intent).toBe('accepted')

  expect(sendToAgencyMock).toHaveBeenCalledTimes(1)
  expect(sendToAgencyMock.mock.calls[0][1]).toContain('Offre acceptée')

  expect(sendWhatsAppMessageMock).toHaveBeenCalledTimes(1)
})

test('rejected intent → status=ignored, agency notif, no client reply', async () => {
  _offerLead = makeOfferLead()
  _intentReply = '{"intent":"rejected"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'non merci, trop cher')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBe('ignored')
  expect(_updateCalls[0].payload.raw_payload.replies[0].intent).toBe('rejected')

  expect(sendToAgencyMock).toHaveBeenCalledTimes(1)
  expect(sendToAgencyMock.mock.calls[0][1]).toContain('refusée')

  expect(sendWhatsAppMessageMock).not.toHaveBeenCalled()
})

test('question intent → status unchanged, last_client_note saved, agency notif, no reply', async () => {
  _offerLead = makeOfferLead()
  _intentReply = '{"intent":"question"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'et avec assurance ?')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBeUndefined()
  expect(_updateCalls[0].payload.last_client_note).toBe('et avec assurance ?')
  expect(_updateCalls[0].payload.raw_payload.replies[0].intent).toBe('question')

  expect(sendToAgencyMock).toHaveBeenCalledTimes(1)
  expect(sendToAgencyMock.mock.calls[0][1]).toContain('Question')

  expect(sendWhatsAppMessageMock).not.toHaveBeenCalled()
})

test('appends to existing replies in raw_payload', async () => {
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

test('empty body: intent defaults to question, no status change', async () => {
  _offerLead = makeOfferLead()

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', '')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBeUndefined()
  expect(_updateCalls[0].payload.raw_payload.replies[0].intent).toBe('question')
})

test('sender phone normalisation: 9-digit suffix matches across variants', async () => {
  _offerLead = makeOfferLead({ sender_id: '+212612345678' })
  _intentReply = '{"intent":"accepted"}'

  await handleInboundWhatsApp(AGENCY_ID, '212612345678@s.whatsapp.net', null, 'image/jpeg', 'ok')

  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBe('accepted')
})

test('no active lead: pipeline continues normally (no offer update)', async () => {
  _offerLead = null

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux louer une voiture')

  const offerUpdates = _updateCalls.filter(c =>
    c.payload?.status === 'accepted' ||
    c.payload?.status === 'ignored' ||
    (c.payload?.raw_payload?.replies)
  )
  expect(offerUpdates.length).toBe(0)
})
