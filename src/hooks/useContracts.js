import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../../lib/db'

const QUERY_KEY = ['contracts']

/**
 * Fetch all contracts (active rentals + history) for the current agency.
 * Contracts are frequently accessed and can change on every rental/restitution,
 * so we use a shorter stale time of 30s for better freshness.
 *
 * To invalidate after contract mutations (create rental, close rental, etc.):
 *   queryClient.invalidateQueries({ queryKey: ['contracts'] })
 */
export function useContracts() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getContracts,
    staleTime: 30_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
