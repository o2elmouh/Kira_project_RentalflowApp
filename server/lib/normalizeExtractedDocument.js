/**
 * Re-key a single OCR extraction so that different document types live in
 * separate slots — preventing a passport's number from being overwritten
 * (or, worse, preserved) when a driving license arrives in a second image.
 *
 * Input shape (from GLOBAL_SYSTEM_PROMPT in server/routes/leads.js):
 *   {
 *     documentType: 'ID_CARD' | 'DRIVING_LICENSE' | 'PASSPORT' | 'UNKNOWN',
 *     documentNumber: string,
 *     expiryDate: string,
 *     firstName, lastName, dateOfBirth, issuingCountry, ...
 *     confidenceScores: { documentNumber, expiryDate, ... }
 *   }
 *
 * Output shape (after normalization):
 *   {
 *     // Person-level (shared, unchanged):
 *     firstName, lastName, dateOfBirth, issuingCountry, ...
 *
 *     // Document-typed (split by documentType):
 *     cinNumber?, cinExpiry?                       — when ID_CARD / cin / CIN
 *     drivingLicenseNumber?, licenseExpiry?        — when DRIVING_LICENSE
 *     passportNumber?, passportExpiry?             — when PASSPORT
 *
 *     // For UNKNOWN documentType: original documentNumber / expiryDate kept
 *     // so we don't silently lose data.
 *
 *     // Diagnostic:
 *     lastDocumentType?  — last value seen (helpful for the agent UI / debugging)
 *
 *     // Confidence scores remapped to the typed keys.
 *   }
 *
 * Idempotent — running it on already-normalized output is a no-op.
 */

const ID_CARD_TYPES = new Set(['ID_CARD', 'CIN', 'cin', 'id_card'])
const DRIVING_LICENSE_TYPES = new Set(['DRIVING_LICENSE', 'PERMIS', 'permis', 'driving_license'])
const PASSPORT_TYPES = new Set(['PASSPORT', 'passport'])

function typeSlot(documentType) {
  if (!documentType) return null
  if (ID_CARD_TYPES.has(documentType)) return 'cin'
  if (DRIVING_LICENSE_TYPES.has(documentType)) return 'drivingLicense'
  if (PASSPORT_TYPES.has(documentType)) return 'passport'
  return null
}

const NUMBER_KEY = { cin: 'cinNumber', drivingLicense: 'drivingLicenseNumber', passport: 'passportNumber' }
const EXPIRY_KEY = { cin: 'cinExpiry',  drivingLicense: 'licenseExpiry',       passport: 'passportExpiry' }

export function normalizeExtractedDocument(raw) {
  if (!raw || typeof raw !== 'object') return raw

  const { documentType, documentNumber, expiryDate, confidenceScores, ...rest } = raw
  const out = { ...rest }
  const slot = typeSlot(documentType)

  const conf = confidenceScores && typeof confidenceScores === 'object' ? { ...confidenceScores } : {}
  const remappedConf = {}

  if (slot) {
    const numKey = NUMBER_KEY[slot]
    const expKey = EXPIRY_KEY[slot]
    if (documentNumber) out[numKey] = documentNumber
    if (expiryDate)     out[expKey] = expiryDate
    if (conf.documentNumber !== undefined) remappedConf[numKey] = conf.documentNumber
    if (conf.expiryDate !== undefined)     remappedConf[expKey] = conf.expiryDate
    out.lastDocumentType = documentType
  } else if (documentType) {
    // Unknown type — preserve original keys so nothing is lost.
    out.documentType = documentType
    if (documentNumber) out.documentNumber = documentNumber
    if (expiryDate)     out.expiryDate = expiryDate
    if (conf.documentNumber !== undefined) remappedConf.documentNumber = conf.documentNumber
    if (conf.expiryDate !== undefined)     remappedConf.expiryDate = conf.expiryDate
  } else {
    // No documentType at all — pass through generic fields as-is.
    if (documentNumber) out.documentNumber = documentNumber
    if (expiryDate)     out.expiryDate = expiryDate
    if (conf.documentNumber !== undefined) remappedConf.documentNumber = conf.documentNumber
    if (conf.expiryDate !== undefined)     remappedConf.expiryDate = conf.expiryDate
  }

  // Carry every non-document confidence score through unchanged.
  for (const [k, v] of Object.entries(conf)) {
    if (k === 'documentNumber' || k === 'expiryDate') continue
    remappedConf[k] = v
  }

  if (Object.keys(remappedConf).length > 0) out.confidenceScores = remappedConf
  return out
}
