/**
 * WhatsApp outbound via Baileys (per-agency QR-scanned session).
 *
 * Inbound messages arrive via Baileys events handled in
 * server/lib/baileys/sessionManager.js → handleInboundWhatsApp().
 *
 * Routes:
 *   GET  /whatsapp/status              — current Baileys session state for this agency
 *   POST /whatsapp/connect             — start (or re-start) the agency's session
 *   POST /whatsapp/disconnect          — log out and drop the session
 *   POST /whatsapp/contract
 *   POST /whatsapp/invoice
 *   POST /whatsapp/payment
 *   POST /whatsapp/restitution         — text-only (PDF via URL pending)
 *   POST /whatsapp/send-offer
 */

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { sendWhatsAppMessage } from '../lib/twilioClient.js'
import * as sessionManager from '../lib/baileys/sessionManager.js'
import { appendConversation } from '../lib/conversation.js'
import { sendToAgency } from '../lib/pushNotifications.js'

const router = Router()
router.use(requireAuth)

const whatsappLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyGenerator: r => r.ip })
const paymentLimit  = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,  keyGenerator: r => r.ip })

// ── Session lifecycle (Baileys per-agency socket) ─────────

router.get('/status', (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  res.json(sessionManager.getStatus(agencyId))
})

router.post('/connect', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  await sessionManager.startSession(agencyId)
  res.json({ started: true })
})

router.post('/disconnect', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  await sessionManager.disconnectSession(agencyId)
  res.json({ disconnected: true })
})

// ── Outbound routes ───────────────────────────────────────

router.post('/contract', whatsappLimit, async (req, res) => {
  const { to, clientName, contractNumber, vehicleName, startDate, endDate } = req.body
  if (!to || !clientName || !contractNumber || !vehicleName || !startDate || !endDate)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, votre contrat de location *${contractNumber}* pour le véhicule *${vehicleName}* du ${startDate} au ${endDate} a bien été enregistré.`
    await sendWhatsAppMessage(to, body, req.user.agency_id)
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/contract]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/invoice', whatsappLimit, async (req, res) => {
  const { to, clientName, invoiceNumber, totalTTC } = req.body
  if (!to || !clientName || !invoiceNumber || totalTTC == null)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, votre facture *${invoiceNumber}* d'un montant de *${totalTTC} MAD* a bien été générée.`
    await sendWhatsAppMessage(to, body, req.user.agency_id)
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/invoice]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/payment', paymentLimit, async (req, res) => {
  const { to, clientName, contractNumber, amount, paymentLink } = req.body
  if (!to || !clientName || !contractNumber || amount == null || !paymentLink)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = `Bonjour ${clientName}, pour régler votre location ${contractNumber} (${amount} MAD), cliquez sur ce lien de paiement sécurisé CMI : ${paymentLink}`
    await sendWhatsAppMessage(to, body, req.user.agency_id)
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/payment]', err.message)
    res.status(502).json({ error: err.message })
  }
})

router.post('/restitution', whatsappLimit, async (req, res) => {
  const { to, clientName, contractNumber, totalExtraFees } = req.body
  if (!to || !clientName || !contractNumber || totalExtraFees == null)
    return res.status(400).json({ error: 'Missing required fields' })
  try {
    const body = totalExtraFees > 0
      ? `Bonjour ${clientName}, votre PV de restitution pour le contrat ${contractNumber} a été établi. Frais supplémentaires : ${totalExtraFees} MAD.`
      : `Bonjour ${clientName}, votre PV de restitution pour le contrat ${contractNumber} a été établi. Aucun frais supplémentaire.`
    await sendWhatsAppMessage(to, body, req.user.agency_id)
    res.json({ sent: true })
  } catch (err) {
    console.error('[WA/restitution]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// POST /whatsapp/send-offer — send a quote offer to a waiting lead
router.post('/send-offer', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  const { leadId, vehicleId, priceTotal, startDate, endDate, notes } = req.body

  if (!agencyId || !leadId || !vehicleId || priceTotal == null)
    return res.status(400).json({ error: 'leadId, vehicleId and priceTotal are required' })

  console.log(`[pipeline:offer] ← send-offer | agency=${agencyId} | lead=${leadId} | vehicle=${vehicleId} | price=${priceTotal} MAD`)

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
      .select('id, brand, model')
      .eq('id', vehicleId)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (vehErr) return res.status(500).json({ error: vehErr.message })
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

    const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim()
    const phone = lead.sender_id.replace(/@.*$/, '').replace(/\D/g, '')

    console.log(`[pipeline:offer] → sending to ${phone} | vehicle="${vehicleName}" | ${startDate}→${endDate}`)

    let body = `Bonjour ! 🚗 Suite à votre demande, nous vous proposons une *${vehicleName}* pour *${priceTotal} MAD* au total.`
    if (startDate && endDate) body += `\n📅 Du *${startDate}* au *${endDate}*`
    if (notes) body += `\n\n${notes}`
    body += `\n\nÊtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.`

    await sendWhatsAppMessage(phone, body, agencyId)
    console.log(`[pipeline:offer] → Baileys message sent to ${phone}`)

    appendConversation(leadId, { role: 'agent', type: 'offer', text: body, vehicleName, priceTotal })
      .catch(err => console.error('[pipeline:offer] conv log error:', err.message))

    const { error: updateErr } = await supabaseAdmin
      .from('pending_demands')
      .update({ status: 'offer_sent', offered_vehicle_id: vehicleId, offered_price_total: priceTotal })
      .eq('id', leadId)

    if (updateErr) console.error('[pipeline:offer] ✗ status update error:', updateErr.message)
    else console.log(`[pipeline:offer] ✓ lead ${leadId} → offer_sent`)

    sendToAgency(
      agencyId,
      '📲 Offre envoyée',
      `${vehicleName} à ${priceTotal} MAD — en attente de la réponse du client.`,
      { type: 'lead', id: leadId, status: 'offer_sent' }
    ).catch(() => {})

    res.json({ sent: true })
  } catch (err) {
    console.error('[pipeline:offer] ✗ error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
