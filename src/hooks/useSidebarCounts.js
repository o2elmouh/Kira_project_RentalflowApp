import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.js'

/**
 * Sidebar badge counts. The previous setInterval(1s) generated ~3600 req/hr/session
 * which scales linearly with active agents. We replace with:
 *   - TanStack Query staleTime 10s (still feels live to humans)
 *   - refetchInterval 10s as a poll fallback
 *
 * Mutations elsewhere (Basket page actions, LeadModal ignore, etc.) call
 * queryClient.invalidateQueries(['leads' | 'alerts']) which surfaces here too.
 *
 * Realtime channel wiring is left for a follow-up — the polling at 10s is
 * already a 10× reduction in load vs. the prior 1s interval.
 */
export function useSidebarCounts() {
  const leadsQ = useQuery({
    queryKey: ['leads', 'pending'],
    queryFn:  () => api.getLeads('pending'),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn:  api.getAlerts,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })

  const leads  = (leadsQ.data  || []).length
  const alerts = (alertsQ.data || []).length

  return { leads, alerts, total: leads + alerts }
}
