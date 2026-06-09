import { isLidJid } from './phoneFormat.js'

const NATIONALITY_MAP = {
  MAR:'Marocain', FRA:'Français', ESP:'Espagnol', ITA:'Italien', DEU:'Allemand',
  GBR:'Britannique', BEL:'Belge', CHE:'Suisse', NLD:'Néerlandais', PRT:'Portugais',
  USA:'Américain', CAN:'Canadien', DZA:'Algérien', TUN:'Tunisien', LBY:'Libyen',
  EGY:'Égyptien', SAU:'Saoudien', ARE:'Émirati', QAT:'Qatarien', KWT:'Koweïtien',
  JOR:'Jordanien', LBN:'Libanais', TUR:'Turc',
}

// Document type detection — mirrors server/lib/normalizeExtractedDocument.js.
// Some legacy lead rows may still carry the flat documentNumber/expiryDate
// keys (pre-v1.14.14), so we fall back via documentType to keep them readable.
const ID_CARD_TYPES   = new Set(['ID_CARD', 'CIN', 'cin', 'id_card'])
const LICENSE_TYPES   = new Set(['DRIVING_LICENSE', 'PERMIS', 'permis', 'driving_license'])
const PASSPORT_TYPES  = new Set(['PASSPORT', 'passport'])

function isCinType(t)      { return t && ID_CARD_TYPES.has(t) }
function isLicenseType(t)  { return t && LICENSE_TYPES.has(t) }
function isPassportType(t) { return t && PASSPORT_TYPES.has(t) }

export function buildRentalPrefill(lead, extractedData) {
  const ex = extractedData || {}
  const countryCode = (ex.issuingCountry || '').toUpperCase()
  const nationality = NATIONALITY_MAP[countryCode] || countryCode || 'Marocain'

  // Typed fields first (v1.14.14+ shape); fall back to legacy flat keys
  // when the document type matches.
  const lastType = ex.lastDocumentType || ex.documentType
  const cinNumber   = ex.cinNumber   || (isCinType(lastType)     ? ex.documentNumber : '') || ''
  const cinExpiry   = ex.cinExpiry   || (isCinType(lastType)     ? ex.expiryDate     : '') || ''
  const drivingLicenseNumber = ex.drivingLicenseNumber || (isLicenseType(lastType)  ? ex.documentNumber : '') || ''
  const licenseExpiry        = ex.licenseExpiry        || (isLicenseType(lastType)  ? ex.expiryDate     : '') || ''
  const passportNumber       = ex.passportNumber       || (isPassportType(lastType) ? ex.documentNumber : '') || ''
  const passportExpiry       = ex.passportExpiry       || (isPassportType(lastType) ? ex.expiryDate     : '') || ''

  return {
    firstName:            ex.firstName || '',
    lastName:             ex.lastName  || '',
    cinNumber,
    cinExpiry,
    dateOfBirth:          ex.dateOfBirth || '',
    nationality,
    drivingLicenseNumber,
    licenseExpiry,
    passportNumber,
    passportExpiry,
    // WhatsApp LIDs are NOT phone numbers (see phoneFormat.js LID handling).
    // Leaving phone empty forces the operator to ask the client for their
    // real number before Step 4 sends the signature SMS to a bogus target.
    phone:  lead.source === 'whatsapp' && !isLidJid(lead.sender_id)
              ? (lead.sender_id || '').replace('whatsapp:', '').replace(/@.*$/, '')
              : '',
    email:  lead.source === 'gmail'    ? (lead.sender_id || '') : '',
    // v1.14.18: preserve the raw WhatsApp JID so the wizard can show the
    // operator "where the lead came from" even when phone is blanked (LID
    // case). Baileys uses this JID directly to send confirmation messages
    // — it does NOT need a dialable phone for in-app WhatsApp messaging.
    whatsappJid: lead.source === 'whatsapp' ? (lead.sender_id || '') : '',
    rentalIntent: {
      detected:       !!(ex.rentalIntent?.detected || ex.start_date || ex.end_date || ex.pickup_location || ex.return_location),
      startDate:      ex.rentalIntent?.startDate || ex.start_date || null,
      endDate:        ex.rentalIntent?.endDate   || ex.end_date   || null,
      vehicleClass:   ex.rentalIntent?.vehicleClass || ex.requested_car || null,
      pickupLocation: ex.pickup_location || null,
      returnLocation: ex.return_location || null,
    },
    // v1.14.15: surface the lead-level identity verdict so Step 1 can warn
    // the operator when the documents on file disagree (different person on
    // passport vs licence). Resolver runs server-side after every merge.
    identityMismatch: ex.identityMismatch === true,
    identitySource:   ex.identitySource || null,
    // Pass lead origin through so downstream consumers (NewRental wizard,
    // reservation payload builder) can stamp the correct source_channel
    // and preserve the link back to the original lead.
    id:     lead.id,
    source: lead.source,
    leadId: lead.id,
  }
}
