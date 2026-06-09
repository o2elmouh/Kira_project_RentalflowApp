import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as dbModule from '../../../lib/db'

import {
  useAccounts,
  useTransactions,
  useJournalEntries,
  useDeposits,
} from '../../hooks/useAccounting'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAccounting hooks', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  it('useAccounts returns the chart of accounts and caches across mounts', async () => {
    vi.spyOn(dbModule, 'getAccounts').mockResolvedValue([
      { code: '1100', name: 'Créances clients' },
      { code: '3000', name: 'CA Location' },
    ])
    const { result, unmount } = renderHook(() => useAccounts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    unmount()
    renderHook(() => useAccounts(), { wrapper: wrap(qc) })
    expect(dbModule.getAccounts).toHaveBeenCalledTimes(1) // cache hit on remount
  })

  it('useJournalEntries calls getJournalEntries once and exposes invalidate', async () => {
    vi.spyOn(dbModule, 'getJournalEntries').mockResolvedValue([{ id: 'j1' }])
    const { result } = renderHook(() => useJournalEntries(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'j1' }]))
    expect(typeof result.current.invalidate).toBe('function')
    expect(dbModule.getJournalEntries).toHaveBeenCalledTimes(1)
  })

  it('useTransactions returns the transactions list', async () => {
    vi.spyOn(dbModule, 'getTransactions').mockResolvedValue([{ id: 't1', reference: 'TXN-A' }])
    const { result } = renderHook(() => useTransactions(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data[0].reference).toBe('TXN-A')
  })

  it('useDeposits returns the deposits list', async () => {
    vi.spyOn(dbModule, 'getDeposits').mockResolvedValue([{ id: 'd1', status: 'held' }])
    const { result } = renderHook(() => useDeposits(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'd1', status: 'held' }]))
  })
})
