/**
 * POST /leads/webhook/gmail      — Called by the Gmail poller when a new message arrives
 * (WhatsApp inbound is handled by Baileys sessionManager — no HTTP webhook needed)
 * GET  /leads                   — List pending demands for the authenticated agency
 * PATCH /leads/:id/status       — Update status (processed / ignored)
 * GET  /leads/:id               — Get single demand
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ENCRYPTION_KEY  — 32-byte hex string for AES-256-GCM (openssl rand -hex 32)
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'
import { detectLanguage, translateToFrench, preFilter, handleAmbiguous } from '../lib/triage.js'
// Encryption helpers moved to server/lib/encryption.js so the new clients
// route (Phase 5) and the leads pipeline share one AES-256-GCM implementation.
// Re-exported here to preserve any existing import paths.
import { encrypt, decrypt } from '../lib/encryption.js'
import { sendToAgency } from '../lib/pushNotifications.js'
export { encrypt, decrypt }

const router = Router()

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
  return (name || '').toLowerCase().replace(/[\s\-']/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

// imageBlocks: Array<{type:'image', source:{type:'base64', media_type:string, data:string}}>
async function extractWithClaude(imageBlocks, textHint = '') {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
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
    console.error('[leads] Claude returned non-JSON:', raw.slice(0, 200))
    return null
  }
}

// ── Find existing pending demand to merge with ────────────
async function findMatchingDemand(agencyId, senderIdOrName, extractedData) {
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


// ── POST /leads/webhook/gmail ─────────────────────────────
// Called internally by the Gmail poller (server/routes/gmail.js).
// SECURITY: This endpoint is internal-only. Block external calls via a shared secret.
function requireInternalSecret(req, res, next) {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!secret) {
    // Fail closed in production: if the secret isn't configured, refuse the
    // request rather than accepting anonymous lead injections. Dev still
    // skips the check so local testing doesn't require the env var.
    if (process.env.NODE_ENV === 'production') {
      console.error('[pipeline:gmail-wh] ✗ INTERNAL_WEBHOOK_SECRET missing in production — rejecting')
      return res.status(503).json({ error: 'Webhook secret not configured' })
    }
    return next()
  }
  const provided = req.headers['x-internal-secret']
  if (provided !== secret) {
    console.warn('[pipeline:gmail-wh] ✗ invalid or missing X-Internal-Secret header')
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

router.post('/webhook/gmail', requireInternalSecret, async (req, res) => {
  const { agencyId, senderEmail, subject, bodyText, attachments } = req.body

  if (!agencyId || !senderEmail) {
    return res.status(400).json({ error: 'agencyId and senderEmail required' })
  }

  // SECURITY: mask sender email in logs to protect PII
  const maskedSender = senderEmail ? senderEmail.replace(/(.{2}).*@/, '$1***@') : '?'
  console.log(`[pipeline:gmail-wh] ← email | agency=${agencyId} | from=${maskedSender} | images=${(attachments || []).length}`)

  let extractedData = null
  const mediaUrls = []

  const textForTriage = [subject, bodyText].filter(Boolean).join('\n\n')

  // Pre-triage: if sender has an offer_sent lead, bypass keyword triage
  const gmailOfferLead = await findOfferSentLeadByEmail(agencyId, senderEmail)
  if (gmailOfferLead) {
    await handleOfferResponse(agencyId, senderEmail, textForTriage, gmailOfferLead, 'gmail')
    return res.json({ ok: true, offer_response: true })
  }

  if (textForTriage) {
    const lang = detectLanguage(textForTriage)
    const CORE = new Set(['fra', 'ara', 'eng'])
    const translatedText = (!CORE.has(lang) && lang !== 'und')
      ? await translateToFrench(textForTriage)
      : null
    const textToFilter = translatedText ?? textForTriage
    const { result, matchedKeywords } = preFilter(textToFilter)

    console.log(`[pipeline:gmail-wh] → triage | lang=${lang} | result=${result} | keywords=[${matchedKeywords.join(',')}]`)

    if (result === 'fail') {
      console.log(`[pipeline:gmail-wh] ✗ dropped — no rental keywords`)
      return res.json({ ok: true, dropped: true })
    }

    if (result === 'ambiguous') {
      console.log(`[pipeline:gmail-wh] → ambiguous — creating alert`)
      await handleAmbiguous({
        agencyId,
        senderId: senderEmail,
        source: 'gmail',
        originalText: textForTriage,
        translatedText,
        rawPayload: { subject, bodyText: (bodyText || '').slice(0, 2000) },
      })
      return res.json({ ok: true, alert: true })
    }
  }

  const imageBlocks = (attachments || [])
    .filter(a => a.base64 && a.mimeType?.startsWith('image/'))
    .map(a => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }))

  if (imageBlocks.length && process.env.ANTHROPIC_API_KEY) {
    console.log(`[pipeline:gmail-wh] → Claude extraction (${imageBlocks.length} images)`)
    try {
      extractedData = await extractWithClaude(imageBlocks, bodyText || subject)
      console.log(`[pipeline:gmail-wh] → extraction result: classification=${extractedData?.classification} | confidence=${extractedData?.confidence}`)
    } catch (err) {
      console.error('[pipeline:gmail-wh] ✗ Claude extraction error:', err.message)
    }
  }

  if (!extractedData && (bodyText || subject) && process.env.ANTHROPIC_API_KEY) {
    console.log(`[pipeline:gmail-wh] → Claude classification (text)`)
    try {
      const textToClassify = [subject, bodyText].filter(Boolean).join('\n\n')
      const classification = await classifyTextMessage(textToClassify, 'no_contract')
      if (classification) {
        // Skip messages classified as "other" — not rental-related
        if (classification.classification === 'other') {
          console.log(`[pipeline:gmail-wh] ✗ rejected — classified as "other" (${classification.confidence})`)
          return res.json({ ok: true, dropped: true })
        }
        extractedData = {
          classification: classification.classification,
          confidence: classification.confidence,
          summary_for_agent: classification.summary_for_agent,
          ...classification.extracted_data,
        }
        console.log(`[pipeline:gmail-wh] → classification: ${classification.classification} (${classification.confidence}) | summary="${(classification.summary_for_agent || '').slice(0, 60)}"`)
      } else {
        console.warn(`[pipeline:gmail-wh] → classification returned null`)
      }
    } catch (err) {
      console.error('[pipeline:gmail-wh] ✗ text classification error:', err.message)
    }
  }

  for (const a of (attachments || [])) {
    if (a.base64 && a.mimeType?.startsWith('image/')) {
      mediaUrls.push(`data:${a.mimeType};base64,${a.base64}`)
    }
  }

  const match = await findMatchingDemand(agencyId, senderEmail, extractedData)
  console.log(`[pipeline:gmail-wh] → match: ${match ? `${match.type} (score=${match.score}) id=${match.demand.id}` : 'none — new lead'}`)

  if (match && match.type !== 'potential') {
    const { error } = await supabaseAdmin
      .from('pending_demands')
      .update({
        extracted_data: { ...(match.demand.extracted_data || {}), ...(extractedData || {}) },
        media_urls: [...(match.demand.media_urls || []), ...mediaUrls],
        confidence_scores: extractedData?.confidenceScores || null,
        match_score: match.score,
        ...(extractedData?.classification ? { classification: extractedData.classification } : {}),
      })
      .eq('id', match.demand.id)
    if (error) console.error('[pipeline:gmail-wh] ✗ update error:', error.message)
    else console.log(`[pipeline:gmail-wh] ✓ lead updated id=${match.demand.id}`)
  } else {
    const { data: inserted, error } = await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'gmail',
      sender_id: senderEmail,
      raw_payload: { subject, bodyText: (bodyText || '').slice(0, 2000) },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: mediaUrls,
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
      classification: extractedData?.classification || null,
    }).select('id').maybeSingle()
    if (error) console.error('[pipeline:gmail-wh] ✗ insert error:', error.message)
    else {
      console.log(`[pipeline:gmail-wh] ✓ lead inserted id=${inserted?.id}`)
      if (inserted?.id) {
        const summary = extractedData?.summary_for_agent
          || (bodyText || subject || '').slice(0, 120)
          || `Nouveau message de ${senderEmail}`
        sendToAgency(agencyId, 'Nouvelle demande Gmail', summary, {
          type: 'lead',
          id: inserted.id,
          source: 'gmail',
        }).catch(() => {})
      }
    }
  }

  res.json({ ok: true })
})

// GET /leads/media?url=... — public image proxy (no auth — bucket is already public)
// <img> tags cannot send Authorization headers, so this must be unauthenticated.
// Security: only Supabase Storage URLs are forwarded (SSRF prevention).
router.get('/media', async (req, res) => {
  const { url } = req.query
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return res.status(400).end()
  // Fail closed: if SUPABASE_URL is not configured, refuse to proxy anything
  // rather than accept arbitrary https targets (SSRF). Also verify origin
  // matches exactly to prevent `https://supabase.co.attacker.com/...` tricks.
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) return res.status(503).end()
  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).end() }
  const allowedHost = new URL(supabaseUrl).host
  if (parsed.host !== allowedHost) return res.status(403).end()
  try {
    const upstream = await fetch(url)
    if (!upstream.ok) return res.status(upstream.status).end()
    const ct = upstream.headers.get('content-type') || 'image/jpeg'
    res.set('Content-Type', ct)
    res.set('Cache-Control', 'public, max-age=86400')
    const buf = await upstream.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (err) {
    console.error('[leads/media]', err.message)
    res.status(500).end()
  }
})

// ── Authenticated routes (premium required) ───────────────
router.use(requireAuth, requirePremium)

// GET /leads — list pending demands
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending'
  const classification = req.query.classification

  const VALID_CLASSIFICATIONS = ['alert', 'normal', 'spam']
  if (classification && !VALID_CLASSIFICATIONS.includes(classification)) {
    return res.status(400).json({ error: 'Invalid classification' })
  }

  const VALID_STATUSES_GET = ['pending', 'waiting', 'offer_sent', 'accepted', 'ignored']
  if (!VALID_STATUSES_GET.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  let query = supabaseAdmin
    .from('pending_demands')
    .select('id, agency_id, sender_id, source, status, classification, extracted_data, offered_vehicle_id, offered_price_total, media_urls, created_at, updated_at')
    .eq('agency_id', req.user.agency_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (classification) {
    query = query.eq('classification', classification).neq('status', 'ignored')
  } else {
    query = query.eq('status', status).or('classification.neq.alert,classification.is.null')
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /leads/:id — single demand
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .select('id, agency_id, sender_id, source, status, classification, extracted_data, offered_vehicle_id, offered_price_total, media_urls, conversation, created_at, updated_at')
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// PATCH /leads/:id/status
const VALID_STATUSES = ['pending', 'processed', 'ignored', 'waiting', 'offer_sent', 'accepted', 'converted']
const VALID_PATCH_CLASSIFICATIONS = ['lead', 'alert', 'normal', 'spam']
router.patch('/:id/status', async (req, res) => {
  const { status, classification } = req.body
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join('|')}` })
  }
  if (classification !== undefined && !VALID_PATCH_CLASSIFICATIONS.includes(classification)) {
    return res.status(400).json({ error: `classification must be one of: ${VALID_PATCH_CLASSIFICATIONS.join('|')}` })
  }

  const update = { status }
  if (classification !== undefined) update.classification = classification

  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .update(update)
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id)
    .select()
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// PATCH /leads/:id/extracted — update AI-extracted fields (manager corrections)
router.patch('/:id/extracted', async (req, res) => {
  const { extracted_data } = req.body
  if (!extracted_data) return res.status(400).json({ error: 'extracted_data required' })

  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .update({ extracted_data })
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id)
    .select()
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// ── Client status lookup ──────────────────────────────────
/**
 * Given a JID like "212XXXXXXXXX@s.whatsapp.net", checks whether the sender
 * has an active contract at this agency.
 */
