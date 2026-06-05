import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getLeadsMock  = vi.fn()
const getAlertsMock = vi.fn()

vi.mock('../../../lib/api.js', () => ({
  api: {
    getLeads:  (...a) => getLeadsMock(...a),
    getAlerts: (...a) => getAlertsMock(...a),
  },
}))

import { useSidebarCounts } from '../../hooks/useSidebarCounts'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSidebarCounts', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getLeadsMock.mockReset()
    getAlertsMock.mockReset()
  })

  it('returns sum of pending leads + alerts', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }, { id: 'L2' }])
    getAlertsMock.mockResolvedValue([{ id: 'A1' }])
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.total).toBe(3))  // 2 leads + 1 alert
  })

  it('exposes individual counts', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }, { id: 'L2' }])
    getAlertsMock.mockResolvedValue([{ id: 'A1' }])
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toBe(2))
    expect(result.current.alerts).toBe(1)
  })
})
