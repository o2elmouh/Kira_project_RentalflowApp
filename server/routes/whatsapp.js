/**
 * WhatsApp integration via @whiskeysockets/baileys (multi-tenant).
 *
 * Session state is persisted to /app/wa_sessions/<agencyId>/
 * (mount a Railway Volume at /app/wa_sessions).
 *
 * Routes:
 *   GET  /whatsapp/status/:agencyId   — QR code (PNG base64) or connection status
 *   POST /whatsapp/connect/:agencyId  — Initialise / reconnect a session
 *   POST /whatsapp/disconnect/:agencyId
 *   POST /whatsapp/contract
 *   POST /whatsapp/invoice
 *   POST /whatsapp/payment
 *   POST /whatsapp/restitution
 */

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { mkdirSync } from 'fs'
import { join } from 'path'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'

// Fetch the latest WA Web version with a 6s timeout; fall back to a known-good pin.
// fetchLatestBaileysVersion() can hang on cold-start — the race ensures we never block.
const WA_VERSION_FALLBACK = [2, 3000, 1023140551]
async function getWAVersion() {
  try {
    const { version } = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('version fetch timeout')), 6000)),
    ])
    console.log('[WA] version:', version.join('.'))
    return version
  } catch (err) {
    console.warn('[WA] version fetch failed, using fallback:', err.message)
    return WA_VERSION_FALLBACK
  }
}
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import OpenAI, { toFile } from 'openai'
import { handleInboundWhatsApp, handleQuoteReply } from './leads.js'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()
const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || '/app/wa_sessions'

// agencyId → { sock, qr, status: 'qr'|'open'|'connecting'|'closed' }
const sessions = new Map()

// ── Rate limits ──────────────────────────────────────────
// Only applied to action routes — NOT to /status (polled every 3s)
const whatsappLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyGenerator: r => r.ip })
const paymentLimit  = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,  keyGenerator: r => r.ip })
router.use(requireAuth)

// ── Session management ────────────────────────────────────

async function getSession(agencyId) {
  if (sessions.has(agencyId)) return sessions.get(agencyId)
  return startSession(agencyId)
}