async function getClientStatus(agencyId, senderJid) {
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

// ── Text message classifier ───────────────────────────────
async function classifyTextMessage(bodyText, clientStatus) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
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
    console.error('[leads/classify] error:', err.message)
    return null
  }
}

// ── Offer-response pre-triage helpers ────────────────────

async function findOfferSentLeadByPhone(agencyId, senderJid) {
  try {
    const digits9 = (senderJid || '').replace(/\D/g, '').slice(-9)
    if (!digits9) return null
    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id, raw_payload, extracted_data')
      .eq('agency_id', agencyId)
      .eq('status', 'offer_sent')
      .order('created_at', { ascending: false })
      .limit(20)
    return (leads || []).find(l =>
      (l.sender_id || '').replace(/\D/g, '').slice(-9) === digits9
    ) || null
  } catch (err) {
    console.error('[leads/findOfferSentLeadByPhone] error:', err.message)
    return null
  }
}

async function findOfferSentLeadByEmail(agencyId, senderEmail) {
  try {
    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id, raw_payload, extracted_data')
      .eq('agency_id', agencyId)
      .eq('status', 'offer_sent')
      .eq('sender_id', senderEmail)
      .order('created_at', { ascending: false })
      .limit(1)
    return leads?.[0] || null
  } catch (err) {
    console.error('[leads/findOfferSentLeadByEmail] error:', err.message)
    return null
  }
}

