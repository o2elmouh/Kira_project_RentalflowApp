/**
 * RentaFlow OCR engine — Tesseract.js 5
 * Supports Moroccan CIN (CNIE), Passport MRZ, and driving licence.
 * CNDP compliance: only extracted text fields are returned — no raw image data is stored.
 */
import { createWorker } from 'tesseract.js'

// ── Helpers ───────────────────────────────────────────────

/** Normalise Arabic/French month names → 2-digit month number */
const MONTH_MAP = {
  jan: '01', fév: '02', fev: '02', mar: '03', avr: '04', mai: '05', juin: '06',
  jui: '07', aoû: '08', aou: '08', sep: '09', oct: '10', nov: '11', déc: '12', dec: '12',
  janvier: '01', février: '02', mars: '03', avril: '04', juillet: '07', août: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12',
}

function normaliseDate(raw) {
  if (!raw) return ''
  // Already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmy = raw.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3]
    return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  }
  // dd Month yyyy  (French / Arabic transliteration)
  const dMonthY = raw.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{4})/)
  if (dMonthY) {
    const m = MONTH_MAP[dMonthY[2].toLowerCase().slice(0,4)] || MONTH_MAP[dMonthY[2].toLowerCase()]
    if (m) return `${dMonthY[3]}-${m}-${dMonthY[1].padStart(2,'0')}`
  }
  return ''
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
}

// ── MRZ Parser (Passport TD3) ─────────────────────────────

/**
 * Parse a 2-line MRZ from a passport.
 * Line 1: P<MARFAMILY<<GIVEN<NAMES<<…  (44 chars)
 * Line 2: PASSPORTNUMBER<CHECKDIGITMARRYYMMDDCHECK…
 */
export function parseMRZ(text) {
  // Extract two consecutive lines of exactly 44 uppercase alphanum + '<'
  const lines = text
    .split('\n')
    .map(l => l.replace(/[^A-Z0-9<]/g, '').padEnd(0))
    .filter(l => l.length >= 40)

  let mrzLine1 = '', mrzLine2 = ''
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].length >= 44 && lines[i + 1].length >= 44) {
      mrzLine1 = lines[i].slice(0, 44)
      mrzLine2 = lines[i + 1].slice(0, 44)
      break
    }
  }
  if (!mrzLine1) return null

  // Passport number: chars 1-9 of line 2
  const passportNumber = mrzLine2.slice(0, 9).replace(/</g, '')
  // Nationality: chars 10-12
  const nationalityCode = mrzLine2.slice(10, 13).replace(/</g, '')
  // DOB: chars 13-18 → YYMMDD
  const dobRaw = mrzLine2.slice(13, 19)
  const dobYear = parseInt(dobRaw.slice(0, 2))
  const dob = `${dobYear > 30 ? '19' : '20'}${dobRaw.slice(0,2)}-${dobRaw.slice(2,4)}-${dobRaw.slice(4,6)}`
  // Expiry: chars 20-25
  const expRaw = mrzLine2.slice(19, 25)
  const expiry = `20${expRaw.slice(0,2)}-${expRaw.slice(2,4)}-${expRaw.slice(4,6)}`
  // Gender: char 21
  const gender = mrzLine2[20] || ''

  // Name: line 1 chars 5-44, split on <<
  const namePart = mrzLine1.slice(5).replace(/</g, ' ').trim()
  const nameSplit = namePart.split('  ')
  const lastName  = capitalise(nameSplit[0]?.trim() || '')
  const firstName = capitalise(nameSplit[1]?.trim() || '')

  return {
    docType:    'passport',
    lastName,
    firstName,
    cinNumber:  passportNumber,
    dateOfBirth: dob,
    cinExpiry:  expiry,
    nationality: nationalityCode === 'MAR' ? 'Marocain' : nationalityCode,
    gender,
  }
}

// ── Moroccan CIN (CNIE) parser ────────────────────────────

/**
 * Extract fields from OCR text of a Moroccan CIN card.
 * Handles format variations (old green card + new biometric CNIE).
 */
