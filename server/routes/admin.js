import { Router } from 'express'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

// POST /admin/clients/:id/anonymize  { reason?: string }
router.post('/clients/:id/anonymize', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { reason } = req.body || {}
  const { agency_id, id: actor_user_id } = req.user

  const { data: client, error: fetchErr } = await supabaseAdmin
    .from('clients')
    .select('id, agency_id, anonymized_at')
    .eq('id', id)
    .single()

  if (fetchErr || !client) return res.status(404).json({ error: 'Client not found' })
  if (client.agency_id !== agency_id) return res.status(403).json({ error: 'Forbidden' })
  if (client.anonymized_at) return res.status(409).json({ error: 'Already anonymized' })

  const { error: updateErr } = await supabaseAdmin
    .from('clients')
    .update({
      id_number:               null,
      id_expiry:               null,
      driving_license_num:     null,
      driving_license_expiry:  null,
      date_of_birth:           null,
      email:                   null,
      phone:                   null,
      phone2:                  null,
      address:                 null,
      first_name:              '[ANONYMIZED]',
      last_name:               '[ANONYMIZED]',
      anonymized_at:           new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) return res.status(500).json({ error: updateErr.message })

  await supabaseAdmin.from('audit_log').insert({
    agency_id,
    actor_user_id,
    action:       'client.anonymize',
    target_table: 'clients',
    target_id:    id,
    reason:       reason || null,
  })

  return res.json({ ok: true })
})

export default router