async function handleOfferResponse(agencyId, senderId, text, lead, source) {
  console.log(`[pipeline:${source}] → offer response | lead=${lead.id} | sender=${senderId}`)
  const intent = text?.trim() ? await analyzeQuoteReply(text) : 'question'
  const existingReplies = lead.raw_payload?.replies || []
  const newReply = { text: (text || '').slice(0, 500), intent, timestamp: new Date().toISOString() }
  const { error } = await supabaseAdmin
    .from('pending_demands')
    .update({
      status: 'waiting',
      last_client_note: (text || '').slice(0, 500),
      raw_payload: { ...(lead.raw_payload || {}), replies: [...existingReplies, newReply].slice(-50) },
    })
    .eq('id', lead.id)
    .eq('agency_id', agencyId)
  if (error) console.error(`[pipeline:${source}] ✗ offer response update error:`, error.message)
  else console.log(`[pipeline:${source}] ✓ offer response | lead=${lead.id} → waiting | intent=${intent}`)
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
  console.log(`[pipeline:wa] ← message | agency=${agencyId} | sender=${senderJid} | image=${!!imageBuffer} | text="${(bodyText || '').slice(0, 80)}"`)
  let extractedData = null

  // Pre-triage: if sender has an offer_sent lead, bypass keyword triage
  const offerLead = await findOfferSentLeadByPhone(agencyId, senderJid)
  if (offerLead) {
    await handleOfferResponse(agencyId, senderJid, bodyText, offerLead, 'whatsapp')
    return
  }

  if (bodyText?.trim()) {
    const lang = detectLanguage(bodyText)
    const CORE = new Set(['fra', 'ara', 'eng'])
    const translatedText = (!CORE.has(lang) && lang !== 'und')
      ? await translateToFrench(bodyText)
      : null
    const textToFilter = translatedText ?? bodyText
    const { result, matchedKeywords } = preFilter(textToFilter)

    console.log(`[pipeline:wa] → triage | lang=${lang} | result=${result} | keywords=[${matchedKeywords.join(',')}]`)

    if (result === 'fail') {
      console.log(`[pipeline:wa] ✗ dropped — no rental keywords`)
      return
    }

    if (result === 'ambiguous') {
      console.log(`[pipeline:wa] → ambiguous — creating alert`)
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
  }

  if (imageBuffer && process.env.ANTHROPIC_API_KEY) {
    console.log(`[pipeline:wa] → Claude extraction (image, ${mimeType}, ${imageBuffer.length} bytes)`)
    try {
      const imageBlock = { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBuffer.toString('base64') } }
      extractedData = await extractWithClaude([imageBlock], bodyText)
      if (extractedData) {
        extractedData.classification = 'new_lead'
        console.log(`[pipeline:wa] → extraction result: classification=${extractedData.classification} | confidence=${extractedData.confidence}`)
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
              console.log(`[pipeline:wa] → caption merged: classification=${extractedData.classification} | summary="${(extractedData.summary_for_agent || '').slice(0, 60)}"`)
            }
          } catch (_) {}
        }
      } else {
        console.warn(`[pipeline:wa] → extraction returned null`)
      }
    } catch (err) {
      console.error('[pipeline:wa] ✗ Claude extraction error:', err.message)
    }
  } else if (bodyText?.trim()) {
    console.log(`[pipeline:wa] → Claude classification (text-only)`)
    try {
      const clientStatus = await getClientStatus(agencyId, senderJid)
      const classification = await classifyTextMessage(bodyText, clientStatus)
      if (classification) {
        // Skip messages classified as "other" — not rental-related
        if (classification.classification === 'other') {
          console.log(`[pipeline:wa] ✗ rejected — classified as "other" (${classification.confidence})`)
          return
        }
        extractedData = {
          classification: classification.classification,
          confidence: classification.confidence,
          summary_for_agent: classification.summary_for_agent,
          ...classification.extracted_data,
        }
        console.log(`[pipeline:wa] → classification: ${classification.classification} (${classification.confidence}) | summary="${(classification.summary_for_agent || '').slice(0, 60)}"`)
      } else {
        console.warn(`[pipeline:wa] → classification returned null`)
      }
    } catch (err) {
      console.error('[pipeline:wa] ✗ classify error:', err.message)
    }
  }

  const match = await findMatchingDemand(agencyId, senderJid, extractedData)
  console.log(`[pipeline:wa] → match: ${match ? `${match.type} (score=${match.score}) id=${match.demand.id}` : 'none — new lead'}`)

  if (match && match.type !== 'potential') {
    const { error } = await supabaseAdmin.from('pending_demands').update({
      extracted_data: { ...(match.demand.extracted_data || {}), ...(extractedData || {}) },
      media_urls: match.demand.media_urls || [],
      confidence_scores: extractedData?.confidenceScores || null,
      match_score: match.score,
      raw_payload: { ...match.demand.raw_payload, latestBody: bodyText },
      ...(extractedData?.classification ? { classification: extractedData.classification } : {}),
    }).eq('id', match.demand.id)
    if (error) console.error('[pipeline:wa] ✗ update error:', error.message)
    else console.log(`[pipeline:wa] ✓ lead updated id=${match.demand.id}`)
  } else {
    const { data: inserted, error } = await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'whatsapp',
      sender_id: senderJid,
      raw_payload: { body: bodyText, from: senderJid },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: [],
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
      classification: extractedData?.classification || null,
    }).select('id').maybeSingle()
    if (error) console.error('[pipeline:wa] ✗ insert error:', error.message)
    else {
      console.log(`[pipeline:wa] ✓ lead inserted id=${inserted?.id}`)
      if (inserted?.id) {
        const summary = extractedData?.summary_for_agent
          || (bodyText || '').slice(0, 120)
          || `Nouveau message WhatsApp`
        sendToAgency(agencyId, 'Nouvelle demande WhatsApp', summary, {
          type: 'lead',
          id: inserted.id,
          source: 'whatsapp',
        }).catch(() => {})
      }
    }
  }
}

