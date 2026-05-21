/**
 * Format a WhatsApp sender identifier (Baileys JID or Gmail address) for display.
 *
 * Behaviour:
 *   - Strips the `@s.whatsapp.net` / `@lid` / `@c.us` suffix
 *   - Strips the multi-device suffix (":NN" before the @)
 *   - If the remaining string is 10–15 digits, formats as "+CC XXX XXX XXX..."
 *   - Otherwise returns the cleaned-but-unformatted local part as a fallback
 *   - Gmail addresses (containing "@" but not a WhatsApp suffix) pass through unchanged
 *
 * Examples:
 *   "212612345678@s.whatsapp.net"      → "+212 612 345 678"
 *   "212612345678:42@s.whatsapp.net"   → "+212 612 345 678"
 *   "84139063677034@lid"               → "+84 139 063 677 034"
 *   "client@gmail.com"                 → "client@gmail.com"
 *   null                               → ""
 */
export function formatPhone(senderId) {
  if (!senderId || typeof senderId !== 'string') return ''

  // Gmail / generic email: leave alone
  const isWhatsAppJid = /@(s\.whatsapp\.net|lid|c\.us)$/i.test(senderId)
  if (senderId.includes('@') && !isWhatsAppJid) return senderId

  // Strip suffix + device id
  const localPart = senderId.split('@')[0]
  const digits = localPart.split(':')[0].replace(/\D/g, '')

  if (!digits) return ''

  if (digits.length < 10 || digits.length > 15) {
    return digits
  }

  // Country code: 1-3 digits. Default split: 3 (works for +212 MA, +33 FR, +1 US).
  // We just take 3 unless the number is short.
  const ccLen = digits.length <= 11 ? 2 : 3
  const cc = digits.slice(0, ccLen)
  const rest = digits.slice(ccLen)

  // Group remaining digits in chunks of 3 from the left
  const groups = []
  for (let i = 0; i < rest.length; i += 3) {
    groups.push(rest.slice(i, i + 3))
  }

  return `+${cc} ${groups.join(' ')}`.trim()
}
