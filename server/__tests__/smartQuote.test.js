/**
 * Smart Quote — unit tests
 * Runner: Node native test runner (node:test)  ESM-native, no Jest config needed.
 * Run: node --experimental-test-module-mocks --test server/__tests__/smartQuote.test.js
 *
 * Tests analyzeQuoteReply() with Darija, French, and ambiguous phrases.
 */

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Must be set before the module is imported so the early-exit guard is bypassed
process.env.ANTHROPIC_API_KEY = 'test-key'

// ── Controllable mock reply ───────────────────────────────────────────────────
let _mockReplyText = '{"intent":"accepted"}'

mock.module('@anthropic-ai/sdk', {
  namedExports: {},
  defaultExport: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: _mockReplyText }] }),
      }
    }
  },
})

// Stub supabaseAdmin so leads.js loads without real credentials
mock.module('../lib/supabaseAdmin.js', {
  defaultExport: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({ eq: () => Promise.resolve({}) }),
      }),
    }),
  },
})

// Lazy import AFTER mocks are registered
const { analyzeQuoteReply } = await import('../routes/leads.js')

// ── Helper ────────────────────────────────────────────────────────────────────
function mockIntent(intent) {
  _mockReplyText = JSON.stringify({ intent })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('Darija acceptance: "wakha mwafaq" → accepted', async () => {
  mockIntent('accepted')
  const result = await analyzeQuoteReply('wakha mzyan, ana mwafaq')
  assert.equal(result, 'accepted')
})

test('Darija rejection: "ghali bzaf" → rejected', async () => {
  mockIntent('rejected')
  const result = await analyzeQuoteReply('ghali bzaf, la chokran')
  assert.equal(result, 'rejected')
})

test('French question: price negotiation → question', async () => {
  mockIntent('question')
  const result = await analyzeQuoteReply('Vous pouvez faire un prix ?')
  assert.equal(result, 'question')
})

test('Unknown intent string falls back to "question"', async () => {
  _mockReplyText = '{"intent":"banana"}'
  const result = await analyzeQuoteReply('some random text')
  assert.equal(result, 'question')
})

test('Claude JSON parse failure falls back to "question"', async () => {
  _mockReplyText = 'NOT JSON AT ALL'
  const result = await analyzeQuoteReply('some text')
  assert.equal(result, 'question')
})
