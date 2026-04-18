/**
 * POST /leads/webhook/gmail     — Called by the Gmail poller when a new message arrives
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
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'

const router = Router()

// ── Encryption helpers (AES-256-GCM) ─────────────────────
const ENC_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : null

export function encrypt(text) {
  if (!ENC_KEY) return text  // dev fallback — no encryption
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(blob) {
  if (!ENC_KEY || !blob?.includes(':')) return blob
  const [ivHex, tagHex, encHex] = blob.split(':')
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
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
// Called internally by the Gmail poller (server/routes/gmail.js)
router.post('/webhook/gmail', async (req, res) => {
  const { agencyId, senderEmail, subject, bodyText, attachments } = req.body

  if (!agencyId || !senderEmail) {
    return res.status(400).json({ error: 'agencyId and senderEmail required' })
  }

  let extractedData = null
  const mediaUrls = []

  const imageBlocks = (attachments || [])
    .filter(a => a.base64 && a.mimeType?.startsWith('image/'))
    .map(a => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }))

  if (imageBlocks.length && process.env.ANTHROPIC_API_KEY) {
    try {
      extractedData = await extractWithClaude(imageBlocks, bodyText || subject)
    } catch (err) {
      console.error('[leads/gmail] Claude extraction error:', err.message)
    }
  }

  for (const a of (attachments || [])) {
    if (a.base64 && a.mimeType?.startsWith('image/')) {
      mediaUrls.push(`data:${a.mimeType};base64,${a.base64}`)
    }
  }

  const match = await findMatchingDemand(agencyId, senderEmail, extractedData)

  if (match && match.type !== 'potential') {
    const existing = match.demand
    await supabaseAdmin
      .from('pending_demands')
      .update({
        extracted_data: { ...(existing.extracted_data || {}), ...(extractedData || {}) },
        media_urls: [...(existing.media_urls || []), ...mediaUrls],
        confidence_scores: extractedData?.confidenceScores || null,
        match_score: match.score,
      })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'gmail',
      sender_id: senderEmail,
      raw_payload: { subject, bodyText: (bodyText || '').slice(0, 2000) },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: mediaUrls,
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
    })
  }

  res.json({ ok: true })
})

// GET /leads/media?url=... — public image proxy (no auth — bucket is already public)
// <img> tags cannot send Authorization headers, so this must be unauthenticated.
// Security: only Supabase Storage URLs are forwarded (SSRF prevention).
router.get('/media', async (req, res) => {
  const { url } = req.query
  if (!url || !url.startsWith('https://')) return res.status(400).end()
  const supabaseUrl = process.env.SUPABASE_URL
  if (supabaseUrl && !url.startsWith(supabaseUrl)) return res.status(403).end()
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

  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .select('*')
    .eq('agency_id', req.user.agency_id)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /leads/:id — single demand
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .select('*')
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// PATCH /leads/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  if (!['pending', 'processed', 'ignored'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending|processed|ignored' })
  }

  const { data, error } = await supabaseAdmin
    .from('pending_demands')
    .update({ status })
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
    console.error('[leads/classify] error:', err.message)
    return null
  }
}

/**
 * Called directly by the Baileys inbound listener (no HTTP round-trip).
 * @param {string}      agencyId
 * @param {string}      senderJid  — e.g. "212XXXXXXXXX@s.whatsapp.net"
 * @param {string|null} imageUrl   — public Supabase Storage URL, or null
 * @param {string}      bodyText   — text body or Whisper transcript
 */
export async function handleInboundWhatsApp(agencyId, senderJid, imageUrl, bodyText) {
  let extractedData = null

  if (imageUrl && process.env.ANTHROPIC_API_KEY) {
    // Image received — run document OCR via public URL
    try {
      const imageBlock = { type: 'image', source: { type: 'url', url: imageUrl } }
      extractedData = await extractWithClaude([imageBlock], bodyText)
    } catch (err) {
      console.error('[leads/inbound-wa] Claude error:', err.message)
    }
  } else if (bodyText?.trim()) {
    // Text-only or voice-note transcript — run lead classification
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
      console.error('[leads/inbound-wa] classify error:', err.message)
    }
  }

  const match = await findMatchingDemand(agencyId, senderJid, extractedData)
  const mediaUrls = imageUrl ? [imageUrl] : []

  if (match && match.type !== 'potential') {
    const existing = match.demand
    await supabaseAdmin.from('pending_demands').update({
      extracted_data: { ...(existing.extracted_data || {}), ...(extractedData || {}) },
      media_urls: [...(existing.media_urls || []), ...mediaUrls],
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
      media_urls: mediaUrls,
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
    })
    if (error) console.error('[leads/inbound-wa] insert error:', error.message)
  }
}

export default router
