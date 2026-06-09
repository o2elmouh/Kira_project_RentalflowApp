/**
 * Reservations API client (frontend).
 * Wraps fetch() with auth header injection from the active Supabase session.
 */
import { supabase } from '../../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

/** Build a query string from an object, dropping empty/null/'all' values. */
function buildQuery(params) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '' || v === 'all') continue
    qs.set(k, String(v))
  }
  return qs.toString()
}

export async function fetchReservations(params) {
  const qs = buildQuery(params)
  const res = await fetch(`${API_URL}/reservations${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Reservations fetch failed: ${res.status} ${body}`)
  }
  return res.json()
}

export async function fetchReservationById(id) {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(`Reservation ${id} fetch failed: ${res.status}`)
  return res.json()
}

export async function createReservation(payload) {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Reservation create failed: ${res.status} ${body}`)
  }
  return res.json()
}

export async function updateReservation(id, patch) {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Reservation ${id} patch failed: ${res.status}`)
  return res.json()
}
