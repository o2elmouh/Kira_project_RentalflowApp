// Draft persistence for in-progress New Rental workflows.
// Stored in localStorage keyed by agency_id so different users on the same
// machine don't see each other's drafts.

const STORAGE_KEY_PREFIX = 'rentaflow:newRental:drafts'

function getStorageKey(agencyId) {
  return `${STORAGE_KEY_PREFIX}:${agencyId || 'unknown'}`
}

function safeParse(json) {
  try { return JSON.parse(json) } catch { return [] }
}

// SECURITY: Strip highly sensitive PII before writing to localStorage.
// We keep names (needed for draft picker labels) but drop document numbers
// and DOB entirely. Earlier versions replaced these with the literal string
// '***', which then got POSTed back to /clients on resume and crashed the
// Postgres date columns with "invalid input syntax for type date". Deleting
// the keys means the resumed React form renders empty and the user re-enters.
const PII_FIELDS_TO_STRIP = ['cinNumber', 'idNumber', 'drivingLicenseNumber', 'dateOfBirth', 'passportNumber']
function stripPiiFromClient(client) {
  if (!client) return client
  const clean = { ...client }
  PII_FIELDS_TO_STRIP.forEach(f => { delete clean[f] })
  return clean
}

// Legacy data shim: drafts written by older app versions contain the literal
// '***' in PII fields. Strip those on read so resumed drafts never round-trip
// the sentinel back into the form / POST body.
function sanitizeLegacyPii(client) {
  if (!client) return client
  const clean = { ...client }
  PII_FIELDS_TO_STRIP.forEach(f => { if (clean[f] === '***') delete clean[f] })
  return clean
}

/**
 * @param {string} agencyId
 * @returns {Array<{id:string, createdAt:string, updatedAt:string, step:number, client:Object|null, rental:Object|null, photos:Object|null}>}
 */
export function loadDrafts(agencyId) {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(getStorageKey(agencyId))
  if (!raw) return []
  const arr = safeParse(raw)
  if (!Array.isArray(arr)) return []
  return arr.map(d => (d && d.client ? { ...d, client: sanitizeLegacyPii(d.client) } : d))
}

/**
 * Insert or update a draft. If `payload.id` is provided and matches an
 * existing draft, that draft is updated; otherwise a new draft is created.
 *
 * @param {string} agencyId
 * @param {Object} payload — { id?, step, client, rental, photos }
 * @returns {Object} the persisted draft (with id)
 */
export function saveDraft(agencyId, payload) {
  const drafts = loadDrafts(agencyId)
  const now = new Date().toISOString()
  const existingIdx = payload.id
    ? drafts.findIndex(d => d.id === payload.id)
    : -1

  const draft = {
    id:        payload.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: existingIdx >= 0 ? drafts[existingIdx].createdAt : now,
    updatedAt: now,
    step:      payload.step ?? 0,
    client:    stripPiiFromClient(payload.client ?? null),
    rental:    payload.rental ?? null,
    photos:    payload.photos ?? null,
  }

  if (existingIdx >= 0) {
    drafts[existingIdx] = draft
  } else {
    drafts.push(draft)
  }
  window.localStorage.setItem(getStorageKey(agencyId), JSON.stringify(drafts))
  return draft
}

/**
 * @param {string} agencyId
 * @param {string} id
 * @returns {Object|null}
 */
export function getDraft(agencyId, id) {
  return loadDrafts(agencyId).find(d => d.id === id) || null
}

/**
 * @param {string} agencyId
 * @param {string} id
 */
export function deleteDraft(agencyId, id) {
  const drafts = loadDrafts(agencyId).filter(d => d.id !== id)
  window.localStorage.setItem(getStorageKey(agencyId), JSON.stringify(drafts))
}

/**
 * Wipe every draft for the agency (used after a contract is finalized).
 * @param {string} agencyId
 */
export function clearDrafts(agencyId) {
  window.localStorage.removeItem(getStorageKey(agencyId))
}

/**
 * Human-readable label for a draft (used in the draft picker grid).
 * @param {Object} draft
 * @returns {string}
 */
export function getDraftLabel(draft) {
  if (!draft) return 'Brouillon'
  const c = draft.client || {}
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (c.cinNumber) return `CIN ${c.cinNumber}`
  return 'Brouillon sans nom'
}
