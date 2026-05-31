import { franc } from 'franc'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from './supabaseAdmin.js'

// ── Module-level Anthropic client (instantiated once) ────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// ── Core languages that skip translation ─────────────────
export const CORE_LANGS = new Set(['fra', 'ara', 'eng'])

// ── Keyword dictionary ────────────────────────────────────
const KEYWORDS = {
  high: [
    // French
    'location', 'louer', 'réserver', 'réservation', 'prolongation', 'restitution', 'caution',
    // Darija / Arabic
    'كراء', 'كري', 'حجز', 'تأجير', 'تمديد',
    // English
    'rental', 'rent', 'hire', 'reserve', 'booking', 'reservation',
    // Dutch
    'huren', 'reservering', 'huurwagen', 'boeken',
    // German
    'mieten', 'mietwagen', 'reservieren', 'buchen',
  ],
  medium: [
    // French
    'voiture', 'véhicule', 'contrat', 'assurance', 'panne', 'accident', 'permis', 'kilométrage',
    // French — rental duration (specific enough to stay medium)
    'semaine', 'semaines', 'journée', 'journées',
    // Darija / Arabic
    'سيارة', 'طوموبيل', 'عقد', 'تأمين', 'رخصة', 'بنزين', 'حادث', 'بريكاج',
    // English
    'car', 'vehicle', 'contract', 'insurance', 'breakdown', 'accident', 'license', 'mileage', 'fuel',
    // Dutch
    'auto', 'contract', 'voertuig', 'verzekering', 'pech', 'ongeluk', 'rijbewijs',
    // German
    'auto', 'fahrzeug', 'vertrag', 'versicherung', 'panne', 'unfall', 'führerschein',
  ],
  low: [
    // French
    'prix', 'tarif', 'disponible', 'disponibilité', 'renseigner', 'renseignement', 'besoin',
    // Dutch/German prices
    'prijs', 'preis',
    // English
    'price', 'rate', 'available', 'need',
    // Arabic
    'ثمن', 'سعر', 'متاح',
    // Duration words — moved from medium: too generic as standalone words in any language
    // ("heard in the last week", "delivered in 3 days", etc. appear in non-rental emails)
    'week', 'weeks', 'days', 'weken', 'woche', 'wochen',
  ],
}

// ── Deduplicate keywords to prevent double-counting ────────
KEYWORDS.high   = [...new Set(KEYWORDS.high)]
KEYWORDS.medium = [...new Set(KEYWORDS.medium)]
KEYWORDS.low    = [...new Set(KEYWORDS.low)]

// ── detectLanguage ────────────────────────────────────────
export function detectLanguage(text) {
  if (!text?.trim()) return 'und'
  return franc(text) ?? 'und'
}

// ── Word-boundary keyword matcher ─────────────────────────
// Arabic/Darija has no word-boundary concept — use includes().
// Latin keywords use \b to avoid matching substrings (e.g. 'auto' inside 'automatically').
function matchesKeyword(lowerText, word) {
  if (/[؀-ۿ]/.test(word)) return lowerText.includes(word)
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerText)
}

// ── Strip URLs and email addresses ────────────────────────
// Tracking parameters (e.g. `&auto=true`) and email-address labels routinely
// contain keywords from the dictionary and produce false-positive triage hits.
// Replace with whitespace so word boundaries on either side are preserved.
function stripUrlsAndEmails(text) {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bmailto:\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
}

// ── preFilter ─────────────────────────────────────────────
export function preFilter(text) {
  if (!text?.trim()) return { result: 'fail', matchedKeywords: [] }

  const lower = stripUrlsAndEmails(text).toLowerCase()
  const matched = { high: [], medium: [], low: [] }

  for (const word of KEYWORDS.high) {
    if (matchesKeyword(lower, word)) matched.high.push(word)
  }
  for (const word of KEYWORDS.medium) {
    if (matchesKeyword(lower, word)) matched.medium.push(word)
  }
  for (const word of KEYWORDS.low) {
    if (matchesKeyword(lower, word)) matched.low.push(word)
  }

  const allMatched = [...matched.high, ...matched.medium, ...matched.low]

  // PASS conditions
  if (matched.high.length >= 1) return { result: 'pass', matchedKeywords: allMatched }
  if (matched.medium.length >= 2) return { result: 'pass', matchedKeywords: allMatched }
  if (matched.medium.length >= 1 && matched.low.length >= 2) return { result: 'pass', matchedKeywords: allMatched }

  // AMBIGUOUS conditions
  if (matched.medium.length >= 1) return { result: 'ambiguous', matchedKeywords: allMatched }
  if (matched.low.length >= 3) return { result: 'ambiguous', matchedKeywords: allMatched }

  return { result: 'fail', matchedKeywords: [] }
}

