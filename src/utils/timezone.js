/**
 * Timezone utilities — DB always stores UTC; UI shows user-local.
 *
 * Convention:
 *   - All `timestamptz` columns in Supabase are stored as UTC.
 *   - The browser's resolved IANA zone (e.g. 'Africa/Casablanca') is used
 *     for rendering; falls back to 'Africa/Casablanca' when the runtime
 *     can't introspect (very rare — Node test envs, mostly).
 *   - When inserting/updating, always pass an ISO 8601 string with `Z`
 *     so Supabase doesn't reinterpret a naive local string as UTC.
 */
import { format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

const USER_TZ =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  'Africa/Casablanca'

/** UTC ISO string → local Date object (rendered in user TZ). */
export function utcToLocal(utcIso) {
  if (!utcIso) return null
  return toZonedTime(new Date(utcIso), USER_TZ)
}

/** Local Date object → UTC ISO string (for DB insert/update). */
export function localToUtc(localDate) {
  if (!localDate) return null
  return fromZonedTime(localDate, USER_TZ).toISOString()
}

/** Format a UTC ISO string as a user-local display string. */
export function formatLocal(utcIso, fmt = 'dd/MM/yyyy HH:mm') {
  const d = utcToLocal(utcIso)
  return d ? format(d, fmt) : '—'
}

/** Format a date range as "dd MMM → dd MMM yyyy". */
export function formatRange(startUtc, endUtc) {
  if (!startUtc || !endUtc) return '—'
  const s = formatLocal(startUtc, 'dd MMM')
  const e = formatLocal(endUtc, 'dd MMM yyyy')
  return `${s} → ${e}`
}

export { USER_TZ }