// ── Smart Quote: reply intent analysis ───────────────────
/**
 * Analyze a client's WhatsApp reply to decide if they accepted, rejected or asked
 * a question about the quote. Handles Moroccan Darija and French.
 * Returns: 'accepted' | 'rejected' | 'question'
 */
export async function analyzeQuoteReply(text) {
  if (!process.env.ANTHROPIC_API_KEY) return 'question'
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      temperature: 0,
      system: `You analyze client replies to car rental quote offers. The client may write in French or Moroccan Darija.
Return ONLY valid JSON with a single key "intent". No markdown, no explanation.
Rules:
- "accepted": client clearly agrees (oui, wakha, mwafaq, ça marche, ok, d'accord, je prends, okay, مواطق, واخا, etc.)
- "rejected": client clearly refuses (non, la, trop cher, annuler, لا, etc.)
- "question": anything else — questions, negotiations, unclear messages`,
      messages: [{ role: 'user', content: text }],
    })
    const raw = message.content?.[0]?.text?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(clean)
    return ['accepted', 'rejected', 'question'].includes(parsed.intent) ? parsed.intent : 'question'
  } catch (err) {
    console.error('[leads/analyzeQuoteReply] error:', err.message)
    return 'question'
  }
}

/**
 * Handle a client reply to a pending quote offer.
 * Checks if the sender has an `offer_sent` lead; if so, runs intent analysis and
 * updates the lead status accordingly.
 * Returns the matched leadId if handled, or null if no offer_sent lead was found.
 */
