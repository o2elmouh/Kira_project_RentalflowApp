import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()
router.use(requireAuth)

// GET /team — list all members of the caller's agency
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .eq('agency_id', req.user.agency_id)
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /team/invite — admin sends invitation email
router.post('/invite', requireAdmin, async (req, res) => {
  const { email, role = 'agent' } = req.body
  if (!email) return res.status(400).json({ error: 'email is required' })
  if (!['admin', 'agent'].includes(role)) return res.status(400).json({ error: 'role must be admin or agent' })

  // Invite via Supabase Auth — user receives a magic-link email
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      agency_id: req.user.agency_id,
      role,
      invited_by: req.user.id,
    },
  })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ invited: true, email, role, id: data.user?.id })
})

// PATCH /team/:id/role — admin changes a member's role
router.patch('/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body
  if (!['admin', 'agent'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id) // can't modify members of other agencies

  if (error) return res.status(500).json({ error: error.message })
  res.json({ updated: true })
})

// DELETE /team/:id — admin removes a member (soft: sets role to null / removes agency link)
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' })

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ agency_id: null, role: null })
    .eq('id', req.params.id)
    .eq('agency_id', req.user.agency_id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ removed: true })
})

export default router
