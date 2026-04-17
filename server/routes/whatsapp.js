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
import { handleInboundWhatsApp } from './leads.js'
import { requireAuth } from '../middleware/auth.js'

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

  const entry = { sock: null, qr: null, status: 'connecting', retryCount: 0 }
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
      const senderJid = msg.key.remoteJid
      const imgMsg    = msg.message?.imageMessage

      // Caption on image messages lives in imgMsg.caption, not conversation
      const bodyText = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || imgMsg?.caption
        || ''

      // Image message
      if (imgMsg) {
        try {
          const buf  = await downloadMediaMessage(msg, 'buffer', {})
          const b64  = buf.toString('base64')
          const mime = imgMsg.mimetype || 'image/jpeg'
          await handleInboundWhatsApp(agencyId, senderJid, [{ base64: b64, mimeType: mime }], bodyText)
        } catch (err) {
          console.error(`[WA:${agencyId}] inbound image error:`, err.message)
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

export default router
