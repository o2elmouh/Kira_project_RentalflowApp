import { QueryClient } from '@tanstack/react-query'

/**
 * Single shared QueryClient instance.
 *
 * - staleTime 30s: reservations don't change every second; avoid hammering the API
 *   on remounts.
 * - retry 1: tolerate transient network blips without long delays.
 * - refetchOnWindowFocus disabled: prevents jarring refetches when the user
 *   alt-tabs back to the table; manual `invalidateQueries` after mutations
 *   keeps data fresh.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
