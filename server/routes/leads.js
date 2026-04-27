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
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'
import { detectLanguage, translateToFrench, preFilter, handleAmbiguous, CORE_LANGS } from '../lib/triage.js'
import { analyzeQuoteReply, handleQuoteReply } from '../lib/quoteAnalysis.js'
import { extractWithClaude, classifyTextMessage, findMatchingDemand } from '../lib/inboundPipeline.js'

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

// ── POST /leads/webhook/gmail ─────────────────────────────
// Called internally by the Gmail poller (server/routes/gmail.js)
router.post('/webhook/gmail', async (req, res) => {
  const { agencyId, senderEmail, subject, bodyText, attachments } = req.body

  if (!agencyId || !senderEmail) {
    return res.status(400).json({ error: 'agencyId and senderEmail required' })
  }

  let extractedData = null
  const mediaUrls = []

  // Triage gate — language detection → keyword pre-filter → ambiguous handler
  const textForTriage = [subject, bodyText].filter(Boolean).join('\n\n')
  if (textForTriage) {
    const lang = detectLanguage(textForTriage)
    const translatedText = (!CORE_LANGS.has(lang) && lang !== 'und')
      ? await translateToFrench(textForTriage)
      : null
    const textToFilter = translatedText ?? textForTriage
    const { result, matchedKeywords } = preFilter(textToFilter)

    if (result === 'fail') {
      console.log(`[leads/gmail] pre-filter dropped: no rental keywords (lang=${lang})`)
      return res.json({ ok: true, dropped: true })
    }

    if (result === 'ambiguous') {
      console.log(`[leads/gmail] pre-filter ambiguous: keywords=[${matchedKeywords.join(',')}]`)
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

    // result === 'pass' — continue to extraction below
    console.log(`[leads/gmail] pre-filter pass: keywords=[${matchedKeywords.join(',')}]`)
  }

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

  if (!extractedData && (bodyText || subject) && process.env.ANTHROPIC_API_KEY) {
    try {
      const textToClassify = [subject, bodyText].filter(Boolean).join('\n\n')
      const classification = await classifyTextMessage(textToClassify, 'no_contract')
      if (classification) {
        extractedData = {
          classification: classification.classification,
          confidence: classification.confidence,
          summary_for_agent: classification.summary_for_agent,
          ...classification.extracted_data,
        }
      }
    } catch (err) {
      console.error('[leads/gmail] text classification error:', err.message)
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
    .select('*')
    .eq('agency_id', req.user.agency_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (classification) {
    query = query.eq('classification', classification).neq('status', 'ignored')
  } else {
    query = query.eq('status', status).neq('classification', 'alert')
  }

  const { data, error } = await query
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

export default router