export async function handleQuoteReply(agencyId, senderJid, text) {
  try {
    const digits9 = (senderJid || '').replace(/\D/g, '').slice(-9)
    if (!digits9) return null

    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id')
      .eq('agency_id', agencyId)
      .eq('status', 'offer_sent')
      .order('created_at', { ascending: false })
      .limit(20)

    const matched = (leads || []).find(l => {
      const leadDigits9 = (l.sender_id || '').replace(/\D/g, '').slice(-9)
      return leadDigits9 === digits9
    })

    if (!matched) return null

    const intent = await analyzeQuoteReply(text)

    // For 'question' intent: note the message but return null so handleInboundWhatsApp
    // still runs — new rental requests from offer_sent clients must not be swallowed.
    if (intent === 'question') {
      await supabaseAdmin
        .from('pending_demands')
        .update({ last_client_note: text.slice(0, 500) })
        .eq('id', matched.id)
      console.log(`[leads/handleQuoteReply] lead ${matched.id} → question noted, passing through`)
      return null
    }

    const newStatus = intent === 'accepted' ? 'accepted' : 'ignored'

    await supabaseAdmin
      .from('pending_demands')
      .update({ status: newStatus, last_client_note: text.slice(0, 500) })
      .eq('id', matched.id)

    console.log(`[leads/handleQuoteReply] lead ${matched.id} → ${newStatus} (intent: ${intent})`)

    if (intent === 'accepted') {
      sendToAgency(
        agencyId,
        '✅ Offre acceptée',
        `Le client a accepté votre devis : « ${text.slice(0, 80)} »`,
        { type: 'lead', id: matched.id, status: 'accepted' }
      ).catch(() => {})
    }
    return matched.id
  } catch (err) {
    console.error('[leads/handleQuoteReply] error:', err.message)
    return null
  }
}

export default router
