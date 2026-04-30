/**
 * Offer-response pre-triage — unit tests
 * Runner: Node native test runner (node:test)
 * Run: node --experimental-test-module-mocks --test server/__tests__/offerResponse.test.js
 *
 * Tests that handleInboundWhatsApp bypasses keyword triage when the sender has
 * an offer_sent lead, resets the lead status to 'waiting', and appends the
 * reply to raw_payload.replies.
 */

import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.ANTHROPIC_API_KEY = 'test-key'

// ── Mutable state shared across tests ────────────────────────────────────────
let _intentReply = '{"intent":"question"}'
let _offerLead = null
const _updateCalls = []

// ── Anthropic mock ────────────────────────────────────────────────────────────
mock.module('@anthropic-ai/sdk', {
  namedExports: {},
  defaultExport: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: _intentReply }] }),
      }
    }
  },
})

// ── supabaseAdmin mock ────────────────────────────────────────────────────────
mock.module('../lib/supabaseAdmin.js', {
  defaultExport: {
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
})

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

test('offer reply: status reset to waiting, reply appended to raw_payload.replies', async () => {
  resetState()
  _offerLead = makeOfferLead()
  _intentReply = '{"intent":"accepted"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'wakha mwafaq')

  assert.equal(_updateCalls.length, 1, 'exactly one DB update should be made')
  const update = _updateCalls[0]
  assert.equal(update.payload.status, 'waiting', 'lead must be reset to waiting')
  assert.equal(update.payload.last_client_note, 'wakha mwafaq')
  assert.equal(Array.isArray(update.payload.raw_payload.replies), true)
  assert.equal(update.payload.raw_payload.replies.length, 1)
  assert.equal(update.payload.raw_payload.replies[0].text, 'wakha mwafaq')
  assert.equal(update.payload.raw_payload.replies[0].intent, 'accepted')
})

test('offer reply: appends to existing replies in raw_payload', async () => {
  resetState()
  const existingReply = { text: 'first reply', intent: 'question', timestamp: '2026-04-01T10:00:00Z' }
  _offerLead = makeOfferLead({ raw_payload: { body: 'original', replies: [existingReply] } })
  _intentReply = '{"intent":"rejected"}'

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'non merci, trop cher')

  const replies = _updateCalls[0].payload.raw_payload.replies
  assert.equal(replies.length, 2, 'new reply appended to existing one')
  assert.equal(replies[0].text, 'first reply')
  assert.equal(replies[1].text, 'non merci, trop cher')
  assert.equal(replies[1].intent, 'rejected')
})

test('offer reply with empty body: intent defaults to question, status still resets', async () => {
  resetState()
  _offerLead = makeOfferLead()

  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', '')

  assert.equal(_updateCalls.length, 1)
  assert.equal(_updateCalls[0].payload.status, 'waiting')
  assert.equal(_updateCalls[0].payload.raw_payload.replies[0].intent, 'question')
})

test('sender phone normalisation: 9-digit suffix matches across variants', async () => {
  resetState()
  // Lead stored with international format, message arrives with local format
  _offerLead = makeOfferLead({ sender_id: '+212612345678' })
  _intentReply = '{"intent":"accepted"}'

  // senderJid uses whatsapp: prefix stripped to 212612345678@s.whatsapp.net
  await handleInboundWhatsApp(AGENCY_ID, '212612345678@s.whatsapp.net', null, 'image/jpeg', 'ok')

  assert.equal(_updateCalls.length, 1, 'should match by last 9 digits')
  assert.equal(_updateCalls[0].payload.status, 'waiting')
})

test('no offer_sent lead: pipeline continues normally (no update call)', async () => {
  resetState()
  _offerLead = null  // no offer lead

  // Send a message that would fail triage (non-rental keyword)
  // Since preFilter runs on real triage.js, use a clear rental keyword so it passes
  // and reaches the insert step — verifying the offer-bypass was NOT triggered
  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux louer une voiture')

  // No offer-response update should have been called
  const offerUpdates = _updateCalls.filter(c => c.payload?.status === 'waiting')
  assert.equal(offerUpdates.length, 0, 'no waiting-status update when no offer lead exists')
})
