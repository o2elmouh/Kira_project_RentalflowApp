import { useQuery } from '@tanstack/react-query'
import { getAgency } from '../../lib/db'

/**
 * Single-row agency fetch. The row changes maybe once a week (only via the
 * Settings → Agence form), so 5-min stale time is conservative-but-fresh.
 *
 * To invalidate after `api.updateAgency()`:
 *   queryClient.invalidateQueries({ queryKey: ['agency'] })
 */
export function useAgency() {
  return useQuery({
    queryKey: ['agency'],
    queryFn: () => getAgency(),
    staleTime: 5 * 60_000,
  })
}