async function startSession(agencyId) {
  const stateDir = join(SESSIONS_DIR, agencyId)
  mkdirSync(stateDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(stateDir)

  // lidMap: WhatsApp LID ("7383...@lid") → phone JID ("212...@s.whatsapp.net")
  const entry = { sock: null, qr: null, status: 'connecting', retryCount: 0, lidMap: new Map() }
  sessions.set(agencyId, entry)

  const version = await getWAVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['RentaFlow', 'Chrome', '1.0'],
    getMessage: async () => undefined,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined, // disable per-query timeout — Railway latency can be high
  })
  entry.sock = sock

  sock.ev.on('creds.update', saveCreds)

  // ── LID → phone JID resolution ────────────────────────
  // WhatsApp multi-device sometimes uses opaque LIDs instead of phone JIDs.
  // contacts.upsert/update events carry the mapping; we cache it in-memory.
  const storeLidMapping = (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.id && c.id.endsWith('@s.whatsapp.net')) {
        const lid = c.lid.endsWith('@lid') ? c.lid : `${c.lid}@lid`
        entry.lidMap.set(lid, c.id)
      }
    }
  }
  sock.ev.on('contacts.upsert', storeLidMapping)
  sock.ev.on('contacts.update', storeLidMapping)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      entry.qr = await QRCode.toDataURL(qr)
      entry.status = 'qr'
      console.log(`[WA:${agencyId}] QR ready`)
    }
    if (connection === 'open') {
      entry.qr = null
      entry.status = 'open'
      entry.retryCount = 0
      console.log(`[WA:${agencyId}] Connected`)
    }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      // Codes that must NOT trigger a reconnect
      const noRetry = new Set([
        DisconnectReason.loggedOut,       // 401 — user logged out
        DisconnectReason.connectionReplaced, // 440 — another device took over
        403, // forbidden / banned
        411, // multidevice mismatch
      ])
      const shouldReconnect = !noRetry.has(code)
      const MAX_RETRIES = 5
      console.log(`[WA:${agencyId}] Closed (code ${code}), retry=${shouldReconnect}, attempt=${entry.retryCount + 1}/${MAX_RETRIES}`)
      entry.status = 'closed'

      if (shouldReconnect && entry.retryCount < MAX_RETRIES) {
        const backoff = Math.min(5000 * Math.pow(2, entry.retryCount), 120_000) // 5s→10s→20s→40s→80s→cap 120s
        entry.retryCount += 1
        sessions.delete(agencyId)
        setTimeout(() => startSession(agencyId), backoff)
      } else {
        if (!shouldReconnect) console.log(`[WA:${agencyId}] Permanent disconnect (code ${code}) — not retrying`)
        if (entry.retryCount >= MAX_RETRIES) console.warn(`[WA:${agencyId}] Max retries reached — giving up`)
        entry.status = 'failed'
        sessions.delete(agencyId)
      }
    }
  })

  // ── Inbound message → leads pipeline ─────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      const rawJid = msg.key.remoteJid
      // Resolve LID ("7383...@lid") → phone JID via cached contact map
      const senderJid = rawJid?.endsWith('@lid')
        ? (entry.lidMap.get(rawJid) || rawJid)
        : rawJid
      const imgMsg   = msg.message?.imageMessage
      const audioMsg = msg.message?.audioMessage

      // Caption on image messages lives in imgMsg.caption, not conversation
      const bodyText = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || imgMsg?.caption
        || ''

      if (audioMsg) {
        // ── Voice note → Whisper → classification ──────────
        let audioText = null
        try {
          const buf        = await downloadMediaMessage(msg, 'buffer', {})
          const transcript = await transcribeAudio(buf)
          audioText = transcript?.trim() || null
          if (audioText) console.log(`[WA:${agencyId}] audio transcribed (${audioText.length} chars)`)
          else           console.warn(`[WA:${agencyId}] audio transcription returned empty`)
        } catch (err) {
          console.error(`[WA:${agencyId}] inbound audio error:`, err.message)
        }
        // Check if this is a reply to a pending quote offer first
        const effectiveText = audioText || '[Message vocal reçu]'
        try {
          const quoteLead = await handleQuoteReply(agencyId, senderJid, effectiveText)
          if (!quoteLead) {
            await handleInboundWhatsApp(agencyId, senderJid, null, effectiveText)
          }
        } catch (err) {
          console.error(`[WA:${agencyId}] inbound audio lead error:`, err.message)
        }
      } else if (imgMsg) {
        // ── Image → Process & Purge (base64 direct to Claude, never stored) ──
        let imageBuf = null
        const mime = imgMsg.mimetype || 'image/jpeg'
        try {
          imageBuf = await downloadMediaMessage(msg, 'buffer', {})
        } catch (err) {
          console.error(`[WA:${agencyId}] image download error:`, err.message)
        }
        try {
          await handleInboundWhatsApp(agencyId, senderJid, imageBuf, mime, bodyText)
        } catch (err) {
          console.error(`[WA:${agencyId}] inbound image lead error:`, err.message)
        }
      } else if (bodyText.trim()) {
        // ── Text-only → check quote reply first, then lead classification ──
        try {
          const quoteLead = await handleQuoteReply(agencyId, senderJid, bodyText)
          if (!quoteLead) {
            await handleInboundWhatsApp(agencyId, senderJid, null, bodyText)
          }
        } catch (err) {
          console.error(`[WA:${agencyId}] inbound text error:`, err.message)
        }
      }
    }
  })

  return entry
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Normalise to JID format: 212XXXXXXXXX@s.whatsapp.net
 * Accepts: 06XXXXXXXX, +212XXXXXXXXX, 00212XXXXXXXXX, whatsapp:+212...
 */
function normaliseJid(raw) {
  if (!raw) return null
  let num = String(raw).trim().replace(/\s+/g, '').replace(/^whatsapp:/, '')
  if (num.startsWith('00')) num = '+' + num.slice(2)
  if (/^0[5-9]\d{8}$/.test(num)) num = '+212' + num.slice(1)
  if (!num.startsWith('+')) num = '+' + num
  const digits = num.replace(/\D/g, '')
  return `${digits}@s.whatsapp.net`
}

// ── Audio transcription via OpenAI Whisper ────────────────

async function transcribeAudio(buffer) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WA] OPENAI_API_KEY not set — skipping audio transcription')
    return null
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const file = await toFile(buffer, 'voice.ogg', { type: 'audio/ogg; codecs=opus' })
  const transcription = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  })
  return transcription.text
}

async function sendWhatsAppMessage({ agencyId, to, body, mediaBuffer, mimetype, pdfBase64 }) {
  const entry = await getSession(agencyId)
  if (entry.status !== 'open') throw new Error(`WhatsApp session not connected (status: ${entry.status})`)

  const jid = normaliseJid(to)
  if (!jid) throw new Error('Invalid phone number')

  if (pdfBase64) {
    const buf = Buffer.from(pdfBase64, 'base64')
    await entry.sock.sendMessage(jid, { document: buf, mimetype: 'application/pdf', fileName: 'document.pdf', caption: body })
  } else if (mediaBuffer) {
    await entry.sock.sendMessage(jid, { image: mediaBuffer, mimetype, caption: body })
  } else {
    await entry.sock.sendMessage(jid, { text: body })
  }
}

