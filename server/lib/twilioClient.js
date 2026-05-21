// WhatsApp client — replaced Twilio with Baileys.
// Export surface is identical so callers need no import changes.
// File name preserved to avoid touching every importer.
import { sendMessage } from './baileys/sessionManager.js'

/**
 * Resolve a `to` argument to a Baileys-addressable JID.
 *
 * Two input shapes are accepted:
 *
 *   1. **Bare phone number** (manual entry from the app — clients table, contract form, etc.)
 *      Examples: "0612345678", "+212612345678", "00212612345678", "212612345678"
 *      → returns "212XXXXXXXXX@s.whatsapp.net"
 *
 *   2. **Already a JID** (carried in `pending_demands.sender_id` from the inbound listener)
 *      Examples: "212612345678@s.whatsapp.net", "212612345678:42@s.whatsapp.net", "7383233388632@lid"
 *      → returns the JID with the multi-device `:N` suffix stripped, but the host
 *        (`@s.whatsapp.net` OR `@lid`) preserved.
 *
 * Critical fix vs. the previous version: when sender_id is an `@lid` privacy JID,
 * the digits before `@lid` are NOT a phone number — they're a Baileys-internal
 * identifier. The old code stripped to digits and re-appended `@s.whatsapp.net`,
 * producing a non-existent address. WhatsApp silently dropped the message and
 * Baileys returned success — exactly the "message not received" symptom.
 */
export const formatWhatsAppNumber = (phone) => {
  let p = (phone || '').replace(/[\s\-\(\)]/g, '')

  // Already a JID — preserve the host (@s.whatsapp.net OR @lid), strip multi-device suffix.
  if (p.includes('@')) {
    return p.replace(/:[\d]+@/, '@')
  }

  if (p.startsWith('+'))  p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if ((p.startsWith('06') || p.startsWith('07')) && p.length === 10) {
    p = '212' + p.slice(1)
  }
  return `${p}@s.whatsapp.net`
}

/**
 * Send a WhatsApp text message via the agency's Baileys session.
 * @param {string} to        — any Moroccan phone format
 * @param {string} body      — message text
 * @param {string} agencyId  — required (identifies which session to use)
 */
export const sendWhatsAppMessage = async (to, body, agencyId) => {
  if (!agencyId) throw new Error('sendWhatsAppMessage requires agencyId')
  const jid = formatWhatsAppNumber(to)
  await sendMessage(agencyId, jid, body)
  return { success: true }
}
