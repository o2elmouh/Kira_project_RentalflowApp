import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchReservations,
  fetchReservationById,
  updateReservation,
  createReservation,
} from '../utils/reservationsApi'

/**
 * Paginated list of reservations.
 *
 * `placeholderData: (prev) => prev` is the v5 replacement for
 * `keepPreviousData: true` — it keeps the previous page visible while the
 * new one loads, eliminating the empty-table flicker during pagination
 * and filter changes.
 */
export function useReservations(filters) {
  return useQuery({
    queryKey:        ['reservations', filters],
    queryFn:         () => fetchReservations(filters),
    placeholderData: (prev) => prev,
    staleTime:       30_000,
  })
}

/** Single-reservation detail (for the side panel). */
export function useReservation(id) {
  return useQuery({
    queryKey: ['reservation', id],
    queryFn:  () => fetchReservationById(id),
    enabled:  !!id,
  })
}

/** Mutation: status change, edit, etc. Invalidates both list and detail. */
export function useUpdateReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateReservation(id, patch),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: ['reservation', id] })
    },
  })
}

/** Mutation: create reservation (called from NewRental wizard finish). */
export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
    },
  })
}
