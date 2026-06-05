import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getLeadsMock         = vi.fn()
const getAlertsMock        = vi.fn()
const updateLeadStatusMock = vi.fn()

vi.mock('../../../lib/api.js', () => ({
  api: {
    getLeads:          (...a) => getLeadsMock(...a),
    getAlerts:         (...a) => getAlertsMock(...a),
    updateLeadStatus:  (...a) => updateLeadStatusMock(...a),
    escalateAlert:     vi.fn(),
  },
}))

import { useLeads } from '../../../hooks/useLeads'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useLeads', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getLeadsMock.mockReset(); getAlertsMock.mockReset(); updateLeadStatusMock.mockReset()
  })

  it('fetches leads when activeTab=leads', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    const { result } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toHaveLength(1))
    expect(getLeadsMock).toHaveBeenCalledWith('pending')
    expect(getAlertsMock).not.toHaveBeenCalled()
  })

  it('fetches alerts when activeTab=alertes', async () => {
    getAlertsMock.mockResolvedValue([{ id: 'A1' }])
    const { result } = renderHook(() => useLeads('alertes', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.alerts).toHaveLength(1))
    expect(getLeadsMock).not.toHaveBeenCalled()
  })

  it('caches by (activeTab, statusFilter) key', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    const { unmount } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(getLeadsMock).toHaveBeenCalledTimes(1))
    unmount()
    renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    expect(getLeadsMock).toHaveBeenCalledTimes(1)  // cache hit
  })

  it('invalidates after handleStatusChange', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    updateLeadStatusMock.mockResolvedValue({})
    const { result } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toHaveLength(1))
    getLeadsMock.mockResolvedValue([])
    await result.current.handleStatusChange('L1', 'ignored')
    await waitFor(() => expect(result.current.leads).toHaveLength(0))
    expect(updateLeadStatusMock).toHaveBeenCalledWith('L1', 'ignored')
  })
})
