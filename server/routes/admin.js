import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { anonymizeClient } from '../lib/anonymize.js'

const router = Router()

// POST /admin/clients/:id/anonymize  { reason?: string }
router.post('/clients/:id/anonymize', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { reason } = req.body || {}
  const { agency_id, id: actor_user_id } = req.user

  const result = await anonymizeClient({
    clientId:    id,
    agencyId:    agency_id,
    actorUserId: actor_user_id,
    action:      'client.anonymize',
    reason:      reason || null,
  })

  if (result.error === 'Client not found') return res.status(404).json({ error: result.error })
  if (result.error === 'Forbidden')         return res.status(403).json({ error: result.error })
  if (result.skipped)                       return res.status(409).json({ error: 'Already anonymized' })
  if (result.error)                         return res.status(500).json({ error: result.error })

  return res.json({ ok: true })
})

export default router
