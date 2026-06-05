import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

const QUERY_KEY = ['clients']

/**
 * Fetch all clients for the current agency. Clients are read rarely and change
 * infrequently (only via Clients page), so 60s stale time is appropriate.
 *
 * To invalidate after creating/updating a client:
 *   queryClient.invalidateQueries({ queryKey: ['clients'] })
 */
export function useClients() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: api.getClients,
    staleTime: 60_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
