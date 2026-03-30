import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()
router.use(requireAuth)

// ── Rate limits ──────────────────────────────────────────
// 20 WhatsApp messages per hour per user (global for this router)
const whatsappLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user.id,
  message: { error: 'WhatsApp message limit reached. Try again in 1 hour.' },
})

// Extra tight limit for payment links — 5 per hour per user
const paymentLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user.id,
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
 * Upload a base64-encoded PDF to Supabase Storage and return a public URL.
 * Bucket: whatsapp-temp  |  Path: {folder}/{filename}.pdf
 */
async function uploadPdfToSupabase(pdfBase64, folder, filename) {
  const buffer = Buffer.from(pdfBase64, 'base64')
  const path = `${folder}/${filename}.pdf`

  const { error } = await supabaseAdmin.storage
    .from('whatsapp-temp')
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage
    .from('whatsapp-temp')
    .getPublicUrl(path)

  return data.publicUrl
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

// ── POST /whatsapp/contract ───────────────────────────────
router.post('/contract', async (req, res) => {
  const { to, clientName, contractNumber, pdfBase64, vehicleName, startDate, endDate } = req.body

  if (!to || !clientName || !contractNumber || !pdfBase64 || !vehicleName || !startDate || !endDate) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, contractNumber, pdfBase64, vehicleName, startDate, endDate',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    // Upload PDF to Supabase Storage to get a public URL for Twilio MediaUrl
    const pdfUrl = await uploadPdfToSupabase(pdfBase64, 'contracts', contractNumber)

    const body = `Bonjour ${clientName}, veuillez trouver ci-joint votre contrat de location ${contractNumber} pour le véhicule ${vehicleName} du ${startDate} au ${endDate}.`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body, mediaUrl: pdfUrl })

    console.log(`[WhatsApp] Contract ${contractNumber} sent to ${whatsappTo} — SID: ${result.sid}`)
    res.json({ sent: true, sid: result.sid, to: whatsappTo, contractNumber })
  } catch (err) {
    console.error('[WhatsApp/contract]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── POST /whatsapp/invoice ────────────────────────────────
router.post('/invoice', async (req, res) => {
  const { to, clientName, invoiceNumber, pdfBase64, totalTTC } = req.body

  if (!to || !clientName || !invoiceNumber || !pdfBase64 || totalTTC == null) {
    return res.status(400).json({
      error: 'Missing required fields: to, clientName, invoiceNumber, pdfBase64, totalTTC',
    })
  }

  const whatsappTo = normalisePhone(to)
  if (!whatsappTo) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  try {
    const pdfUrl = await uploadPdfToSupabase(pdfBase64, 'invoices', invoiceNumber)

    const body = `Bonjour ${clientName}, votre facture ${invoiceNumber} d'un montant de ${totalTTC} MAD est disponible en pièce jointe.`

    const result = await sendWhatsAppMessage({ to: whatsappTo, body, mediaUrl: pdfUrl })

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

export default router