// ── translateToFrench ─────────────────────────────────────
export async function translateToFrench(text) {
  if (!anthropic || !text?.trim()) return text
  try {
    const msg = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      system: 'Traduis le message suivant en français. Réponds uniquement avec la traduction, sans explication.',
      messages: [{ role: 'user', content: text }],
    })
    return msg.content?.[0]?.text?.trim() ?? text
  } catch (err) {
    console.error('[triage/translate] error:', err.message)
    return text
  }
}

// ── summarizeForAlert ─────────────────────────────────────
async function summarizeForAlert(frenchText) {
  if (!anthropic) return null
  try {
    const msg = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 50,
      system: `Tu es un assistant pour une agence de location de voitures.
Résume le message suivant en UNE phrase courte (max 15 mots).
Décris l'intention de l'expéditeur. Réponds uniquement avec la phrase, sans ponctuation finale.`,
      messages: [{ role: 'user', content: frenchText }],
    })
    return msg.content?.[0]?.text?.trim() ?? null
  } catch (err) {
    console.error('[triage/summarize] error:', err.message)
    return null
  }
}

// ── handleAmbiguous ───────────────────────────────────────
/**
 * Translates (if needed), summarizes, and saves an ambiguous message as an alert.
 * @param {object} params
 * @param {string} params.agencyId
 * @param {string} params.senderId       — email or WhatsApp JID
 * @param {string} params.source         — 'gmail' | 'whatsapp'
 * @param {string} params.originalText   — raw message text
 * @param {string|null} params.translatedText — pre-translated text (from Step 1) or null
 * @param {object} [params.rawPayload]   — original raw payload for audit trail
 */
export async function handleAmbiguous({ agencyId, senderId, source, originalText, translatedText, rawPayload }) {
  const lang = detectLanguage(originalText)
  const frenchText = translatedText ?? (CORE_LANGS.has(lang) ? originalText : await translateToFrench(originalText))
  const summary = await summarizeForAlert(frenchText)

  const { error } = await supabaseAdmin.from('pending_demands').insert({
    agency_id: agencyId,
    source,
    sender_id: senderId,
    raw_payload: rawPayload ?? { body: originalText },
    extracted_data: {
      classification: 'alert',
      translated_body: frenchText,
      summary_for_agent: summary,
    },
    classification: 'alert',
  })

  if (error) console.error(`[triage/handleAmbiguous] insert error:`, error.message)
}

// ── detectMissingDocs ───────────────────────────────────────
/**
 * Inspect a lead's extracted_data to determine which of the two
 * Moroccan rental documents (CIN, permis) have not yet been captured.
 *
 * @param {object|null|undefined} extractedData
 * @returns {{ needsCIN: boolean, needsPermis: boolean }}
 */
export function detectMissingDocs(extractedData) {
  const ex = extractedData || {}
  // v1.14.14+: typed fields (cinNumber / drivingLicenseNumber) are the
  // canonical shape. Falls back to legacy keys (cin / permis / flat
  // documentType+documentNumber) for rows written before the normalizer.
  const hasCIN = Boolean(
    ex.cinNumber ||
    ex.cin ||
    ((ex.documentType === 'cin' || ex.documentType === 'CIN' || ex.documentType === 'ID_CARD') && ex.documentNumber)
  )
  const hasPermis = Boolean(
    ex.drivingLicenseNumber ||
    ex.permis ||
    ((ex.documentType === 'DRIVING_LICENSE' || ex.documentType === 'permis') && ex.documentNumber)
  )
  return { needsCIN: !hasCIN, needsPermis: !hasPermis }
}
