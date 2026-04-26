import { Router } from 'express'
import { Resend } from 'resend'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import rateLimit from 'express-rate-limit'

const router = Router()
router.use(requireAuth)

// Strict rate limit on email — 10 per hour per user
const emailLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Email limit reached. Try again in 1 hour.' },
})

// POST /email/contract — send contract PDF by email to client
// Placeholder — wire up Resend / Mailgun / SMTP when ready
router.post('/contract', emailLimit, async (req, res) => {
  const { to, contractNumber, pdfBase64 } = req.body
  if (!to || !contractNumber || !pdfBase64) {
    return res.status(400).json({ error: 'Missing required fields: to, contractNumber, pdfBase64' })
  }

  // TODO: replace with real email provider
  // Example with Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY)
  // await resend.emails.send({
  //   from: 'RentaFlow <noreply@rentaflow.ma>',
  //   to,
  //   subject: `Votre contrat de location ${contractNumber}`,
  //   html: `<p>Veuillez trouver ci-joint votre contrat <strong>${contractNumber}</strong>.</p>`,
  //   attachments: [{ filename: `${contractNumber}.pdf`, content: pdfBase64 }],
  // })

  console.log(`[Email] Would send contract ${contractNumber} to ${to}`)
  res.json({ sent: true, to, contractNumber, note: 'Email provider not yet configured' })
})

// POST /email/send-offer — send a quote offer to a Gmail lead via Resend
router.post('/send-offer', emailLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { leadId, vehicleId, priceTotal, startDate, endDate, notes } = req.body

  if (!leadId || !vehicleId || priceTotal == null) {
    return res.status(400).json({ error: 'leadId, vehicleId and priceTotal are required' })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email provider not configured (RESEND_API_KEY missing)' })
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
    const toEmail = lead.sender_id

    let datesLine = ''
    if (startDate && endDate) datesLine = `<p>📅 <strong>Du ${startDate} au ${endDate}</strong></p>`
    let notesLine = notes ? `<p>${notes}</p>` : ''

    const html = `
      <p>Bonjour,</p>
      <p>Suite à votre demande, nous avons le plaisir de vous proposer :</p>
      <p>🚗 <strong>${vehicleName}</strong> — <strong>${priceTotal} MAD</strong> au total</p>
      ${datesLine}
      ${notesLine}
      <p>Pour confirmer ou poser une question, répondez simplement à cet email.</p>
      <br><p>Cordialement,<br>L'équipe RentaFlow</p>
    `

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'RentaFlow <noreply@rentaflow.ma>',
      to: toEmail,
      subject: `Votre offre de location — ${vehicleName}`,
      html,
    })

    const { error: updateErr } = await supabaseAdmin
      .from('pending_demands')
      .update({ status: 'offer_sent', offered_vehicle_id: vehicleId, offered_price_total: priceTotal })
      .eq('id', leadId)

    if (updateErr) console.error('[email/send-offer] update error:', updateErr.message)

    res.json({ sent: true })
  } catch (err) {
    console.error('[email/send-offer]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
