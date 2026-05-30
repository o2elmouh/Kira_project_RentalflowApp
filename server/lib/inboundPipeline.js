/**
 * Inbound WhatsApp message pipeline — extracted from server/routes/leads.js
 * so that whatsapp.js no longer imports from another route file.
 *
 * Exports:
 *   normaliseJidToPhone(jid)
 *   findMatchingDemand(agencyId, senderIdOrName, extractedData)
 *   getClientStatus(agencyId, senderJid)
 *   extractWithClaude(imageBlocks, textHint)
 *   classifyTextMessage(bodyText, clientStatus)
 *   handleInboundWhatsApp(agencyId, senderJid, imageBuffer, mimeType, bodyText)
 */

import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from './supabaseAdmin.js'
import { detectLanguage, translateToFrench, preFilter, handleAmbiguous, CORE_LANGS } from './triage.js'
import { appendConversation } from './conversation.js'
import { isLeadableWhatsAppSender } from './whatsappSender.js'

// ── Singleton Anthropic client ────────────────────────────
let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// ── Claude Vision prompt (image/document OCR) ────────────
const GLOBAL_SYSTEM_PROMPT = `You are a precise global identity document parser and rental intent extractor.
Documents may be in any language. Dates in any format — convert all to YYYY-MM-DD.

Return ONLY valid JSON — no markdown — matching this exact schema:
{
  "documentType": "ID_CARD" | "DRIVING_LICENSE" | "PASSPORT" | "UNKNOWN",
  "issuingCountry": "<ISO-3166-1 alpha-3>",
  "firstName": string,
  "lastName": string,
  "documentNumber": string,
  "dateOfBirth": "YYYY-MM-DD" | null,
  "expiryDate": "YYYY-MM-DD" | null,
  "rentalIntent": {
    "detected": boolean,
    "startDate": "YYYY-MM-DD" | null,
    "endDate": "YYYY-MM-DD" | null,
    "vehicleClass": string | null
  },
  "confidenceScores": {
    "firstName": 0.0-1.0,
    "lastName": 0.0-1.0,
    "documentNumber": 0.0-1.0,
    "expiryDate": 0.0-1.0,
    "dateOfBirth": 0.0-1.0
  }
}

If a mandatory field (firstName, lastName, documentNumber) cannot be read, set it to "" and confidence to 0.
For rentalIntent: scan any accompanying text for date mentions or vehicle class keywords (sedan, SUV, etc.).
issuingCountry rules: Moroccan CIN/driving licence = "MAR". Infer from document layout and language otherwise.`

// ── Claude routing prompt (text messages) ────────────────
const ROUTING_SYSTEM_PROMPT = `You are an intelligent lead routing assistant for "Rentalflow", a car rental agency in Morocco.
Your job is to analyze incoming WhatsApp messages, categorize them, and extract relevant data.
Clients may speak in French, Standard Arabic, or Moroccan Darija.

You will receive an input object containing:
1. "client_status": Either "active_contract" (they currently have a car) or "no_contract".
2. "message": The transcribed text or text message sent by the user.

You must output ONLY a raw JSON object. Do not include markdown formatting like \`\`\`json.
Do not include any conversational text.

Categorize the "classification" field into exactly one of these four options:
- "prolongation": An active client wants to extend their rental.
- "new_lead": A new client wants to rent a car or asks for prices.
- "support_issue": An active client is reporting an accident, breakdown, or issue.
- "other": General questions or unrecognizable intents.

Your output must match this exact JSON structure:
{
  "classification": "string",
  "confidence": number (0.0 to 1.0),
  "extracted_data": {
    "requested_car": "string or null",
    "start_date": "string (ISO format or descriptive) or null",
    "end_date": "string or null",
    "pickup_location": "string or null (city or address where the client wants to pick up the car)",
    "return_location": "string or null (city or address where the client wants to return the car, if different from pickup)",
    "requested_extra_days": "number or null",
    "has_id_documents": boolean (true if they mention sending IDs/photos)
  },
  "summary_for_agent": "A short, 1-sentence summary of what the client wants."
}`

