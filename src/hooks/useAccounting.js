import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAccounts,
  getTransactions,
  getJournalEntries,
  getDeposits,
} from '../../lib/db'

// Accounting data changes rarely (chart of accounts) or transactionally
// (journal/transactions/deposits) — 60s stale time matches Fleet / Contracts.
// Mutations should call the matching `invalidate()` on the returned hook.

export function useAccounts() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['accounts'],
    queryFn:  getAccounts,
    staleTime: 5 * 60_000, // chart of accounts rarely changes — long TTL
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: ['accounts'] }) }
}

export function useTransactions() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['transactions'],
    queryFn:  getTransactions,
    staleTime: 60_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: ['transactions'] }) }
}

export function useJournalEntries() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['journal_entries'],
    queryFn:  getJournalEntries,
    staleTime: 60_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: ['journal_entries'] }) }
}

export function useDeposits() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['deposits'],
    queryFn:  getDeposits,
    staleTime: 60_000,
  })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: ['deposits'] }) }
}
