import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { appendConversation } from '../lib/conversation.js'

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
      .select('id, make, model')
      .eq('id', vehicleId)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (vehErr) return res.status(500).json({ error: vehErr.message })
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

    const vehicleName = `${vehicle.make} ${vehicle.model}`.trim()
    const to = lead.sender_id  // Gmail leads store the email address in sender_id

    const subject = `Offre de location — ${vehicleName}`
    const html = `<p>Bonjour,</p><p>Suite à votre demande, nous vous proposons une <strong>${vehicleName}</strong> pour <strong>${priceTotal} MAD</strong> au total.</p><p>Répondez à cet email pour confirmer ou décliner l'offre.</p><p>Cordialement,<br/>RentaFlow</p>`

      if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({ from: 'RentaFlow <noreply@rentaflow.ma>', to, subject, html })
    } else {
      console.log(`[Email/send-offer] No RESEND_API_KEY — would send to ${to}: ${subject}`)
    }

    // Log offer only after confirmed send
    appendConversation(leadId, { role: 'agent', type: 'offer', text: subject, vehicleName, priceTotal })
      .catch(err => console.error('[email/send-offer] conv log error:', err.message))

    const { error: updateErr } = await supabaseAdmin
      .from('pending_demands')
      .update({ status: 'offer_sent', offered_vehicle_id: vehicleId, offered_price_total: priceTotal })
      .eq('id', leadId)

    if (updateErr) console.error('[Email/send-offer] update error:', updateErr.message)

    res.json({ sent: true })
  } catch (err) {
    console.error('[Email/send-offer]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
