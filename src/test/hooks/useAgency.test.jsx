import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as dbModule from '../../../lib/db'

import { useAgency } from '../../hooks/useAgency'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAgency', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  it('calls getAgency once on mount and returns the row', async () => {
    vi.spyOn(dbModule, 'getAgency').mockResolvedValue({ id: 'a1', name: 'Test Agency' })
    const { result } = renderHook(() => useAgency(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ id: 'a1', name: 'Test Agency' })
    expect(dbModule.getAgency).toHaveBeenCalledTimes(1)
  })

  it('does NOT refetch on remount within staleTime', async () => {
    vi.spyOn(dbModule, 'getAgency').mockResolvedValue({ id: 'a1', name: 'A' })
    const { unmount } = renderHook(() => useAgency(), { wrapper: wrap(qc) })
    await waitFor(() => expect(dbModule.getAgency).toHaveBeenCalledTimes(1))
    unmount()
    renderHook(() => useAgency(), { wrapper: wrap(qc) })
    // cache hit — getAgency NOT called again
    expect(dbModule.getAgency).toHaveBeenCalledTimes(1)
  })
})
