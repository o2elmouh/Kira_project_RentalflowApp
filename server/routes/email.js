import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
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

export default router
