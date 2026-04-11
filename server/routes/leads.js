/**
 * POST /leads/webhook/whatsapp  — Twilio inbound WhatsApp webhook
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
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
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

// ── Claude Vision prompt ──────────────────────────────────
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

async function extractWithClaude(imageBase64, mediaType, textHint = '') {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userContent = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: textHint
        ? `Additional context from the sender: "${textHint}"\n\nExtract all identity fields and rental intent.`
        : 'Extract all identity fields and rental intent from this document image.' },
  ]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: GLOBAL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = message.content?.[0]?.text?.trim() ?? ''
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
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

// ── POST /leads/webhook/whatsapp ──────────────────────────
// Twilio sends form-urlencoded. No auth — validated by Twilio signature.
router.post('/webhook/whatsapp', async (req, res) => {
  // Validate Twilio signature in production
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
    const twilioSig  = req.headers['x-twilio-signature']
    const url        = `${process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : 'http://localhost:3001'}/leads/webhook/whatsapp`
    const params     = req.body
    const sortedStr  = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url)
    const expected   = createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
      .update(sortedStr).digest('base64')
    if (twilioSig !== expected) {
      console.warn('[leads/whatsapp] Invalid Twilio signature')
      return res.status(403).send('Forbidden')
    }
  }

  const senderRaw  = req.body?.From || ''
  const bodyText   = req.body?.Body || ''
  const numMedia   = parseInt(req.body?.NumMedia || '0', 10)

  // Collect media URLs from Twilio payload
  const mediaUrls = []
  for (let i = 0; i < numMedia; i++) {
    const url = req.body?.[`MediaUrl${i}`]
    if (url) mediaUrls.push(url)
  }

  // Find which agency this WhatsApp number belongs to
  const { data: agency } = await supabaseAdmin
    .from('agencies')
    .select('id, plan, whatsapp_number')
    .eq('plan', 'premium')
    .maybeSingle()

  if (!agency) {
    // No premium agency configured — silently ack to Twilio
    return res.set('Content-Type', 'text/xml').send('<Response></Response>')
  }

  // Download first image and run Claude Vision
  let extractedData = null
  if (mediaUrls.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const imgRes   = await fetch(mediaUrls[0], {
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
      })
      const imgBuf   = await imgRes.arrayBuffer()
      const imgB64   = Buffer.from(imgBuf).toString('base64')
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'
      extractedData  = await extractWithClaude(imgB64, mimeType, bodyText)
    } catch (err) {
      console.error('[leads/whatsapp] Claude extraction error:', err.message)
    }
  }

  // Fuzzy match / merge logic
  const match = await findMatchingDemand(agency.id, senderRaw, extractedData)

  if (match && match.type !== 'potential') {
    // Merge: update existing demand with new media + extracted data
    const existing = match.demand
    const merged   = {
      ...(existing.extracted_data || {}),
      ...(extractedData || {}),
    }
    await supabaseAdmin
      .from('pending_demands')
      .update({
        extracted_data:    merged,
        media_urls:        [...(existing.media_urls || []), ...mediaUrls],
        confidence_scores: extractedData?.confidenceScores || null,
        match_score:       match.score,
        raw_payload:       { ...existing.raw_payload, latestBody: bodyText },
      })
      .eq('id', existing.id)

    console.log(`[leads/whatsapp] Merged into demand ${existing.id} (score: ${match.score})`)
  } else {
    // New demand
    const row = {
      agency_id:         agency.id,
      source:            'whatsapp',
      sender_id:         senderRaw,
      raw_payload:       { body: bodyText, numMedia, from: senderRaw },
      extracted_data:    extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls:        mediaUrls,
      match_score:       match?.score || null,
      merged_with_id:    match?.type === 'potential' ? match.demand.id : null,
    }
    const { error } = await supabaseAdmin.from('pending_demands').insert(row)
    if (error) console.error('[leads/whatsapp] insert error:', error.message)
    else console.log(`[leads/whatsapp] New demand created from ${senderRaw}`)
  }

  // Always respond 200 to Twilio
  res.set('Content-Type', 'text/xml').send('<Response></Response>')
})

// ── POST /leads/webhook/gmail ─────────────────────────────
// Called internally by the Gmail poller (server/routes/gmail.js)
router.post('/webhook/gmail', async (req, res) => {
  const { agencyId, senderEmail, subject, bodyText, attachments } = req.body

  if (!agencyId || !senderEmail) {
    return res.status(400).json({ error: 'agencyId and senderEmail required' })
  }

  let extractedData = null
  const mediaUrls = []

  // Process first image attachment through Claude Vision
  if (attachments?.length && process.env.ANTHROPIC_API_KEY) {
    const img = attachments[0]
    if (img.base64 && img.mimeType?.startsWith('image/')) {
      try {
        extractedData = await extractWithClaude(img.base64, img.mimeType, bodyText || subject)
        // Store attachment as data URI reference (no external hosting needed for email)
        mediaUrls.push(`data:${img.mimeType};name=${encodeURIComponent(img.filename || 'attachment')},${img.base64.slice(0, 100)}…`)
      } catch (err) {
        console.error('[leads/gmail] Claude extraction error:', err.message)
      }
    }
  }

  const match = await findMatchingDemand(agencyId, senderEmail, extractedData)

  if (match && match.type !== 'potential') {
    const existing = match.demand
    await supabaseAdmin
      .from('pending_demands')
      .update({
        extracted_data:    { ...(existing.extracted_data || {}), ...(extractedData || {}) },
        media_urls:        [...(existing.media_urls || []), ...mediaUrls],
        confidence_scores: extractedData?.confidenceScores || null,
        match_score:       match.score,
      })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('pending_demands').insert({
      agency_id:         agencyId,
      source:            'gmail',
      sender_id:         senderEmail,
      raw_payload:       { subject, bodyText: (bodyText || '').slice(0, 2000) },
      extracted_data:    extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls:        mediaUrls,
      match_score:       match?.score || null,
      merged_with_id:    match?.type === 'potential' ? match.demand.id : null,
    })
  }

  res.json({ ok: true })
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

export default router
