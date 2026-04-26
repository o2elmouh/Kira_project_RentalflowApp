import { franc } from 'franc'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from './supabaseAdmin.js'

// ── Module-level Anthropic client (instantiated once) ────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// ── Core languages that skip translation ─────────────────
const CORE_LANGS = new Set(['fra', 'ara', 'eng'])

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
    // French — rental duration (week/day = unambiguous rental intent)
    'semaine', 'semaines', 'journée', 'journées',
    // Darija / Arabic
    'سيارة', 'طوموبيل', 'عقد', 'تأمين', 'رخصة', 'بنزين', 'حادث', 'بريكاج',
    // English
    'car', 'vehicle', 'contract', 'insurance', 'breakdown', 'accident', 'license', 'mileage', 'fuel',
    // English — rental duration
    'week', 'weeks', 'days',
    // Dutch
    'auto', 'contract', 'voertuig', 'verzekering', 'pech', 'ongeluk', 'rijbewijs',
    // Dutch — duration
    'week', 'weken',
    // German
    'auto', 'fahrzeug', 'vertrag', 'versicherung', 'panne', 'unfall', 'führerschein',
    // German — duration
    'woche', 'wochen',
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

// ── preFilter ─────────────────────────────────────────────
export function preFilter(text) {
  if (!text?.trim()) return { result: 'fail', matchedKeywords: [] }

  const lower = text.toLowerCase()
  const matched = { high: [], medium: [], low: [] }

  for (const word of KEYWORDS.high) {
    if (lower.includes(word.toLowerCase())) matched.high.push(word)
  }
  for (const word of KEYWORDS.medium) {
    if (lower.includes(word.toLowerCase())) matched.medium.push(word)
  }
  for (const word of KEYWORDS.low) {
    if (lower.includes(word.toLowerCase())) matched.low.push(word)
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
