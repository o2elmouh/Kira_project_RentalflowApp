import { Router } from 'express'
import crypto from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { sendWhatsAppMessage } from '../lib/twilioClient.js'

const SIGN_TOKEN_TTL_HOURS = 72

const router = Router()
router.use(requireAuth)

// POST /contracts/:id/close — close a contract (server-side so RLS can't block it)
router.post('/:id/close', async (req, res, next) => {
  try {
    const { id } = req.params
    const { returnKm, returnFuelLevel, damages, extraFees } = req.body

    // Verify the contract belongs to the user's agency
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('agency_id')
      .eq('id', req.user.id)
      .single()

    const { data: contract, error: contractError } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, vehicle_id, status')
      .eq('id', id)
      .single()

    if (contractError || !contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== profile.agency_id) return res.status(403).json({ error: 'Forbidden' })
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract is not active' })

    // Close contract + update vehicle status in a transaction-like sequence
    const [closeResult, vehicleResult] = await Promise.all([
      supabaseAdmin
        .from('contracts')
        .update({
          status: 'closed',
          return_km: returnKm,
          return_fuel_level: returnFuelLevel,
          damages: damages || null,
          extra_fees: extraFees || 0,
          closed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single(),

      supabaseAdmin
        .from('vehicles')
        .update({ status: 'available', mileage: returnKm })
        .eq('id', contract.vehicle_id),
    ])

    if (closeResult.error) return next(closeResult.error)
    res.json({ contract: closeResult.data })
  } catch (err) {
    next(err)
  }
})

// POST /contracts/:id/extend — extend contract end date
router.post('/:id/extend', async (req, res, next) => {
  try {
    const { id } = req.params
    const { newEndDate, dailyRate } = req.body

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('agency_id').eq('id', req.user.id).single()

    const { data: contract } = await supabaseAdmin
      .from('contracts').select('*').eq('id', id).single()

    if (!contract || contract.agency_id !== profile.agency_id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const oldEnd  = new Date(contract.end_date)
    const newEnd  = new Date(newEndDate)
    const extraDays = Math.round((newEnd - oldEnd) / 86400000)
    if (extraDays <= 0) return res.status(400).json({ error: 'New end date must be after current end date' })

    const extraAmount = extraDays * (dailyRate || contract.daily_rate)

    const { data, error } = await supabaseAdmin
      .from('contracts')
      .update({
        end_date: newEndDate,
        total_ttc: (contract.total_ttc || 0) + extraAmount,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return next(error)
    res.json({ contract: data, extraDays, extraAmount })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// E-signature flow — manager-side dispatch
// ─────────────────────────────────────────────────────────────

// POST /contracts/:id/send-whatsapp
// Manager sends the signing link to the client via WhatsApp.
// Body: { pdf_base64: 'data:application/pdf;base64,...' OR raw base64 }
//   The frontend generates the unsigned PDF (jsPDF) and posts it here;
//   the backend uploads it to storage with service_role (bypasses RLS),
//   mints a token, and dispatches the WhatsApp link.
router.post('/:id/send-whatsapp', async (req, res, next) => {
  try {
    const { id } = req.params
    const { pdf_base64 } = req.body
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return res.status(400).json({ error: 'pdf_base64 is required' })
    }

    // Fetch contract + client phone in one round trip
    const { data: contract, error } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, client_id, contract_number, clients(phone, first_name, last_name)')
      .eq('id', id)
      .single()
    if (error || !contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== req.user.agency_id) return res.status(403).json({ error: 'Forbidden' })

    const phone = contract.clients?.phone
    if (!phone) return res.status(400).json({ error: 'Client has no phone number on file' })

    // Strip the optional data:...;base64, prefix and decode.
    const base64Data = pdf_base64.includes(',') ? pdf_base64.split(',')[1] : pdf_base64
    let pdfBuffer
    try {
      pdfBuffer = Buffer.from(base64Data, 'base64')
    } catch (decodeErr) {
      return res.status(400).json({ error: 'pdf_base64 is not valid base64' })
    }
    if (pdfBuffer.length === 0) {
      return res.status(400).json({ error: 'pdf_base64 decoded to empty buffer' })
    }

    // Upload unsigned PDF to private bucket using service_role (bypasses RLS).
    const unsignedObjectPath = `${id}/unsigned.pdf`
    const { error: upErr } = await supabaseAdmin
      .storage.from('signed_contracts')
      .upload(unsignedObjectPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) {
      console.error('[contracts] unsigned PDF upload failed:', upErr.message)
      return res.status(500).json({ error: 'pdf_upload_failed', detail: upErr.message })
    }

    // Mint a fresh token (replaces any previous token on retry)
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SIGN_TOKEN_TTL_HOURS * 3600_000).toISOString()

    const { error: updateErr } = await supabaseAdmin
      .from('contracts')
      .update({
        signature_status:        'pending',
        signing_token:           token,
        signing_token_expires_at: expiresAt,
        unsigned_pdf_path:       `signed_contracts/${unsignedObjectPath}`,
      })
      .eq('id', id)
    if (updateErr) return next(updateErr)

    const baseUrl = process.env.FRONTEND_URL || 'https://app.rentaflow.local'
    const signUrl = `${baseUrl}/?sign=${token}`

    const fullName = `${contract.clients.first_name || ''} ${contract.clients.last_name || ''}`.trim()
    const body =
      `Bonjour ${fullName || ''}, votre contrat de location ${contract.contract_number} ` +
      `est prêt à être signé. Veuillez cliquer sur ce lien sécurisé pour le consulter et signer :\n\n` +
      `${signUrl}\n\n` +
      `Lien valable ${SIGN_TOKEN_TTL_HOURS}h.`

    try {
      await sendWhatsAppMessage(phone, body)
    } catch (waErr) {
      console.error('[contracts] WhatsApp send failed:', waErr.message)
      // Token is still valid — manager can retry by clicking the button again.
      return res.status(502).json({
        error: 'WhatsApp delivery failed. Token saved — click again to retry.',
        sign_url: signUrl,
      })
    }

    res.json({ success: true, sign_url: signUrl, expires_at: expiresAt })
  } catch (err) {
    next(err)
  }
})

export default router

// ─────────────────────────────────────────────────────────────
// Public signing endpoints — token-only auth
// Mounted on a separate router so requireAuth doesn't gate them.
// ─────────────────────────────────────────────────────────────

export const publicContractsRouter = Router()

// GET /contracts/sign/:token — fetch contract metadata for the signing page
publicContractsRouter.get('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params
    const { data, error } = await supabaseAdmin
      .from('contracts')
      .select(`
        id, contract_number, signature_status, signing_token_expires_at,
        total_ttc, start_date, end_date,
        clients(first_name, last_name),
        vehicles(make, model, registration)
      `)
      .eq('signing_token', token)
      .maybeSingle()
    if (error) return next(error)
    if (!data)                                     return res.status(404).json({ error: 'invalid_token' })
    if (data.signature_status === 'signed')        return res.status(409).json({ error: 'already_signed' })
    if (new Date(data.signing_token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'expired' })
    }
    res.json({
      contract: {
        id:             data.id,
        contractNumber: data.contract_number,
        clientName:     `${data.clients?.first_name || ''} ${data.clients?.last_name || ''}`.trim(),
        vehicleName:    data.vehicles
          ? `${data.vehicles.make} ${data.vehicles.model} (${data.vehicles.registration})`
          : null,
        totalTTC:       data.total_ttc,
        startDate:      data.start_date,
        endDate:        data.end_date,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /contracts/sign/:token/sign-native
// Body: { signatureBase64: 'data:image/png;base64,...' }
// Stamps the signature onto the unsigned PDF, uploads the result, marks signed.
publicContractsRouter.post('/sign/:token/sign-native', async (req, res, next) => {
  try {
    const { token } = req.params
    const { signatureBase64 } = req.body
    if (!signatureBase64 || !signatureBase64.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'signatureBase64 must be a data:image/png;base64,... string' })
    }

    // Validate token state
    const { data: contract, error } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, signature_status, signing_token_expires_at, unsigned_pdf_path, contract_number')
      .eq('signing_token', token)
      .maybeSingle()
    if (error)                                         return next(error)
    if (!contract)                                     return res.status(404).json({ error: 'invalid_token' })
    if (contract.signature_status === 'signed')        return res.status(409).json({ error: 'already_signed' })
    if (new Date(contract.signing_token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'expired' })
    }
    if (!contract.unsigned_pdf_path) {
      return res.status(500).json({ error: 'unsigned_pdf_not_found' })
    }

    // Storage paths in code use the bucket-relative form (no leading bucket name).
    const objectPath = contract.unsigned_pdf_path.replace(/^signed_contracts\//, '')

    // Download unsigned PDF
    const { data: pdfBlob, error: dlErr } = await supabaseAdmin
      .storage.from('signed_contracts').download(objectPath)
    if (dlErr || !pdfBlob) {
      return res.status(500).json({ error: 'pdf_download_failed', detail: dlErr?.message })
    }
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())

    // Stamp signature with pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const signatureBuffer = Buffer.from(signatureBase64.split(',')[1], 'base64')
    const signaturePng = await pdfDoc.embedPng(signatureBuffer)

    // Stamp on the LAST page, bottom-right area.
    // A4 portrait ≈ 595×842pt. Block: 160×60pt at (pageW − 220, 80).
    const pages       = pdfDoc.getPages()
    const lastPage    = pages[pages.length - 1]
    const pageWidth   = lastPage.getWidth()
    const stampWidth  = 160
    const stampHeight = 60
    const stampX      = pageWidth - stampWidth - 60
    const stampY      = 80
    lastPage.drawImage(signaturePng, {
      x: stampX, y: stampY, width: stampWidth, height: stampHeight,
    })

    const stampedBytes = await pdfDoc.save()

    // Upload signed PDF
    const signedPath = `${contract.id}/signed.pdf`
    const { error: upErr } = await supabaseAdmin
      .storage.from('signed_contracts')
      .upload(signedPath, stampedBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) return res.status(500).json({ error: 'pdf_upload_failed', detail: upErr.message })

    // Long-lived signed URL (7 days) for manager access
    const { data: urlData } = await supabaseAdmin
      .storage.from('signed_contracts')
      .createSignedUrl(signedPath, 7 * 24 * 3600)

    // Final DB update — this UPDATE event triggers Realtime on the manager dashboard
    const { error: updateErr } = await supabaseAdmin
      .from('contracts')
      .update({
        signature_status:        'signed',
        signed_at:               new Date().toISOString(),
        signed_pdf_url:          urlData?.signedUrl || null,
        signing_token:           null,   // burn the token
        signing_token_expires_at: null,
      })
      .eq('id', contract.id)
    if (updateErr) return next(updateErr)

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})
