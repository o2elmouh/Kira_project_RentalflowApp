// WhatsApp client — replaced Twilio with Baileys.
// Export surface is identical so callers need no import changes.
// File name preserved to avoid touching every importer.
import { sendMessage } from './baileys/sessionManager.js'

/**
 * Normalise any Moroccan phone format to a Baileys JID.
 * Accepts: 06XXXXXXXX · 07XXXXXXXX · +212XXXXXXXXX · 00212XXXXXXXXX · 212XXXXXXXXX
 * Returns: "212XXXXXXXXX@s.whatsapp.net"
 */
export const formatWhatsAppNumber = (phone) => {
  let p = (phone || '').replace(/[\s\-\(\)]/g, '')
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
