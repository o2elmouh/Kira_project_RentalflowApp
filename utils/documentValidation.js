// Document expiry helpers for rental workflow gating.
// Used by ScanStep (CIN/passport) and ContractStep (driver license).

/**
 * Check if a date string is in the past (expired).
 * Accepts ISO ('2026-05-06'), full ISO timestamp, or null/undefined.
 * @param {string|null|undefined} dateStr
 * @returns {boolean} true if dateStr is a valid past date
 */
export function isDateExpired(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return false
  // Compare at day granularity to avoid timezone-induced false positives
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return date < today
}

/**
 * Days until expiry (negative if already expired, null if invalid).
 * @param {string|null|undefined} dateStr
 * @returns {number|null}
 */
export function daysUntilExpiry(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.round((date - today) / (1000 * 60 * 60 * 24))
}

/**
 * Inspect an OCR-extracted blob and return the first expired field, if any.
 * Looks at expiryDate (CIN/passport) and licenseExpiry (driver license).
 *
 * @param {Object|null|undefined} extracted
 * @returns {{type:'cin'|'license', expiry:string}|null}
 */
export function checkDocumentExpiry(extracted) {
  if (!extracted) return null

  // CIN / passport
  if (extracted.expiryDate && isDateExpired(extracted.expiryDate)) {
    return { type: 'cin', expiry: extracted.expiryDate }
  }

  // Driving license
  if (extracted.licenseExpiry && isDateExpired(extracted.licenseExpiry)) {
    return { type: 'license', expiry: extracted.licenseExpiry }
  }

  return null
}

/**
 * Same as checkDocumentExpiry but for a client record (camelCase or
 * Supabase snake_case columns).
 * @param {Object} client
 * @returns {{type:'cin'|'license', expiry:string}|null}
 */
export function checkClientDocumentExpiry(client) {
  if (!client) return null

  const cinExpiry     = client.cinExpiry || client.id_expiry
  const licenseExpiry = client.licenseExpiry || client.driving_license_expiry

  if (cinExpiry && isDateExpired(cinExpiry)) {
    return { type: 'cin', expiry: cinExpiry }
  }
  if (licenseExpiry && isDateExpired(licenseExpiry)) {
    return { type: 'license', expiry: licenseExpiry }
  }
  return null
}
