import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiModule from '../../../lib/api'
import * as dbModule from '../../../lib/db'

import { useClients } from '../../hooks/useClients'
import { useFleet } from '../../hooks/useFleet'
import { useContracts } from '../../hooks/useContracts'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('list hooks (clients / fleet / contracts)', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  it('useClients hook fetches on mount and caches', async () => {
    const payload = [{ id: 'c1' }]
    vi.spyOn(apiModule.api, 'getClients').mockResolvedValue(payload)
    const { result, unmount } = renderHook(() => useClients(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual(payload))
    expect(apiModule.api.getClients).toHaveBeenCalledTimes(1)
    unmount()
    renderHook(() => useClients(), { wrapper: wrap(qc) })
    // cache hit
    expect(apiModule.api.getClients).toHaveBeenCalledTimes(1)
  })

  it('useFleet hook fetches on mount and caches', async () => {
    const payload = [{ id: 'v1' }]
    vi.spyOn(dbModule, 'getFleet').mockResolvedValue(payload)
    const { result, unmount } = renderHook(() => useFleet(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual(payload))
    expect(dbModule.getFleet).toHaveBeenCalledTimes(1)
    unmount()
    renderHook(() => useFleet(), { wrapper: wrap(qc) })
    // cache hit
    expect(dbModule.getFleet).toHaveBeenCalledTimes(1)
  })

  it('useContracts hook fetches on mount and caches', async () => {
    const payload = [{ id: 'k1' }]
    vi.spyOn(dbModule, 'getContracts').mockResolvedValue(payload)
    const { result, unmount } = renderHook(() => useContracts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual(payload))
    expect(dbModule.getContracts).toHaveBeenCalledTimes(1)
    unmount()
    renderHook(() => useContracts(), { wrapper: wrap(qc) })
    // cache hit
    expect(dbModule.getContracts).toHaveBeenCalledTimes(1)
  })

  it('useClients exposes invalidate helper for mutations', async () => {
    vi.spyOn(apiModule.api, 'getClients').mockResolvedValue([{ id: 'c1' }])
    const { result } = renderHook(() => useClients(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(typeof result.current.invalidate).toBe('function')
    vi.spyOn(apiModule.api, 'getClients').mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
    await act(async () => {
      await result.current.invalidate()
    })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
  })
})