// ── Normalise JID to phone digits ─────────────────────────
export function normaliseJidToPhone(jid) {
  if (!jid) return null
  if (jid.endsWith('@lid')) return null
  return jid.replace(/@.*$/, '').replace(/\D/g, '') || null
}

// ── Fuzzy name matching (Levenshtein distance) ────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normaliseName(name) {
  return (name || '').toLowerCase().replace(/[\s\-']/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Returns match score 0-1. >= 0.75 = strong match, >= 0.6 = potential match.
 */
function nameMatchScore(nameA, nameB) {
  const a = normaliseName(nameA), b = normaliseName(nameB)
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// ── Find existing pending demand to merge with ────────────
export async function findMatchingDemand(agencyId, senderIdOrName, extractedData) {
  const WINDOW_MINUTES = 30

  // 1. Same sender within 30 min
  const { data: recent } = await supabaseAdmin
    .from('pending_demands')
    .select('id, sender_id, extracted_data, created_at')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  if (!recent?.length) return null

  // Same sender_id = definitive merge
  const sameSender = recent.find(d => d.sender_id === senderIdOrName)
  if (sameSender) return { demand: sameSender, score: 1.0, type: 'sender' }

  // Fuzzy name match across recent demands
  if (extractedData?.firstName && extractedData?.lastName) {
    const incomingName = `${extractedData.firstName} ${extractedData.lastName}`
    for (const d of recent) {
      const ex = d.extracted_data
      if (!ex?.firstName) continue
      const existingName = `${ex.firstName} ${ex.lastName}`
      const score = nameMatchScore(incomingName, existingName)
      if (score >= 0.6) return { demand: d, score, type: score >= 0.75 ? 'strong' : 'potential' }
    }
  }

  return null
}

// ── Client status lookup ──────────────────────────────────
/**
 * Given a JID like "212XXXXXXXXX@s.whatsapp.net", checks whether the sender
 * has an active contract at this agency.
 */
export async function getClientStatus(agencyId, senderJid) {
  try {
    const digits = senderJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    // Moroccan local format: strip leading country code
    const localVariants = [digits, digits.replace(/^212/, '0')]

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('agency_id', agencyId)
      .in('phone', localVariants)
      .limit(1)

    if (!clients?.length) return 'no_contract'

    const { data: contracts } = await supabaseAdmin
      .from('contracts')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('client_id', clients[0].id)
      .eq('status', 'active')
      .limit(1)

    return contracts?.length ? 'active_contract' : 'no_contract'
  } catch {
    return 'no_contract'
  }
}

// ── Claude Vision OCR extraction ──────────────────────────
// imageBlocks: Array<{type:'image', source:{type:'base64', media_type:string, data:string}}>
export async function extractWithClaude(imageBlocks, textHint = '') {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const message = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: GLOBAL_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: textHint
            ? `Additional context from the sender: "${textHint}"\n\nExtract all identity fields and rental intent.`
            : 'Extract all identity fields and rental intent from these document images.',
        },
      ],
    }],
  })

  const raw = message.content?.[0]?.text?.trim() ?? ''
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    console.error('[inboundPipeline] Claude returned non-JSON:', raw.slice(0, 200))
    return null
  }
}

// ── Text message classifier ───────────────────────────────
export async function classifyTextMessage(bodyText, clientStatus) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: ROUTING_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({ client_status: clientStatus, message: bodyText }),
      }],
    })
    const raw = message.content?.[0]?.text?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(clean)
  } catch (err) {
    console.error('[inboundPipeline/classify] error:', err.message)
    return null
  }
}

/**
 * Called directly by the Baileys inbound listener (no HTTP round-trip).
 * @param {string}         agencyId
 * @param {string}         senderJid   — e.g. "212XXXXXXXXX@s.whatsapp.net"
 * @param {Buffer|null}    imageBuffer — raw image bytes (never persisted)
 * @param {string}         mimeType    — e.g. "image/jpeg"
 * @param {string}         bodyText    — text body or Whisper transcript
 */
