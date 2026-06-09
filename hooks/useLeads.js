import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../lib/api.js'

export function useLeads(activeTab, statusFilter) {
  const qc = useQueryClient()

  const isAlerts = activeTab === 'alertes'

  const q = useQuery({
    queryKey: isAlerts ? ['alerts'] : ['leads', statusFilter],
    queryFn:  isAlerts ? api.getAlerts : () => api.getLeads(statusFilter),
    staleTime: 15_000,
  })

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['leads']  }),
      qc.invalidateQueries({ queryKey: ['alerts'] }),
    ])
  }, [qc])

  const handleStatusChange = useCallback(async (id, status) => {
    await api.updateLeadStatus(id, status)
    await invalidateAll()
  }, [invalidateAll])

  const handleEscalate = useCallback(async (id) => {
    await api.escalateAlert(id)
    await invalidateAll()
  }, [invalidateAll])

  const handleIgnoreAlert = useCallback(async (id) => {
    await api.updateLeadStatus(id, 'ignored')
    await invalidateAll()
  }, [invalidateAll])

  return {
    leads:   isAlerts ? [] : (q.data || []),
    alerts:  isAlerts ? (q.data || []) : [],
    loading: q.isLoading,
    error:   q.error?.message || null,
    load:    invalidateAll,        // keep old API name so pages/Basket.jsx doesn't break
    handleStatusChange,
    handleEscalate,
    handleIgnoreAlert,
  }
}
