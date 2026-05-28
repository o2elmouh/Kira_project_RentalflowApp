/**
 * @vitest-environment node
 */
import { test, expect, vi, beforeEach } from 'vitest'

let _clientsByEmail = []
let _activeContracts = []

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: (_col1, _val1) => ({
              eq: (_col2, val2) => ({
                limit: () => Promise.resolve({
                  data: _clientsByEmail.filter(c => c.email === val2),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col2, val2) => ({
                eq: () => Promise.resolve({
                  data: _activeContracts.filter(c => c.client_id === val2),
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

const { getClientStatusByEmail } = await import('../routes/leads.js')

beforeEach(() => {
  _clientsByEmail = []
  _activeContracts = []
})

test('getClientStatusByEmail returns no_contract when sender email is not on any client', async () => {
  _clientsByEmail = []
  expect(await getClientStatusByEmail('a1', 'unknown@example.com')).toBe('no_contract')
})

test('getClientStatusByEmail returns no_contract when client exists but has no active contract', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = []
  expect(await getClientStatusByEmail('a1', 'a@b.com')).toBe('no_contract')
})

test('getClientStatusByEmail returns active_contract when client has one active contract', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]
  expect(await getClientStatusByEmail('a1', 'a@b.com')).toBe('active_contract')
})
