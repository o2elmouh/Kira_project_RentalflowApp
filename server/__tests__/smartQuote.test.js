/**
 * Smart Quote — unit tests
 * Runner: Vitest (converted from node:test)
 *
 * Tests analyzeQuoteReply() with Darija, French, and ambiguous phrases.
 *
 * @vitest-environment node
 */

import { test, expect, vi, beforeEach } from 'vitest'

// Must be set before the module is imported so the early-exit guard is bypassed
process.env.ANTHROPIC_API_KEY = 'test-key'

// ── Controllable mock reply ───────────────────────────────────────────────────
let _mockReplyText = '{"intent":"accepted"}'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: _mockReplyText }] }),
      }
    }
  },
}))

// Stub supabaseAdmin so leads.js loads without real credentials
vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
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
  preFilter: vi.fn().mockReturnValue(true),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
}))
vi.mock('../lib/conversation.js', () => ({
  appendConversation: vi.fn().mockResolvedValue(undefined),
}))

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
  expect(result).toBe('accepted')
})

test('Darija rejection: "ghali bzaf" → rejected', async () => {
  mockIntent('rejected')
  const result = await analyzeQuoteReply('ghali bzaf, la chokran')
  expect(result).toBe('rejected')
})

test('French question: price negotiation → question', async () => {
  mockIntent('question')
  const result = await analyzeQuoteReply('Vous pouvez faire un prix ?')
  expect(result).toBe('question')
})

test('Unknown intent string falls back to "question"', async () => {
  _mockReplyText = '{"intent":"banana"}'
  const result = await analyzeQuoteReply('some random text')
  expect(result).toBe('question')
})

test('Claude JSON parse failure falls back to "question"', async () => {
  _mockReplyText = 'NOT JSON AT ALL'
  const result = await analyzeQuoteReply('some text')
  expect(result).toBe('question')
})
