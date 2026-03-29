/**
 * RentaFlow API client — calls the Railway backend.
 * Falls back gracefully if VITE_API_URL is not set (local dev without server).
 */
import { supabase } from './supabase.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

async function request(method, path, body) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeaders()),
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Health
  health: ()                         => request('GET',   '/health'),

  // Agency
  getAgency: ()                      => request('GET',   '/agency'),
  updateAgency: (data)               => request('PATCH', '/agency', data),

  // Contracts
  closeContract: (id, payload)       => request('POST',  `/contracts/${id}/close`, payload),
  extendContract: (id, payload)      => request('POST',  `/contracts/${id}/extend`, payload),

  // Email
  sendContractEmail: (payload)       => request('POST',  '/email/contract', payload),

  // Team
  getTeam: ()                        => request('GET',   '/team'),
  inviteMember: (payload)            => request('POST',  '/team/invite', payload),
  updateMemberRole: (id, role)       => request('PATCH', `/team/${id}/role`, { role }),
  removeMember: (id)                 => request('DELETE',`/team/${id}`),
}
