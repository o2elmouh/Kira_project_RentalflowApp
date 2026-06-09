import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getFleet } from '../../lib/db'

const QUERY_KEY = ['fleet']

/**
 * Fetch all vehicles (fleet) for the current agency. Fleet data changes whenever
 * a vehicle is added, updated, or deleted (Fleet page). 60s stale time balances
 * freshness with caching benefits.
 *
 * To invalidate after vehicle mutations:
 *   queryClient.invalidateQueries({ queryKey: ['fleet'] })
 */
export function useFleet() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getFleet,
    staleTime: 60_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
