// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the shared anonymize helper so we can assert on call shape without
// reimplementing the full client + audit_log mock chain in every test.
const mockAnonymize = vi.fn().mockResolvedValue({ ok: true })
vi.mock('../lib/anonymize.js', () => ({ anonymizeClient: (...args) => mockAnonymize(...args) }))

// Default Supabase admin stub — overridden per test via db.from mock chain.
vi.mock('../lib/supabaseAdmin.js', () => ({ default: { from: vi.fn() } }))

const { enforceRetention } = await import('./enforceRetention.js')

/**
 * Minimal chainable query-builder stub matching the subset of methods
 * enforceRetention.js uses: select, eq, is, order, limit, maybeSingle.
 * Resolves to `_r` when awaited (via thenable contract).
 */
class QB {
  constructor(result) {
    this._r = result
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
      this[m] = vi.fn().mockReturnValue(this)
    }
    this.maybeSingle = vi.fn().mockResolvedValue(result)
  }
  then(resolve, reject) {
    return Promise.resolve(this._r).then(resolve, reject)
  }
}

let db

beforeEach(() => {
  db = { from: vi.fn() }
  mockAnonymize.mockClear()
  mockAnonymize.mockResolvedValue({ ok: true })
})

// Helper: build the standard 4-call sequence for one agency's loop:
//   1) agencies select
//   2) profiles select (admin actor)
//   3) clients select (non-anonymized)
//   4..) contracts select (one per client)
function seedAgencyLoop({ agencies, actor, clients, contractsByClient }) {
  // 1) agencies
  db.from.mockReturnValueOnce(new QB({ data: agencies, error: null }))
  // 2) admin actor lookup (uses maybeSingle, not then)
  const actorQB = new QB({ data: actor, error: null })
  db.from.mockReturnValueOnce(actorQB)
  // 3) clients
  db.from.mockReturnValueOnce(new QB({ data: clients, error: null }))
  // 4..) per-client contracts
  for (const client of clients) {
    db.from.mockReturnValueOnce(new QB({ data: contractsByClient[client.id] || [], error: null }))
  }
}

describe('enforceRetention', () => {
  it('returns 0 when there are no agencies', async () => {
    db.from.mockReturnValueOnce(new QB({ data: [], error: null }))
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('throws when the agencies fetch fails', async () => {
    db.from.mockReturnValueOnce(new QB({ data: null, error: { message: 'DB down' } }))
    await expect(enforceRetention(db)).rejects.toThrow('fetch agencies: DB down')
  })

  it('skips agency when no admin profile exists', async () => {
    db.from.mockReturnValueOnce(new QB({ data: [{ id: 'ag1', retention_years: 10 }], error: null }))
    db.from.mockReturnValueOnce(new QB({ data: null, error: null }))                 // no admin actor
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)
    expect(result.byAgency.ag1.skipped).toBe('no_admin')
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('skips client whose contract is still open', async () => {
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 10 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [{ status: 'active', closed_at: null }],
      },
    })
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('skips client whose most recent close is within retention window', async () => {
    const recent = new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000).toISOString()  // 5 yrs ago
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 10 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [{ status: 'closed', closed_at: recent }],
      },
    })
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('anonymizes client when every contract is closed > retention_years ago', async () => {
    const ancient = new Date(Date.now() - 12 * 365 * 24 * 3600 * 1000).toISOString() // 12 yrs ago
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 10 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [{ status: 'closed', closed_at: ancient }],
      },
    })
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(1)
    expect(mockAnonymize).toHaveBeenCalledTimes(1)
    expect(mockAnonymize).toHaveBeenCalledWith(expect.objectContaining({
      clientId:    'c1',
      agencyId:    'ag1',
      actorUserId: 'admin-1',
      action:      'client.anonymize.retention',
    }))
  })

  it('skips client whose contracts have missing closed_at (defensive)', async () => {
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 10 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [{ status: 'closed', closed_at: null }],
      },
    })
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('respects per-agency retention_years (5 vs 30)', async () => {
    const sevenYearsAgo = new Date(Date.now() - 7 * 365 * 24 * 3600 * 1000).toISOString()
    // agency ag1 retention=5 → 7yrs is past → anonymize
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 5 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [{ status: 'closed', closed_at: sevenYearsAgo }],
      },
    })
    const r1 = await enforceRetention(db)
    expect(r1.anonymized).toBe(1)

    mockAnonymize.mockClear()
    db.from = vi.fn()

    // agency ag2 retention=30 → 7yrs is within → skip
    seedAgencyLoop({
      agencies: [{ id: 'ag2', retention_years: 30 }],
      actor:    { id: 'admin-2' },
      clients:  [{ id: 'c2' }],
      contractsByClient: {
        c2: [{ status: 'closed', closed_at: sevenYearsAgo }],
      },
    })
    const r2 = await enforceRetention(db)
    expect(r2.anonymized).toBe(0)
  })

  it('uses the latest closed_at when client has multiple closed contracts', async () => {
    const old     = new Date(Date.now() - 15 * 365 * 24 * 3600 * 1000).toISOString()
    const recent  = new Date(Date.now() -  3 * 365 * 24 * 3600 * 1000).toISOString()
    seedAgencyLoop({
      agencies: [{ id: 'ag1', retention_years: 10 }],
      actor:    { id: 'admin-1' },
      clients:  [{ id: 'c1' }],
      contractsByClient: {
        c1: [
          { status: 'closed', closed_at: old },
          { status: 'closed', closed_at: recent },
        ],
      },
    })
    const result = await enforceRetention(db)
    expect(result.anonymized).toBe(0)   // recent one is within window → skip
  })
})
