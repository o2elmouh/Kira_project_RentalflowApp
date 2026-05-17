import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { PDFDocument } from 'pdf-lib'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { sendWhatsAppMessage } from '../lib/twilioClient.js'
import { SIGN_TOKEN_TTL_HOURS, prepareSignableContract, escapeHtml } from '../lib/contractSigning.js'
import { buildUnsignedContractPdf } from '../lib/unsignedContractPdf.js'

const SIGNED_URL_TTL_SECONDS = 60 // short-lived presigned URL for downloads

function maskEmail(e) {
  if (!e) return ''
  const [u, d] = e.split('@')
  if (!d) return '***'
  return `${u.slice(0, 2)}***@${d}`
}

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

    // Close contract + update vehicle status in a transaction-like sequence.
    // Real DB columns (cf. lib/db.js contractToDb mapper):
    //   mileage_end (not return_km), fuel_level_end (not return_fuel_level),
    //   actual_return_date (not closed_at). `damages` is not a column —
    //   damage notes go into `notes` if needed; structured damages live in
    //   restitution photos/snapshots, not on the contract row.
    const [closeResult, vehicleResult] = await Promise.all([
      supabaseAdmin
        .from('contracts')
        .update({
          status:              'closed',
          mileage_end:         returnKm,
          fuel_level_end:      returnFuelLevel,
          notes:               damages || null,
          extra_fees:          extraFees || 0,
          actual_return_date:  new Date().toISOString(),
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

// POST /contracts/:id/finalize — lock the contract case (wizard completion)
// Sets finalized_at = NOW(). Status stays 'active' so Restitution can still
// operate on the contract when the vehicle returns.
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { id } = req.params

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('agency_id').eq('id', req.user.id).single()

    const { data: contract, error: contractError } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, status, finalized_at')
      .eq('id', id)
      .single()

    if (contractError || !contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== profile.agency_id) return res.status(403).json({ error: 'Forbidden' })
    if (contract.finalized_at) {
      // Idempotent: already finalized, return the existing row.
      return res.json({ contract, alreadyFinalized: true })
    }

    const { data, error } = await supabaseAdmin
      .from('contracts')
      .update({ finalized_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return next(error)
    res.json({ contract: data })
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

    const oldEnd  = new Date(contract.return_date)
    const newEnd  = new Date(newEndDate)
    if (isNaN(newEnd.getTime())) return res.status(400).json({ error: 'Invalid date format' })
    const extraDays = Math.round((newEnd - oldEnd) / 86400000)
    if (extraDays <= 0) return res.status(400).json({ error: 'New end date must be after current end date' })
    if (extraDays > 365) return res.status(400).json({ error: 'Extension cannot exceed 365 days' })

    const rate = Number(dailyRate || contract.daily_rate)
    if (!rate || rate <= 0 || rate > 100000) return res.status(400).json({ error: 'Invalid daily rate' })
    const extraAmount = extraDays * rate

    const { data, error } = await supabaseAdmin
      .from('contracts')
      .update({
        return_date: newEndDate,
        total_amount: (contract.total_amount || 0) + extraAmount,
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
// GET /contracts/:id/unsigned-pdf — server-side PDF generator
// ─────────────────────────────────────────────────────────────
//
// Mobile clients can't run the web app's jsPDF generator (browser-only),
// so they fetch the unsigned PDF from this endpoint and forward it to
// `/send-whatsapp` or `/send-email`.
//
// Response: { pdf_base64: '<raw base64, no data URI prefix>' }
router.get('/:id/unsigned-pdf', async (req, res, next) => {
  try {
    const { id } = req.params
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const { data: contract, error: cErr } = await supabaseAdmin
      .from('contracts')
      .select('*')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .maybeSingle()
    if (cErr)     return next(cErr)
    if (!contract) return res.status(404).json({ error: 'Contract not found' })

    const [{ data: client }, { data: vehicle }, { data: agency }] = await Promise.all([
      contract.client_id
        ? supabaseAdmin.from('clients').select('*').eq('id', contract.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      contract.vehicle_id
        ? supabaseAdmin.from('vehicles').select('*').eq('id', contract.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from('agencies').select('*').eq('id', agencyId).maybeSingle(),
    ])

    const bytes = await buildUnsignedContractPdf({ contract, client, vehicle, agency })
    const pdf_base64 = Buffer.from(bytes).toString('base64')
    res.json({ pdf_base64 })
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
    const prep = await prepareSignableContract({
      contractId:    req.params.id,
      pdfBase64:     req.body.pdf_base64,
      userAgencyId:  req.user.agency_id,
    })
    const phone = prep.client?.phone
    if (!phone) return res.status(400).json({ error: 'Client has no phone number on file' })

    if (prep.templateApplied === 'fallback') {
      console.warn(`[contracts/send-whatsapp] template merge fallback agency=${prep.agencyId} reason="${prep.templateError}"`)
    }

    const fullName = `${prep.client.first_name || ''} ${prep.client.last_name || ''}`.trim()
    // WhatsApp body is plain text — no HTML injection vector but still keep names tidy.
    const body =
      `Bonjour ${fullName}, votre contrat de location ${prep.contract.contract_number} ` +
      `est prêt à être signé. Veuillez cliquer sur ce lien sécurisé pour le consulter et signer :\n\n` +
      `${prep.signUrl}\n\n` +
      `Lien valable ${SIGN_TOKEN_TTL_HOURS}h.`

    try {
      await sendWhatsAppMessage(phone, body)
    } catch (waErr) {
      console.error(`[contracts/send-whatsapp] threw contract=${prep.contract.id} err="${waErr.message}"`)
      return res.status(502).json({
        error: 'WhatsApp delivery failed. Token saved — click again to retry.',
        sign_url: prep.signUrl,
      })
    }

    console.log(`[contracts/send-whatsapp] ok contract=${prep.contract.id} reused=${prep.reused} template=${prep.templateApplied}`)
    res.json({ success: true, sign_url: prep.signUrl, expires_at: prep.expiresAt, template_applied: prep.templateApplied })
  } catch (err) {
    if (err.status) return res.status(err.status).json(err.body)
    next(err)
  }
})

// POST /contracts/:id/send-email
// Same flow as /send-whatsapp but dispatches the signing link by email (Resend).
// Body: { pdf_base64 }
router.post('/:id/send-email', async (req, res, next) => {
  try {
    const prep = await prepareSignableContract({
      contractId:    req.params.id,
      pdfBase64:     req.body.pdf_base64,
      userAgencyId:  req.user.agency_id,
    })
    const email = prep.client?.email
    if (!email) return res.status(400).json({ error: 'Client has no email on file' })

    if (prep.templateApplied === 'fallback') {
      console.warn(`[contracts/send-email] template merge fallback agency=${prep.agencyId} reason="${prep.templateError}"`)
    }

    const fullName = `${prep.client.first_name || ''} ${prep.client.last_name || ''}`.trim()
    const safeName = escapeHtml(fullName)
    const safeNumber = escapeHtml(prep.contract.contract_number)
    const safeUrl = escapeHtml(prep.signUrl)

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const result = await resend.emails.send({
          from: process.env.RESEND_FROM || 'onboarding@resend.dev',
          to: email,
          subject: `Signature de votre contrat ${prep.contract.contract_number}`,
          html: `
            <p>Bonjour ${safeName},</p>
            <p>Votre contrat de location <strong>${safeNumber}</strong> est prêt à être signé.</p>
            <p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#1c1a16;color:#fff;border-radius:6px;text-decoration:none">Signer le contrat</a></p>
            <p style="color:#666;font-size:13px">Ou ouvrez ce lien : <a href="${safeUrl}">${safeUrl}</a><br/>Lien valable ${SIGN_TOKEN_TTL_HOURS}h.</p>
          `,
        })
        if (result?.error) {
          console.error(`[contracts/send-email] resend rejected contract=${prep.contract.id} err=${JSON.stringify(result.error)}`)
          return res.status(502).json({
            error: `Email delivery rejected: ${result.error.message || 'unknown'}`,
            sign_url: prep.signUrl,
          })
        }
        console.log(`[contracts/send-email] ok contract=${prep.contract.id} to=${maskEmail(email)} resendId=${result?.data?.id || 'n/a'} reused=${prep.reused} template=${prep.templateApplied}`)
      } catch (mailErr) {
        console.error(`[contracts/send-email] threw contract=${prep.contract.id} err="${mailErr.message}"`)
        return res.status(502).json({
          error: 'Email delivery failed. Token saved — click again to retry.',
          sign_url: prep.signUrl,
        })
      }
    } else {
      console.log(`[contracts/send-email] no RESEND_API_KEY — would email ${maskEmail(email)} ${prep.signUrl}`)
    }

    res.json({ success: true, sign_url: prep.signUrl, expires_at: prep.expiresAt, template_applied: prep.templateApplied })
  } catch (err) {
    if (err.status) return res.status(err.status).json(err.body)
    next(err)
  }
})

// GET /contracts/:id/signed-pdf-url
// Returns a short-lived signed URL for the agent to download the signed PDF.
// Re-checks ownership on every call. URL TTL is 60s — never persisted in DB.
router.get('/:id/signed-pdf-url', async (req, res, next) => {
  try {
    const { id } = req.params
    const { data: contract, error } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, signed_pdf_path')
      .eq('id', id)
      .maybeSingle()
    if (error) return next(error)
    if (!contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== req.user.agency_id) return res.status(403).json({ error: 'Forbidden' })
    if (!contract.signed_pdf_path) return res.status(404).json({ error: 'Not yet signed' })

    const { data: urlData, error: urlErr } = await supabaseAdmin
      .storage.from('signed_contracts')
      .createSignedUrl(contract.signed_pdf_path, SIGNED_URL_TTL_SECONDS)
    if (urlErr) return next(urlErr)

    res.json({ url: urlData?.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS })
  } catch (err) {
    next(err)
  }
})

// NOTE: Duplicate /send-email route removed — the handler at line 207
// (using prepareSignableContract + escapeHtml) is the canonical one.

// POST /contracts/:id/send-final
// Send the FINAL (already-closed) contract PDF to the client via email or whatsapp.
// Body: { channel: 'email' | 'whatsapp', pdf_base64, recipient?: string }
router.post('/:id/send-final', async (req, res, next) => {
  try {
    const { id } = req.params
    const { channel, pdf_base64, recipient } = req.body
    if (!channel || !['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be email or whatsapp' })
    }
    if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 is required' })

    const { data: contract, error } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, contract_number, clients(email, phone, first_name, last_name)')
      .eq('id', id)
      .single()
    if (error || !contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== req.user.agency_id) return res.status(403).json({ error: 'Forbidden' })

    const fullName = `${contract.clients?.first_name || ''} ${contract.clients?.last_name || ''}`.trim()

    if (channel === 'whatsapp') {
      const phone = recipient || contract.clients?.phone
      if (!phone) return res.status(400).json({ error: 'No phone number available' })
      try {
        await sendWhatsAppMessage(
          phone,
          `Bonjour ${fullName}, voici votre contrat finalisé ${contract.contract_number}. Vous trouverez le PDF en pièce jointe.`
        )
        // Note: Twilio sandbox doesn't accept attachments easily — PDF link would require Storage.
        // For now we send the message; the agent can also download/forward the file.
        return res.json({ success: true, channel: 'whatsapp' })
      } catch (waErr) {
        return res.status(502).json({ error: 'WhatsApp delivery failed', detail: waErr.message })
      }
    }

    // channel === 'email'
    const email = recipient || contract.clients?.email
    if (!email) return res.status(400).json({ error: 'No email on file' })

    if (process.env.RESEND_API_KEY) {
      const base64Data = pdf_base64.includes(',') ? pdf_base64.split(',')[1] : pdf_base64
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        // SECURITY: escape DB-sourced values before interpolating into HTML —
        // client/contract names are originally user-supplied and could carry
        // HTML if anything upstream stored raw markup.
        const safeName   = escapeHtml(fullName)
        const safeNumber = escapeHtml(contract.contract_number || '')
        // Sanitize filename: strip path separators and constrain charset.
        const safeFile = (contract.contract_number || 'contract').replace(/[^A-Za-z0-9._-]/g, '_')
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'onboarding@resend.dev',
          to: email,
          subject: `Votre contrat finalisé ${contract.contract_number}`,
          html: `<p>Bonjour ${safeName},</p><p>Veuillez trouver ci-joint votre contrat finalisé <strong>${safeNumber}</strong>.</p>`,
          attachments: [{ filename: `${safeFile}.pdf`, content: base64Data }],
        })
        return res.json({ success: true, channel: 'email' })
      } catch (mailErr) {
        return res.status(502).json({ error: 'Email delivery failed', detail: mailErr.message })
      }
    }
    console.log(`[contracts/send-final] No RESEND_API_KEY — would send contract ${contract.contract_number} to ${email}`)
    res.json({ success: true, channel: 'email', note: 'Email provider not configured' })
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

// SECURITY: rate-limit the public signing endpoints to slow token-guessing
// attempts. Tokens are UUID + 16-hex HMAC (effectively unguessable), but
// without a limit an attacker could still hammer the endpoint to harvest
// signed PDFs from leaked tokens or burn CPU.
const signRead = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,                    // 60 reads / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: r => r.ip,
  message: { error: 'Too many requests' },
})
const signWrite = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                    // 10 sign attempts / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: r => r.ip,
  message: { error: 'Too many requests' },
})

// GET /contracts/sign/:token — fetch contract metadata for the signing page
publicContractsRouter.get('/sign/:token', signRead, async (req, res, next) => {
  try {
    const { token } = req.params
    const { data, error } = await supabaseAdmin
      .from('contracts')
      .select(`
        id, contract_number, signature_status, signing_token_expires_at,
        total_amount, pickup_date, return_date,
        clients(first_name, last_name),
        vehicles(brand, model, plate_number)
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
          ? `${data.vehicles.brand} ${data.vehicles.model} (${data.vehicles.plate_number})`
          : null,
        totalTTC:       data.total_amount,
        startDate:      data.pickup_date,
        endDate:        data.return_date,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /contracts/sign/:token/sign-native
// Body: { signatureBase64: 'data:image/png;base64,...' }
// Stamps the signature onto the unsigned PDF, uploads the result, marks signed.
publicContractsRouter.post('/sign/:token/sign-native', signWrite, async (req, res, next) => {
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

    // Final DB update — store the bucket-relative path (NOT a signed URL).
    // The manager dashboard mints a fresh short-TTL URL on demand via
    // GET /contracts/:id/signed-pdf-url (auth + agency check).
    const { error: updateErr } = await supabaseAdmin
      .from('contracts')
      .update({
        signature_status:        'signed',
        signed_at:               new Date().toISOString(),
        signed_pdf_path:         signedPath,
        signed_pdf_url:          null,   // legacy column — no longer populated
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