export function parseCIN(text) {
  const t = text.replace(/\r/g, '\n')
  const result = {}

  // CIN number: letter(s) followed by 5-8 digits  e.g. BK123456, A123456, EE123456
  const cinMatch = t.match(/\b([A-Z]{1,2}\d{5,8})\b/)
  if (cinMatch) result.cinNumber = cinMatch[1]

  // Expiry date — look for "Valable jusqu'au" or "تاريخ الانتهاء" or standalone date after validity keyword
  const expiryPatterns = [
    /valable\s+jusqu['']?au\s*:?\s*([\d\/\.\-\s\w]+)/i,
    /expir[yi]\s*:?\s*([\d\/\.\-\s\w]+)/i,
    /date\s+d[''e]?x?piration\s*:?\s*([\d\/\.\-\s\w]+)/i,
    // fallback: last date on the card is usually expiry
  ]
  for (const re of expiryPatterns) {
    const m = t.match(re)
    if (m) { result.cinExpiry = normaliseDate(m[1].trim().split('\n')[0].trim()); break }
  }

  // Date of birth
  const dobPatterns = [
    /n[ée]\s*(?:le|à|:)?\s*([\d\/\.\-\s]+(?:jan|fév|mar|avr|mai|juin|juil|aoû|sep|oct|nov|déc|\d{4})[^\n]*)/i,
    /date\s+de\s+naissance\s*:?\s*([\d\/\.\-\s\w]+)/i,
    /تاريخ\s+الازدياد\s*:?\s*([\d\/\.\-\s]+)/,
  ]
  for (const re of dobPatterns) {
    const m = t.match(re)
    if (m) { result.dateOfBirth = normaliseDate(m[1].trim().split('\n')[0].trim()); break }
  }

  // Name — line after "NOM" / "اسم العائلة" or first all-caps line
  const nomMatch = t.match(/(?:nom\s*:?\s*|surname\s*:?\s*)([A-ZÀ-Ÿ\s\-]+)/i)
  if (nomMatch) result.lastName = capitalise(nomMatch[1].trim())

  const prenomMatch = t.match(/(?:pr[ée]nom\s*:?\s*|given\s*names?\s*:?\s*)([A-ZÀ-Ÿa-zà-ÿ\s\-]+)/i)
  if (prenomMatch) result.firstName = capitalise(prenomMatch[1].trim())

  // Fallback: if no name found, try first two all-caps tokens on separate lines
  if (!result.lastName) {
    const capsLines = t.split('\n').map(l => l.trim()).filter(l => /^[A-ZÀ-Ÿ\s\-]{3,}$/.test(l) && l.length > 2)
    if (capsLines[0]) result.lastName  = capitalise(capsLines[0])
    if (capsLines[1]) result.firstName = capitalise(capsLines[1])
  }

  result.nationality = 'Marocain'
  result.docType = 'cin'
  return result
}

// ── Driving Licence parser ────────────────────────────────

export function parseLicence(text) {
  const t = text.replace(/\r/g, '\n')
  const result = {}

  // Licence number: varies — typically B followed by digits or all-digit
  const licMatch = t.match(/\b([A-Z]?\d{7,10})\b/)
  if (licMatch) result.drivingLicenseNumber = licMatch[1]

  // Expiry: "4b." field in EU/Moroccan format or explicit date
  const expPatterns = [
    /4b\.?\s*:?\s*([\d\/\.\-\s\w]+)/i,
    /expir[yi]\s*:?\s*([\d\/\.\-\s\w]+)/i,
    /valable\s+jusqu['']?au\s*:?\s*([\d\/\.\-\s\w]+)/i,
  ]
  for (const re of expPatterns) {
    const m = t.match(re)
    if (m) { result.licenseExpiry = normaliseDate(m[1].trim().split('\n')[0].trim()); break }
  }

  return result
}

// ── Main OCR function ─────────────────────────────────────

/**
 * Run Tesseract OCR on a file and extract client fields.
 * @param {File} file — image file (JPG, PNG) or PDF
 * @param {'cin'|'license'} docType
 * @param {(pct: number) => void} onProgress — progress callback 0-100
 * @returns {Promise<object>} extracted fields (CNDP: text only, no image)
 */
export async function runOCR(file, docType, onProgress) {
  const worker = await createWorker(['fra', 'ara', 'eng'], 1, {
    logger: ({ status, progress }) => {
      if (status === 'recognizing text') onProgress?.(Math.round(progress * 100))
    },
  })

  try {
    const { data: { text } } = await worker.recognize(file)

    // Try MRZ first (works for passports regardless of docType hint)
    const mrzResult = parseMRZ(text)
    if (mrzResult) return mrzResult

    if (docType === 'cin') return parseCIN(text)
    if (docType === 'license') return parseLicence(text)
    return {}
  } finally {
    await worker.terminate()
  }
}
