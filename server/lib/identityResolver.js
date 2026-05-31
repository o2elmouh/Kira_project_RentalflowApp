/**
 * Resolve a lead's canonical identity (firstName, lastName, dateOfBirth,
 * nationality, issuingCountry) when multiple documents have been extracted.
 *
 * Priority for IDENTITY fields:
 *   PASSPORT > ID_CARD/CIN > DRIVING_LICENSE
 *
 * Rationale:
 *   - Passport is the international identity standard. For foreign visitors
 *     it's the legal source of truth.
 *   - CIN is the Moroccan national identity standard — equivalent authority
 *     for locals.
 *   - Driving licence is about driving privileges, not identity. Many
 *     jurisdictions allow looser name forms (initials, transliterations)
 *     on licences, which causes spurious mismatches when used as identity
 *     (e.g. Bulgarian licence shows "ИВАНОВА" / "МАРИЦА" while a passport
 *     would carry the canonical "ØSTERGÅRD" / "HANNE KRISTINE").
 *
 * For DOCUMENT-SPECIFIC fields (cinNumber/passportNumber/drivingLicenseNumber
 * and their *Expiry siblings), no priority applies — they live in separate
 * slots and all coexist. The collision bug v1.14.14 fixed.
 *
 * This module also flags `identityMismatch: true` when two documents
 * disagree on the canonical identity (signal to the UI to show a warning).
 */

const IDENTITY_FIELDS = ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'issuingCountry']

const PRIORITY_ORDER = ['passport', 'cin', 'drivingLicense']  // highest → lowest
const SLOT_LABEL = { passport: 'PASSPORT', cin: 'CIN', drivingLicense: 'DRIVING_LICENSE' }

/**
 * Replace top-level identity fields with the value from the highest-priority
 * document that contributed them. Sets `identitySource` to the slot label.
 *
 * If no per-doc identity slot is present (legacy data shape), top-level
 * fields stay unchanged.
 *
 * @param {object|null|undefined} data
 * @returns {object}
 */
export function applyIdentityPriority(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }

  let pickedSlot = null
  for (const slot of PRIORITY_ORDER) {
    const identity = out[`${slot}Identity`]
    if (!identity || typeof identity !== 'object') continue
    // Take the first slot that has at least one identity field — that's
    // the priority winner.
    const hasAny = IDENTITY_FIELDS.some(f => identity[f])
    if (!hasAny) continue
    pickedSlot = slot
    for (const f of IDENTITY_FIELDS) {
      if (identity[f]) out[f] = identity[f]
    }
    break
  }

  if (pickedSlot) out.identitySource = SLOT_LABEL[pickedSlot]
  return out
}

/**
 * Normalize a name string for comparison: lowercase, strip diacritics,
 * collapse whitespace, drop non-letter characters. Returns '' for falsy
 * input.
 */
function normalizeName(s) {
  if (!s || typeof s !== 'string') return ''
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')    // combining marks
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')        // keep letters + spaces
    .replace(/\s+/g, ' ')
    .trim()
}

function namesAgree(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return true   // missing data is not a mismatch — just unknown
  if (na === nb) return true
  // Allow one to be a subset of the other (e.g. "HANNE" vs "HANNE KRISTINE").
  if (na.includes(nb) || nb.includes(na)) return true
  // Common Moroccan-name variation: "EL MOUHIB" vs "Elmouhib" — same name,
  // different spacing convention across documents. Compare with spaces
  // stripped too.
  const naCompact = na.replace(/\s+/g, '')
  const nbCompact = nb.replace(/\s+/g, '')
  if (naCompact === nbCompact) return true
  if (naCompact.includes(nbCompact) || nbCompact.includes(naCompact)) return true
  return false
}

function datesAgree(a, b) {
  if (!a || !b) return true
  return String(a).slice(0, 10) === String(b).slice(0, 10)
}

/**
 * True iff two or more per-document identity slots disagree on first name,
 * last name, or date of birth. Single-document leads are never a mismatch.
 *
 * Cyrillic vs Latin script counts as a mismatch — that's the whole point of
 * surfacing it. The Bulgarian licence vs Danish passport case must flag.
 *
 * @param {object|null|undefined} data
 * @returns {boolean}
 */
export function detectIdentityMismatch(data) {
  if (!data || typeof data !== 'object') return false
  const identities = PRIORITY_ORDER
    .map(slot => data[`${slot}Identity`])
    .filter(id => id && typeof id === 'object' && (id.firstName || id.lastName || id.dateOfBirth))

  if (identities.length < 2) return false

  for (let i = 0; i < identities.length; i++) {
    for (let j = i + 1; j < identities.length; j++) {
      const a = identities[i]
      const b = identities[j]
      if (!namesAgree(a.firstName, b.firstName)) return true
      if (!namesAgree(a.lastName,  b.lastName))  return true
      if (!datesAgree(a.dateOfBirth, b.dateOfBirth)) return true
    }
  }
  return false
}

/**
 * One-shot: apply priority + flag mismatch. Use after every merge.
 */
export function resolveIdentity(data) {
  if (!data || typeof data !== 'object') return data
  const withPriority = applyIdentityPriority(data)
  return { ...withPriority, identityMismatch: detectIdentityMismatch(withPriority) }
}
