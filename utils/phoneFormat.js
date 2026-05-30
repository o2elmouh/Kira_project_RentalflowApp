/**
 * Format a WhatsApp sender identifier (Baileys JID or Gmail address) for display.
 *
 * Behaviour:
 *   - Gmail addresses (containing "@" but not a WhatsApp suffix) pass through unchanged
 *   - Strips the `@s.whatsapp.net` / `@lid` / `@c.us` suffix
 *   - Strips the multi-device suffix (":NN" before the @)
 *   - Identifies the country code via longest-prefix match against the table below
 *   - Formats as "+CC XXX XXX XXX..." (3-digit chunks after the CC)
 *   - Unknown CC or out-of-range digit count → returns cleaned digits, no "+" prefix
 *     (avoids surfacing a misleading bogus country code in the UI)
 *
 * Examples:
 *   "212612345678@s.whatsapp.net"     → "+212 612 345 678"   (Morocco)
 *   "33612345678@s.whatsapp.net"      → "+33 612 345 678"    (France)
 *   "351912345678@s.whatsapp.net"     → "+351 912 345 678"   (Portugal)
 *   "14155552671@s.whatsapp.net"      → "+1 415 555 2671"    (US/Canada)
 *   "client@gmail.com"                → "client@gmail.com"
 *   "84139063677034@lid"              → "+84 139 063 677 034" (Vietnam — formatted because 84 matches)
 *   "12345@lid"                       → "12345"               (too short to be E.164)
 *   null                              → ""
 */

// ITU country codes, longest-prefix first. Iteration order matters: 3-digit
// codes (212 MA, 351 PT, 966 SA…) must be tried before 2-digit codes (21 — none,
// 35 — none, 96 — none). 1-digit codes (1, 7) come last.
//
// Coverage: the countries we actually see in Moroccan car-rental traffic
// (tourists, locals, GCC visitors) plus enough breadth to handle the rest of
// Europe / North Africa / Middle East / Americas without falling back to raw.
const COUNTRY_CODES = [
  // 3-digit
  '212', '213', '216', '218',                             // MA, DZ, TN, LY
  '351',                                                  // PT
  '961', '962', '963', '964', '965', '966', '967', '968', // LB, JO, SY, IQ, KW, SA, YE, OM
  '970', '971', '972', '973', '974',                      // PS, AE, IL, BH, QA
  '380',                                                  // UA

  // 2-digit
  '20',                                                   // EG
  '27',                                                   // ZA
  '30', '31', '32', '33', '34', '36', '39',               // GR, NL, BE, FR, ES, HU, IT
  '40', '41', '43', '44', '45', '46', '47', '48', '49',   // RO, CH, AT, GB, DK, SE, NO, PL, DE
  '51', '52', '53', '54', '55', '56', '57', '58',         // PE, MX, CU, AR, BR, CL, CO, VE
  '60', '61', '62', '63', '64', '65', '66',               // MY, AU, ID, PH, NZ, SG, TH
  '81', '82', '84', '86',                                 // JP, KR, VN, CN
  '90', '91', '92', '93', '94', '95', '98',               // TR, IN, PK, AF, LK, MM, IR

  // 1-digit (NANP + RU/KZ) — must be last so 2-digit matches win
  '1',
  '7',
]

export function formatPhone(senderId) {
  if (!senderId || typeof senderId !== 'string') return ''

  // Gmail / generic email: leave alone
  const isWhatsAppJid = /@(s\.whatsapp\.net|lid|c\.us)$/i.test(senderId)
  if (senderId.includes('@') && !isWhatsAppJid) return senderId

  // Strip suffix + multi-device id, then keep only digits
  const localPart = senderId.split('@')[0]
  const digits = localPart.split(':')[0].replace(/\D/g, '')

  if (!digits) return ''

  // E.164 sanity check — anything outside this window is almost certainly a
  // privacy pseudonym or a malformed identifier. Show raw digits, not a
  // bogus "+999..." that misrepresents the source.
  if (digits.length < 8 || digits.length > 15) return digits

  // Longest-prefix country-code match
  let cc = null
  for (const code of COUNTRY_CODES) {
    if (digits.startsWith(code)) {
      cc = code
      break
    }
  }

  if (!cc) {
    // Unknown CC — don't fabricate one. Return raw digits.
    return digits
  }

  // Group remaining digits in chunks of 3 from the left
  const rest = digits.slice(cc.length)
  const groups = []
  for (let i = 0; i < rest.length; i += 3) {
    groups.push(rest.slice(i, i + 3))
  }

  return `+${cc} ${groups.join(' ')}`.trim()
}
