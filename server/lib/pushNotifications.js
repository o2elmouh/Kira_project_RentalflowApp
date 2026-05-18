/**
 * Expo push notification helper.
 *
 * Reads every Expo push token registered for an agency from `device_tokens`
 * and ships a payload to the Expo push service. Failures never throw — push
 * is best-effort and must not break the HTTP request that fired it.
 *
 * Payload `data` is delivered as `notification.request.content.data` on the
 * mobile side; the App.js response listener routes on `data.type`:
 *   type='lead'             → LeadDetail screen (data.id = lead id)
 *   type='contract_signed'  → ContractDetail screen (data.id = contract id)
 */

import { Expo } from 'expo-server-sdk'
import supabaseAdmin from './supabaseAdmin.js'

const expo = new Expo()

async function fetchTokens(agencyId) {
  const { data, error } = await supabaseAdmin
    .from('device_tokens')
    .select('token')
    .eq('agency_id', agencyId)
  if (error) {
    console.error('[push] device_tokens fetch error:', error.message)
    return []
  }
  return (data || []).map(r => r.token).filter(t => Expo.isExpoPushToken(t))
}

async function pruneInvalidTokens(tokens) {
  if (!tokens.length) return
  const { error } = await supabaseAdmin
    .from('device_tokens')
    .delete()
    .in('token', tokens)
  if (error) console.warn('[push] prune error:', error.message)
  else console.log(`[push] pruned ${tokens.length} invalid token(s)`)
}

export async function sendToAgency(agencyId, title, body, data = {}) {
  if (!agencyId) return
  try {
    const tokens = await fetchTokens(agencyId)
    if (!tokens.length) {
      console.log(`[push] agency=${agencyId} → no tokens registered`)
      return
    }

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
    }))

    const tickets = []
    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const chunkTickets = await expo.sendPushNotificationsAsync(chunk)
        tickets.push(...chunkTickets)
      } catch (err) {
        console.error('[push] expo send error:', err.message)
      }
    }

    const invalid = []
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        const code = ticket.details?.error
        if (code === 'DeviceNotRegistered') invalid.push(messages[i].to)
        else console.warn(`[push] ticket error: ${ticket.message} (${code})`)
      }
    })
    if (invalid.length) await pruneInvalidTokens(invalid)

    console.log(`[push] agency=${agencyId} → sent ${tickets.length} | title="${title}"`)
  } catch (err) {
    console.error('[push] sendToAgency error:', err.message)
  }
}
