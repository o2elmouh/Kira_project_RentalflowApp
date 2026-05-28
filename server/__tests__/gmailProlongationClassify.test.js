/**
 * @vitest-environment node
 */
import { test, expect, vi, beforeEach } from 'vitest'

process.env.ANTHROPIC_API_KEY = 'test-key'

let _classifyResponse = { classification: 'prolongation', confidence: 0.9, summary_for_agent: 'extension', extracted_data: { end_date: '2026-09-15' } }
let _clientsByEmail = []
let _activeContracts = []
const _insertCalls = []

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: JSON.stringify(_classifyResponse) }] }),
      }
    }
  },
}))

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col, val) => ({
                limit: () => Promise.resolve({ data: _clientsByEmail.filter(c => c.email === val) }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        const buildTerminal = (clientId) => {
          const data = _activeContracts.filter(c => c.client_id === clientId)
          const payload = { data }
          return { then: (r) => r(payload), order: () => Promise.resolve(payload) }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => buildTerminal(_clientsByEmail[0]?.id),
              }),
            }),
          }),
        }
      }
      if (table === 'pending_demands') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
              }),
            }),
          }),
          insert: (payload) => {
            _insertCalls.push({ payload })
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'new-id' }, error: null }) }) }
          },
        }
      }
      return {}
    },
  },
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))
vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('fr'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'pass', matchedKeywords: ['location'] }),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
  detectMissingDocs: vi.fn().mockReturnValue({ needsCIN: true, needsPermis: true }),
}))
vi.mock('../lib/conversation.js', () => ({ appendConversation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/pushNotifications.js', () => ({ sendToAgency: vi.fn().mockResolvedValue(undefined) }))

const express = (await import('express')).default
const supertest = (await import('supertest')).default
const leadsRouter = (await import('../routes/leads.js')).default

const app = express()
app.use(express.json())
process.env.INTERNAL_WEBHOOK_SECRET = 'test-secret'
app.use('/leads', leadsRouter)

beforeEach(() => {
  _classifyResponse = { classification: 'prolongation', confidence: 0.9, summary_for_agent: 'extension', extracted_data: { end_date: '2026-09-15' } }
  _clientsByEmail = []
  _activeContracts = []
  _insertCalls.length = 0
})

test('prolongation + matched client + 1 active contract → lead has prolongation_target_contract_id', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]

  const res = await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(res.status).toBe(200)
  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBe('ctr-1')
})

test('prolongation + no active contract → downgraded to new_lead, no target', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = []

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
})

test('prolongation + 2 active contracts → target null, candidates stored in extracted_data', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [
    { id: 'ctr-1', client_id: 'cli-1' },
    { id: 'ctr-2', client_id: 'cli-1' },
  ]

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
  expect(_insertCalls[0].payload.extracted_data.prolongation_candidates).toEqual(['ctr-1', 'ctr-2'])
})

test('non-prolongation classification → no target set, unchanged behavior', async () => {
  _classifyResponse = { classification: 'new_lead', confidence: 0.9, summary_for_agent: 'wants car', extracted_data: { requested_car: 'Audi' } }
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'rent', bodyText: 'je veux louer une voiture', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
})
