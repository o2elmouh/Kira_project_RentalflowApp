/**
 * Unit tests for purgeSignedPdfs.
 * Run: npx vitest run server/__tests__/purgeSignedPdfs.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

let purgeSignedPdfs
let mockRpc, mockRemove

beforeEach(async () => {
  vi.resetModules()
  mockRpc    = vi.fn()
  mockRemove = vi.fn().mockResolvedValue({ error: null })
  vi.doMock('../lib/supabaseAdmin.js', () => ({
    default: {
      rpc: mockRpc,
      storage: { from: () => ({ remove: mockRemove }) },
    },
  }))
  purgeSignedPdfs = (await import('../scripts/purgeSignedPdfs.js')).purgeSignedPdfs
})

describe('purgeSignedPdfs', () => {
  it('returns purged:0 when no stale rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const out = await purgeSignedPdfs()
    expect(out).toEqual({ purged: 0 })
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('returns error when RPC fails — does not throw', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const out = await purgeSignedPdfs()
    expect(out.purged).toBe(0)
    expect(out.error).toBe('boom')
  })

  it('removes the storage objects returned by the RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { contract_id: 'c1', pdf_path: 'c1/signed.pdf' },
        { contract_id: 'c2', pdf_path: 'c2/signed.pdf' },
      ],
      error: null,
    })
    const out = await purgeSignedPdfs()
    expect(out.purged).toBe(2)
    expect(mockRemove).toHaveBeenCalledTimes(1)
    expect(mockRemove).toHaveBeenCalledWith(['c1/signed.pdf', 'c2/signed.pdf'])
  })

  it('skips rows with null pdf_path safely', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { contract_id: 'c1', pdf_path: 'c1/signed.pdf' },
        { contract_id: 'c2', pdf_path: null },
      ],
      error: null,
    })
    const out = await purgeSignedPdfs()
    expect(out.purged).toBe(2)
    expect(mockRemove).toHaveBeenCalledWith(['c1/signed.pdf'])
  })

  it('chunks storage delete calls into batches of 500', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      contract_id: `c${i}`, pdf_path: `c${i}/signed.pdf`,
    }))
    mockRpc.mockResolvedValue({ data: rows, error: null })
    const out = await purgeSignedPdfs()
    expect(out.purged).toBe(1200)
    // 1200 / 500 = 3 chunks
    expect(mockRemove).toHaveBeenCalledTimes(3)
    expect(mockRemove.mock.calls[0][0]).toHaveLength(500)
    expect(mockRemove.mock.calls[1][0]).toHaveLength(500)
    expect(mockRemove.mock.calls[2][0]).toHaveLength(200)
  })

  it('records storage errors but continues processing chunks', async () => {
    mockRemove
      .mockResolvedValueOnce({ error: { message: 'chunk1 failed' } })
      .mockResolvedValueOnce({ error: null })
    const rows = Array.from({ length: 600 }, (_, i) => ({
      contract_id: `c${i}`, pdf_path: `c${i}/signed.pdf`,
    }))
    mockRpc.mockResolvedValue({ data: rows, error: null })
    const out = await purgeSignedPdfs()
    expect(out.purged).toBe(600)
    expect(out.errors).toEqual(['chunk1 failed'])
  })
})
