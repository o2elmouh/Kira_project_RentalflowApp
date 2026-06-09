import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInvoices } from '../../lib/db'

const QUERY_KEY = ['invoices']

/**
 * Fetch all invoices for the current agency. Invoices change whenever a
 * contract is finalized or an invoice is manually edited. 60s stale time
 * matches the other list hooks.
 *
 * To invalidate after invoice mutations:
 *   queryClient.invalidateQueries({ queryKey: ['invoices'] })
 */
export function useInvoices() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: QUERY_KEY, queryFn: getInvoices, staleTime: 60_000 })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