// ── Session routes ────────────────────────────────────────

router.get('/status', async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.json({ status: null, qr: null })
  try {
    const entry = await getSession(agencyId)
    res.json({ status: entry.status, qr: entry.qr || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/connect', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(400).json({ error: 'No agency_id on profile' })
  try {
    sessions.delete(agencyId)
    const entry = await startSession(agencyId)
    res.json({ status: entry.status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/disconnect', whatsappLimit, (req, res) => {
  const agencyId = req.user.agency_id
  const entry = sessions.get(agencyId)
  if (entry?.sock) {
    entry.sock.logout().catch(() => {})
    sessions.delete(agencyId)
  }
  res.json({ ok: true })
})

// ── Messaging routes ──────────────────────────────────────
// All require agencyId in body so multi-tenant routing works.

router.post('/contract', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { to, clientName, contractNumber, vehicleName, startDate, endDate } = req.body
  if (!agencyId || !to || !clientName || !contractNumber || !vehicleName || !startDate || !endDate)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, votre contrat de location *${contractNumber}* pour le véhicule *${vehicleName}* du ${startDate} au ${endDate} a bien été enregistré.`
    await sendWhatsAppMessage({ agencyId, to, body })
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/contract]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/invoice', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { to, clientName, invoiceNumber, totalTTC } = req.body
  if (!agencyId || !to || !clientName || !invoiceNumber || totalTTC == null)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, votre facture *${invoiceNumber}* d'un montant de *${totalTTC} MAD* a bien été générée.`
    await sendWhatsAppMessage({ agencyId, to, body })
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/invoice]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/payment', paymentLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { to, clientName, contractNumber, amount, paymentLink } = req.body
  if (!agencyId || !to || !clientName || !contractNumber || amount == null || !paymentLink)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, pour régler votre location ${contractNumber} (${amount} MAD), cliquez sur ce lien de paiement sécurisé CMI : ${paymentLink}`
    await sendWhatsAppMessage({ agencyId, to, body })
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/payment]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/restitution', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { to, clientName, contractNumber, pdfBase64, totalExtraFees } = req.body
  if (!agencyId || !to || !clientName || !contractNumber || !pdfBase64 || totalExtraFees == null)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = totalExtraFees > 0
      ? `Bonjour ${clientName}, votre PV de restitution pour le contrat ${contractNumber} est en pièce jointe. Frais supplémentaires : ${totalExtraFees} MAD.`
      : `Bonjour ${clientName}, votre PV de restitution pour le contrat ${contractNumber} est en pièce jointe. Aucun frais supplémentaire.`
    await sendWhatsAppMessage({ agencyId, to, body, pdfBase64 })
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/restitution]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// POST /whatsapp/send-offer — send a quote offer to a waiting lead via WhatsApp
router.post('/send-offer', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { leadId, vehicleId, priceTotal } = req.body

  if (!agencyId || !leadId || !vehicleId || priceTotal == null) {
    return res.status(400).json({ error: 'leadId, vehicleId and priceTotal are required' })
  }

  try {
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id, status')
      .eq('id', leadId)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (leadErr) return res.status(500).json({ error: leadErr.message })
    if (!lead)   return res.status(404).json({ error: 'Lead not found' })

    const { data: vehicle, error: vehErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, name, make, model')
      .eq('id', vehicleId)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (vehErr) return res.status(500).json({ error: vehErr.message })
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

    const vehicleName = vehicle.name || `${vehicle.make} ${vehicle.model}`.trim()
    const phone = lead.sender_id.replace(/@.*$/, '').replace(/\D/g, '')

    const body = `Bonjour ! 🚗 Suite à votre demande, nous vous proposons une *${vehicleName}* pour *${priceTotal} MAD* au total.\n\nÊtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.`

    await sendWhatsAppMessage({ agencyId, to: phone, body })

    const { error: updateErr } = await supabaseAdmin
      .from('pending_demands')
      .update({ status: 'offer_sent', offered_vehicle_id: vehicleId, offered_price_total: priceTotal })
      .eq('id', leadId)

    if (updateErr) console.error('[WA/send-offer] update error:', updateErr.message)

    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/send-offer]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
