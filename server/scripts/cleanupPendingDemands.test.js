import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanupPendingDemands } from './cleanupPendingDemands.js'

class QB {
  constructor(result) {
    this._r = result
    for (const m of ['select', 'not', 'is', 'eq', 'neq', 'gte', 'update']) {
      this[m] = vi.fn().mockReturnValue(this)
    }
  }
  then(resolve, reject) {
    return Promise.resolve(this._r).then(resolve, reject)
  }
}

let db

beforeEach(() => {
  db = { from: vi.fn() }
})

describe('cleanupPendingDemands', () => {
  it('returns 0 when no demands have extracted_data', async () => {
    db.from.mockReturnValue(new QB({ data: [], error: null }))
    const result = await cleanupPendingDemands(db)
    expect(result.anonymized).toBe(0)
  })

  it('throws when the initial fetch fails', async () => {
    db.from.mockReturnValue(new QB({ data: null, error: { message: 'DB error' } }))
    await expect(cleanupPendingDemands(db)).rejects.toThrow('fetch demands: DB error')
  })

  it('skips demand when no matching client found', async () => {
    const demand = { id: 'd1', sender_id: '+212600000001', source: 'whatsapp', agency_id: 'ag1' }
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(new QB({ data: [], error: null }))
    const result = await cleanupPendingDemands(db)
    expect(result.anonymized).toBe(0)
  })

  it('skips demand when client has open contracts', async () => {
    const demand = { id: 'd1', sender_id: '+212600000001', source: 'whatsapp', agency_id: 'ag1' }
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(new QB({ data: [{ id: 'c1' }], error: null }))
      .mockReturnValueOnce(new QB({ data: [{ id: 'ct1' }], error: null }))
    const result = await cleanupPendingDemands(db)
    expect(result.anonymized).toBe(0)
  })

  it('skips demand when client has recently closed contract (< 30 days)', async () => {
    const demand = { id: 'd1', sender_id: '+212600000001', source: 'whatsapp', agency_id: 'ag1' }
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(new QB({ data: [{ id: 'c1' }], error: null }))
      .mockReturnValueOnce(new QB({ data: [], error: null }))
      .mockReturnValueOnce(new QB({ data: [{ id: 'ct1' }], error: null }))
    const result = await cleanupPendingDemands(db)
    expect(result.anonymized).toBe(0)
  })

  it('anonymizes demand when all contracts closed > 30 days ago', async () => {
    const demand = { id: 'd1', sender_id: '+212600000001', source: 'whatsapp', agency_id: 'ag1' }
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(new QB({ data: [{ id: 'c1' }], error: null }))
      .mockReturnValueOnce(new QB({ data: [], error: null }))
      .mockReturnValueOnce(new QB({ data: [], error: null }))
      .mockReturnValueOnce(new QB({ data: null, error: null }))
    const result = await cleanupPendingDemands(db)
    expect(result.anonymized).toBe(1)
  })

  it('matches gmail demand by email field', async () => {
    const demand = { id: 'd1', sender_id: 'test@example.com', source: 'gmail', agency_id: 'ag1' }
    const clientsQB = new QB({ data: [], error: null })
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(clientsQB)
    await cleanupPendingDemands(db)
    expect(clientsQB.eq).toHaveBeenCalledWith('email', 'test@example.com')
  })

  it('matches whatsapp demand by phone field', async () => {
    const demand = { id: 'd1', sender_id: '+212600000001', source: 'whatsapp', agency_id: 'ag1' }
    const clientsQB = new QB({ data: [], error: null })
    db.from
      .mockReturnValueOnce(new QB({ data: [demand], error: null }))
      .mockReturnValueOnce(clientsQB)
    await cleanupPendingDemands(db)
    expect(clientsQB.eq).toHaveBeenCalledWith('phone', '+212600000001')
  })
})