export async function handleInboundWhatsApp(agencyId, senderJid, imageBuffer, mimeType, bodyText) {
  // Drop status broadcasts, group messages, channels, and LID pseudonyms
  // before any pipeline work — these never represent a real 1:1 inquiry.
  if (!isLeadableWhatsAppSender(senderJid)) {
    console.log(`[inboundPipeline] ✗ dropped — non-leadable sender: ${senderJid}`)
    return
  }

  let extractedData = null

  // Triage gate — language detection → keyword pre-filter → ambiguous handler
  if (bodyText?.trim()) {
    const lang = detectLanguage(bodyText)
    const translatedText = (!CORE_LANGS.has(lang) && lang !== 'und')
      ? await translateToFrench(bodyText)
      : null
    const textToFilter = translatedText ?? bodyText
    const { result, matchedKeywords } = preFilter(textToFilter)

    if (result === 'fail') {
      console.log(`[inboundPipeline] pre-filter dropped: no rental keywords (lang=${lang})`)
      return
    }

    if (result === 'ambiguous') {
      console.log(`[inboundPipeline] pre-filter ambiguous: keywords=[${matchedKeywords.join(',')}]`)
      await handleAmbiguous({
        agencyId,
        senderId: senderJid,
        source: 'whatsapp',
        originalText: bodyText,
        translatedText,
        rawPayload: { body: bodyText, from: senderJid },
      })
      return
    }

    // result === 'pass' — continue to extraction below
    console.log(`[inboundPipeline] pre-filter pass: keywords=[${matchedKeywords.join(',')}]`)
  }

  if (imageBuffer && process.env.ANTHROPIC_API_KEY) {
    // Process & Purge — send buffer directly to Claude as base64, never stored
    try {
      const imageBlock = { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBuffer.toString('base64') } }
      extractedData = await extractWithClaude([imageBlock], bodyText)
      // Document scan = always a new lead; also extract rental intent from caption if present
      if (extractedData) {
        extractedData.classification = 'new_lead'
        if (bodyText?.trim()) {
          try {
            const clientStatus = await getClientStatus(agencyId, senderJid)
            const captionClass = await classifyTextMessage(bodyText, clientStatus)
            if (captionClass) {
              extractedData = {
                ...extractedData,
                ...captionClass.extracted_data,
                ...(captionClass.classification && { classification: captionClass.classification }),
                ...(captionClass.summary_for_agent && { summary_for_agent: captionClass.summary_for_agent }),
              }
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      console.error('[inboundPipeline] Claude error:', err.message)
    }
  } else if (bodyText?.trim()) {
    try {
      const clientStatus = await getClientStatus(agencyId, senderJid)
      const classification = await classifyTextMessage(bodyText, clientStatus)
      if (classification) {
        extractedData = {
          classification: classification.classification,
          confidence: classification.confidence,
          summary_for_agent: classification.summary_for_agent,
          ...classification.extracted_data,
        }
      }
    } catch (err) {
      console.error('[inboundPipeline] classify error:', err.message)
    }
  }

  const match = await findMatchingDemand(agencyId, senderJid, extractedData)

  if (match && match.type !== 'potential') {
    const existing = match.demand
    await supabaseAdmin.from('pending_demands').update({
      extracted_data: { ...(existing.extracted_data || {}), ...(extractedData || {}) },
      media_urls: existing.media_urls || [],
      confidence_scores: extractedData?.confidenceScores || null,
      match_score: match.score,
      raw_payload: { ...existing.raw_payload, latestBody: bodyText },
    }).eq('id', existing.id)
  } else {
    const { error } = await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'whatsapp',
      sender_id: senderJid,
      raw_payload: { body: bodyText, from: senderJid },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: [],
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
    })
    if (error) console.error('[inboundPipeline] insert error:', error.message)
  }
}
