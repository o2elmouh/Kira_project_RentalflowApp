/**
 * Sender-shape filter for the WhatsApp inbound pipeline.
 *
 * WhatsApp delivers messages from sources that are NOT individual users:
 *
 *   status@broadcast      — Status updates ("stories")
 *   <id>@g.us             — Group messages
 *   <id>@newsletter       — Channel updates
 *
 * None of these should create leads. Real 1:1 chats use `<phone>@s.whatsapp.net`,
 * a bare numeric `sender_id`, or `<lid>@lid` — the new WhatsApp LID (Linked
 * Identity) system rolled out 2024-2025. LID is the primary identifier for
 * users whose phone number is hidden by privacy settings or who use newer
 * WhatsApp accounts. The numeric prefix isn't the phone number, but it IS
 * a stable per-user identifier and the sender is a real human who can
 * absolutely submit a real rental lead.
 *
 * v1.14.8 blanket-rejected @lid to stop empty-Basket cards, which also
 * dropped legitimate leads (e.g. "bonjour, j'ai besoin d'une voiture pour
 * le 15 decembre" from 84139063677034@lid). v1.14.13 reverses that —
 * empty-message protection lives downstream in the triage gate, which
 * already drops content-less messages before they reach pending_demands.
 *
 * Default: ACCEPT (reject only known-bad suffixes). This keeps the gate robust
 * to future WhatsApp Cloud / Baileys formats we haven't seen yet.
 */
export function isLeadableWhatsAppSender(jid) {
  if (!jid || typeof jid !== 'string') return false
  if (jid === 'status@broadcast') return false
  if (jid.endsWith('@g.us')) return false
  if (jid.endsWith('@newsletter')) return false
  return true
}
