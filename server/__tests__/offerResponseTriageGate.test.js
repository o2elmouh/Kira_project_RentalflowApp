/**
 * Triage gate regression tests (v1.13.5)
 *
 * Regression coverage for the bug where a sender with a prior `offer_sent` lead
 * could not generate a NEW lead — every inbound message was vacuumed into the
 * existing offer and surfaced as "question noted" instead of appearing in the
 * corbeille.
 *
 * Decision matrix under test (handleInboundWhatsApp):
 *   - active offer_sent lead + classification = new_lead       → NEW lead inserted
 *   - active offer_sent lead + classification = prolongation   → NEW lead inserted
 *   - active offer_sent lead + classification = "other"/none   → route to handleOfferResponse
 *   - no active lead                                           → unchanged (new lead)
 *
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach } from 'vitest'

process.env.ANTHROPIC_API_KEY = 'test-key'

// ── Mutable mock state ───────────────────────────────────────────────────────
let _offerLead = null
let _classifyResponse = null         // returned by classifyTextMessage (routing prompt)
let _quoteIntentResponse = 'question' // returned by analyzeQuoteReply
const _updateCalls = []
const _insertCalls = []
let _waClientsByPhone = []
let _waActiveContracts = []

// ── Anthropic mock — differentiates the two prompts by inspecting `system` ───
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async ({ system }) => {
          // analyzeQuoteReply uses a system prompt starting with "You analyze client replies"
          if (typeof system === 'string' && system.startsWith('You analyze client replies')) {
            return { content: [{ text: JSON.stringify({ intent: _quoteIntentResponse }) }] }
          }
          // classifyTextMessage uses ROUTING_SYSTEM_PROMPT
          return { content: [{ text: JSON.stringify(_classifyResponse || {}) }] }
        },
      }
    }
  },
}))

// ── supabaseAdmin mock — captures inserts + updates, returns offer lead ──────
vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: _waClientsByPhone }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        const buildTerminal = () => ({
          then: (r) => r({ data: _waActiveContracts }),
          order: () => Promise.resolve({ data: _waActiveContracts }),
        })
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => buildTerminal(),
              }),
            }),
          }),
        }
      }
      // Default branch — preserves the existing 6 tests' behavior for
      // pending_demands and any other table they touch.
      return {
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
              if (val2 === 'offer_sent') {
                const resolved = { data: _offerLead ? [_offerLead] : [] }
                const orderLimit = {
                  order: () => ({ limit: () => Promise.resolve(resolved) }),
                }
                return { ...orderLimit, eq: () => orderLimit }
              }
              // findMatchingDemand (status=pending) → no recent match
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
        insert: (payload) => {
          _insertCalls.push({ table, payload })
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: 'new-lead-id' }, error: null }),
            }),
          }
        },
        not: () => Promise.resolve({ data: [] }),
      }
    },
  },
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))

// Triage mock — keyword prefilter passes by default
vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('fr'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'pass', matchedKeywords: ['location'] }),
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

const sendWhatsAppMessageMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('../lib/twilioClient.js', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
  formatWhatsAppNumber: (p) => `${p}@s.whatsapp.net`,
}))

// Lazy import AFTER mocks
const { handleInboundWhatsApp } = await import('../routes/leads.js')

// ── Helpers ──────────────────────────────────────────────────────────────────
const AGENCY_ID = 'agency-abc'
const SENDER_JID = '212612345678@s.whatsapp.net'

const makeOfferLead = (overrides = {}) => ({
  id: 'lead-offer-existing',
  sender_id: SENDER_JID,
  status: 'offer_sent',
  raw_payload: { body: 'original offer text', replies: [] },
  extracted_data: { classification: 'new_lead' },
  ...overrides,
})

function resetState() {
  _offerLead = null
  _classifyResponse = null
  _quoteIntentResponse = 'question'
  _updateCalls.length = 0
  _insertCalls.length = 0
  _waClientsByPhone = []
  _waActiveContracts = []
  sendToAgencyMock.mockClear()
  sendWhatsAppMessageMock.mockClear()
}

beforeEach(() => resetState())

// ── Regression tests ─────────────────────────────────────────────────────────

test('sender with open offer + new_lead inquiry → NEW lead inserted, existing offer untouched', async () => {
  _offerLead = makeOfferLead()
  _classifyResponse = {
    classification: 'new_lead',
    confidence: 0.95,
    summary_for_agent: 'Client veut une Audi pour août',
    extracted_data: { requested_car: 'Audi', start_date: '2026-08-01', end_date: '2026-08-31' },
  }

  await handleInboundWhatsApp(
    AGENCY_ID,
    SENDER_JID,
    null,
    'image/jpeg',
    "HELLO, i need a car for august, the whole month, i need it to be an audi or volkswagen do you have any available during that periode ?"
  )

  // A new lead row must be inserted
  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.sender_id).toBe(SENDER_JID)
  expect(_insertCalls[0].payload.extracted_data.classification).toBe('new_lead')

  // The existing offer_sent lead must NOT receive a reply update
  const offerUpdates = _updateCalls.filter(c =>
    c.payload?.status === 'accepted' ||
    c.payload?.status === 'ignored' ||
    c.payload?.raw_payload?.replies
  )
  expect(offerUpdates.length).toBe(0)
})

test('sender with open offer + prolongation → NEW lead inserted with classification=prolongation', async () => {
  _offerLead = makeOfferLead()
  _classifyResponse = {
    classification: 'prolongation',
    confidence: 0.9,
    summary_for_agent: 'Client veut prolonger de 5 jours',
    extracted_data: { requested_extra_days: 5 },
  }
  // Provide an active contract so the prolongation linkage does not downgrade
  // classification to 'new_lead' (0-contract path).
  _waClientsByPhone = [{ id: 'cli-existing' }]
  _waActiveContracts = [{ id: 'ctr-existing', client_id: 'cli-existing' }]

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'salam, je voudrais prolonger ma location de 5 jours')

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')

  const offerUpdates = _updateCalls.filter(c => c.payload?.raw_payload?.replies)
  expect(offerUpdates.length).toBe(0)
})

test('sender with open offer + "wakha" (accepted) → routes to handleOfferResponse, lead status=accepted', async () => {
  _offerLead = makeOfferLead()
  _classifyResponse = { classification: 'other', confidence: 0.6 } // Claude calls short accept "other"
  _quoteIntentResponse = 'accepted'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'wakha mwafaq')

  // The existing offer lead must be updated to accepted
  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.status).toBe('accepted')
  expect(_updateCalls[0].payload.accepted_at).toBeTruthy()

  // No new lead inserted
  expect(_insertCalls.length).toBe(0)
})

test('sender with open offer + question about offer → routes to handleOfferResponse, no new lead', async () => {
  _offerLead = makeOfferLead()
  _classifyResponse = { classification: 'other', confidence: 0.5 }
  _quoteIntentResponse = 'question'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'et avec assurance ?')

  // Offer lead updated with the question reply
  expect(_updateCalls.length).toBe(1)
  expect(_updateCalls[0].payload.raw_payload.replies[0].intent).toBe('question')

  // No new lead inserted
  expect(_insertCalls.length).toBe(0)
})

test('no active lead + new_lead classification → NEW lead inserted (regression guard)', async () => {
  _offerLead = null
  _classifyResponse = {
    classification: 'new_lead',
    confidence: 0.9,
    summary_for_agent: 'Nouvelle demande',
    extracted_data: { requested_car: 'Dacia' },
  }

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux louer une Dacia')

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')

  // No offer-response updates
  const offerUpdates = _updateCalls.filter(c => c.payload?.raw_payload?.replies)
  expect(offerUpdates.length).toBe(0)
})

test('sender with open offer + support_issue → NEW lead inserted', async () => {
  _offerLead = makeOfferLead()
  _classifyResponse = {
    classification: 'support_issue',
    confidence: 0.85,
    summary_for_agent: 'Accident',
    extracted_data: {},
  }

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', "j'ai eu un accident")

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('support_issue')
})

test('no active lead + prolongation + 1 active contract → new lead with target id set', async () => {
  _offerLead = null
  _classifyResponse = {
    classification: 'prolongation',
    confidence: 0.9,
    summary_for_agent: 'extend',
    extracted_data: { end_date: '2026-09-15' },
  }
  _waClientsByPhone = [{ id: 'cli-wa-1' }]
  _waActiveContracts = [{ id: 'ctr-wa-1', client_id: 'cli-wa-1' }]

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux prolonger jusqu\'au 15 septembre')

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBe('ctr-wa-1')
})

test('no active lead + prolongation + 0 active contracts → downgraded to new_lead, no target', async () => {
  _offerLead = null
  _classifyResponse = {
    classification: 'prolongation',
    confidence: 0.9,
    summary_for_agent: 'extend',
    extracted_data: { end_date: '2026-09-15' },
  }
  _waClientsByPhone = [{ id: 'cli-wa-1' }]
  _waActiveContracts = [] // no active contract → downgrade

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', `je veux prolonger jusqu'au 15 septembre`)

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
})
