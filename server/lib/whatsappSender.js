/**
 * Sender-shape filter for the WhatsApp inbound pipeline.
 *
 * WhatsApp delivers messages from sources that are NOT individual users:
 *
 *   status@broadcast      — Status updates ("stories")
 *   <id>@g.us             — Group messages
 *   <id>@newsletter       — Channel updates
 *   <id>@lid              — Linked-device pseudonym (can't be resolved to a real
 *                           phone — surfaces in the UI as a phone-shaped string
 *                           that isn't a real number)
 *
 * None of these should create leads. Real 1:1 chats use `<phone>@s.whatsapp.net`
 * or a bare numeric `sender_id`.
 *
 * Default: ACCEPT (reject only known-bad suffixes). This keeps the gate robust
 * to future WhatsApp Cloud / Baileys formats we haven't seen yet.
 */
export function isLeadableWhatsAppSender(jid) {
  if (!jid || typeof jid !== 'string') return false
  if (jid === 'status@broadcast') return false
  if (jid.endsWith('@g.us')) return false
  if (jid.endsWith('@newsletter')) return false
  if (jid.endsWith('@lid')) return false
  return true
}
