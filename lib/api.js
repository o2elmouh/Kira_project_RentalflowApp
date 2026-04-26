/**
 * RentaFlow API client â€” calls the Railway backend.
 * Falls back gracefully if VITE_API_URL is not set (local dev without server).
 */
import { supabase } from './supabase.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getAuthHeaders(forceRefresh = false) {
  if (forceRefresh) {
    const { data: { session } } = await supabase.auth.refreshSession()
    if (!session) return {}
    return { Authorization: `Bearer ${session.access_token}` }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

async function request(method, path, body) {
  const doFetch = async (forceRefresh = false) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders(forceRefresh)),
    }
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  let res = await doFetch()

  // On 401 (expired token), refresh session and retry once
  if (res.status === 401) {
    res = await doFetch(true)
  }

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

  // WhatsApp
  sendContractWhatsApp: (payload)    => request('POST',  '/whatsapp/contract', payload),
  sendInvoiceWhatsApp:  (payload)    => request('POST',  '/whatsapp/invoice',  payload),
  sendPaymentLink:      (payload)    => request('POST',  '/whatsapp/payment',  payload),
  sendRestitutionWhatsApp: (payload) => request('POST',  '/whatsapp/restitution', payload),
  sendQuoteOffer:          (payload) => request('POST',  '/whatsapp/send-offer',  payload),
  getWhatsAppStatus:   ()          => request('GET',   '/whatsapp/status'),
  connectWhatsApp:     ()          => request('POST',  '/whatsapp/connect', {}),
  disconnectWhatsApp:  ()          => request('POST',  '/whatsapp/disconnect', {}),

  // AI
  detectDamage: (payload) => request('POST', '/ai/detect-damage', payload),

  // Telematics
  getTelemetryPositions: (ids = []) =>
    request('GET', `/telemetry/positions${ids.length ? `?ids=${ids.join(',')}` : ''}`),
  getTelemetryPosition: (deviceId) =>
    request('GET', `/telemetry/position/${deviceId}`),
  getTelemetryDevices: () =>
    request('GET', '/telemetry/devices'),
  takeSnapshot: (payload) =>
    request('POST', '/telemetry/snapshot', payload),

  // Leads (Premium Basket of Cases)
  getLeads: (status = 'pending') => request('GET', `/leads?status=${status}`),
  getAlerts: ()                  => request('GET', `/leads?classification=alert`),
  getLead: (id)                  => request('GET', `/leads/${id}`),
  updateLeadStatus: (id, status) => request('PATCH', `/leads/${id}/status`, { status }),
  escalateAlert:    (id)         => request('PATCH', `/leads/${id}/status`, { status: 'pending', classification: 'lead' }),
  updateLeadExtracted: (id, extracted_data) => request('PATCH', `/leads/${id}/extracted`, { extracted_data }),

  // Gmail integration
  getGmailStatus: ()             => request('GET',    '/gmail/status'),
  saveGmailCredentials: (payload)=> request('POST',   '/gmail/credentials', payload),
  deleteGmailCredentials: ()     => request('DELETE', '/gmail/credentials'),
  triggerGmailPoll: ()           => request('POST',   '/gmail/poll'),

  // Team
  getTeam: ()                        => request('GET',   '/team'),
  inviteMember: (payload)            => request('POST',  '/team/invite', payload),
  updateMemberRole: (id, role)       => request('PATCH', `/team/${id}/role`, { role }),
  removeMember: (id)                 => request('DELETE',`/team/${id}`),

  // RentalFlow Network â€” cross-agency B2B sharing
  network: {
    toggleVisibility: (vehicleId, body) => request('PATCH', `/network/vehicles/${vehicleId}/visibility`, body),
    search:           (params)          => request('GET',   `/network/search?${new URLSearchParams(params)}`),
    createRequest:    (body)            => request('POST',  '/network/requests', body),
    getIncoming:      ()                => request('GET',   '/network/requests/incoming'),
    getOutgoing:      ()                => request('GET',   '/network/requests/outgoing'),
    updateStatus:     (id, body)        => request('PATCH', `/network/requests/${id}/status`, body),
    reveal:           (id)              => request('GET',   `/network/requests/${id}/reveal`),
    borrowedFleet:    (params)          => request('GET',   `/network/requests/borrowed-fleet?${new URLSearchParams(params)}`),
  },
}

