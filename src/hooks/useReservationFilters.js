import { useState, useCallback } from 'react'

/**
 * Filter state for the Booking Hub.
 *
 * Single source of truth for all filter/sort/page state — keeps the page
 * component tiny and lets `useReservations` re-run automatically when
 * any filter changes (queryKey is the whole filters object).
 *
 * Behavior:
 *   - Changing any non-pagination filter resets `page` to 1 (so the user
 *     never lands on an empty page after narrowing the result set).
 *   - `reset()` clears everything back to defaults.
 */
const DEFAULT = {
  source:    'all',
  status:    'all',
  search:    '',
  dateFrom:  '',
  dateTo:    '',
  priceMin:  '',
  priceMax:  '',
  sort:      'created_at',
  order:     'desc',
  page:      1,
  pageSize:  25,
}

export function useReservationFilters(initial = {}) {
  const [filters, setFilters] = useState({ ...DEFAULT, ...initial })

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Any filter change (other than pagination itself) jumps back to page 1
      ...(key !== 'page' && key !== 'pageSize' ? { page: 1 } : {}),
    }))
  }, [])

  const reset = useCallback(() => setFilters(DEFAULT), [])

  return { filters, setFilter, reset }
}
