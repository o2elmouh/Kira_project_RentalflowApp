import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const router = Router()

// ── Rate limits ──────────────────────────────────────────
// 20 WhatsApp messages per hour per user (global for this router)
const whatsappLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: { error: 'WhatsApp message limit reached. Try again in 1 hour.' },
})

// Extra tight limit for payment links — 5 per hour per user
const paymentLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: { error: 'Payment link limit reached (5/hour). Try again later.' },
})

router.use(whatsappLimit)

// ── Helpers ───────────────────────────────────────────────

/**
 * Normalise a phone number to WhatsApp format: whatsapp:+212XXXXXXXXX
 * Accepts: 06XXXXXXXX, +212XXXXXXXXX, 00212XXXXXXXXX, whatsapp:+212...
 */
function normalisePhone(raw) {
  if (!raw) return null
  let num = String(raw).trim().replace(/\s+/g, '')

  // Already formatted
  if (num.startsWith('whatsapp:')) return num

  // Strip leading zeros used in international prefix
  if (num.startsWith('00')) num = '+' + num.slice(2)

  // Moroccan local format: 06/07 → +2126/+2127
  if (/^0[5-9]\d{8}$/.test(num)) {
    num = '+212' + num.slice(1)
  }

  // Ensure + prefix
  if (!num.startsWith('+')) num = '+' + num

  return `whatsapp:${num}`
}

/**
 * Send a WhatsApp message via Twilio REST API (no SDK).
 */
async function sendWhatsAppMessage({ to, body, mediaUrl }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)')
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const params = new URLSearchParams({ From: from, To: to, Body: body })
  if (mediaUrl) params.append('MediaUrl', mediaUrl)

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Twilio error ${result.code || response.status}: ${result.message || 'Unknown error'}`)
  }

  return result
}

// ── PDF temp-file hosting ─────────────────────────────────
// Writes base64 PDF to a temp file, returns a public URL, auto-deletes after 10 min.
const TEMP_DIR = join(process.cwd(), 'tmp_pdfs')
try { mkdirSync(TEMP_DIR, { recursive: true }) } catch {}

function hostPdfTemp(pdfBase64) {
  const filename = `${randomUUID()}.pdf`
  const filepath = join(TEMP_DIR, filename)
  const buffer = Buffer.from(pdfBase64, 'base64')
  writeFileSync(filepath, buffer)
  // Auto-delete after 10 minutes
  setTimeout(() => { try { unlinkSync(filepath) } catch {} }, 10 * 60 * 1000)
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.API_URL || 'http://localhost:3001')
  return `${baseUrl}/tmp_pdfs/${filename}`
}

// ── POST /whatsapp/contract ───────────────────────────────
router.post('/contract', async (req, res) => {
  const { to, clientName, contractNumber, vehicleName, startDate, endDate } = req.body

  if (!to || !clientName || !contractNumber || !vehicleName || !startDate || !endDate) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, contractNumber, vehicleName, startDate, endDate',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    const body = `Bonjour ${clientName}, votre contrat de location *${contractNumber}* pour le véhicule *${vehicleName}* du ${startDate} au ${endDate} a bien été enregistré.`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body })

    console.log(`[WhatsApp] Contract ${contractNumber} sent to ${whatsappTo} — SID: ${result.sid}`)
    res.json({ sent: true, sid: result.sid, to: whatsappTo, contractNumber })
  } catch (err) {
    console.error('[WhatsApp/contract]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── POST /whatsapp/invoice ────────────────────────────────
router.post('/invoice', async (req, res) => {
  const { to, clientName, invoiceNumber, totalTTC } = req.body

  if (!to || !clientName || !invoiceNumber || totalTTC == null) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, invoiceNumber, totalTTC',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    const body = `Bonjour ${clientName}, votre facture *${invoiceNumber}* d'un montant de *${totalTTC} MAD* a bien été générée.`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body })

    console.log(`[WhatsApp] Invoice ${invoiceNumber} sent to ${whatsappTo} — SID: ${result.sid}`)
    res.json({ sent: true, sid: result.sid, to: whatsappTo, invoiceNumber })
  } catch (err) {
    console.error('[WhatsApp/invoice]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── POST /whatsapp/payment ────────────────────────────────
router.post('/payment', paymentLimit, async (req, res) => {
  const { to, clientName, contractNumber, amount, paymentLink } = req.body

  if (!to || !clientName || !contractNumber || amount == null || !paymentLink) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, contractNumber, amount, paymentLink',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    const body = `Bonjour ${clientName}, pour régler votre location ${contractNumber} (${amount} MAD), cliquez sur ce lien de paiement sécurisé CMI : ${paymentLink}`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body })

    console.log(`[WhatsApp] Payment link for ${contractNumber} sent to ${whatsappTo} — SID: ${result.sid}`)
    res.json({ sent: true, sid: result.sid, to: whatsappTo, contractNumber })
  } catch (err) {
    console.error('[WhatsApp/payment]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── POST /whatsapp/restitution ────────────────────────────
router.post('/restitution', async (req, res) => {
  const { to, clientName, contractNumber, pdfBase64, totalExtraFees } = req.body

  if (!to || !clientName || !contractNumber || !pdfBase64 || totalExtraFees == null) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, contractNumber, pdfBase64, totalExtraFees',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    const pdfUrl = hostPdfTemp(pdfBase64)

    const body = totalExtraFees > 0
      ? `Bonjour ${clientName}, votre procès-verbal de restitution pour le contrat ${contractNumber} est disponible en pièce jointe. Frais supplémentaires : ${totalExtraFees} MAD.`
      : `Bonjour ${clientName}, votre procès-verbal de restitution pour le contrat ${contractNumber} est disponible en pièce jointe. Aucun frais supplémentaire.`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body, mediaUrl: pdfUrl })

    console.log(`[WhatsApp] Restitution PV ${contractNumber} sent to ${whatsappTo} — SID: ${result.sid}`)
    res.json({ sent: true, sid: result.sid, to: whatsappTo, contractNumber })
  } catch (err) {
    console.error('[WhatsApp/restitution]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
