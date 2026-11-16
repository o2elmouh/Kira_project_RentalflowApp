import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()
router.use(requireAuth)

// GoTrue merges app_metadata key by key and deletes keys set to null.
const inviteMetadata = (agencyId, role, invitedBy) => ({
  invited_agency_id: agencyId,
  invited_role:      role,
  invited_by:        invitedBy,
})

// GET /team — list all members of the caller's agency (admin only)
router.get('/', requireAdmin, async (req, res) => {
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
  const { email, role = 'staff' } = req.body
  if (!email) return res.status(400).json({ error: 'email is required' })
  if (!req.user.agency_id) return res.status(400).json({ error: 'No agency on profile' })
  // Accept legacy 'agent' as alias for 'staff' (frontend may still send it)
  const normalizedRole = role === 'agent' ? 'staff' : role
  if (!['admin', 'staff'].includes(normalizedRole)) {
    return res.status(400).json({ error: `Invalid role: "${role}". Must be admin or staff.` })
  }

  // Invite via Supabase Auth — user receives a magic-link email
  // Timing log to investigate observed email send delays
  const t0 = Date.now()
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      agency_id: req.user.agency_id,
      role: normalizedRole,
      invited_by: req.user.id,
    },
  })
  const elapsed = Date.now() - t0
  console.log(`[team] inviteUserByEmail(${email}, role=${normalizedRole}) → ${elapsed}ms`)
  if (elapsed > 3000) {
    console.warn(`[team] SLOW invite email send: ${elapsed}ms — check Supabase SMTP config`)
  }

  if (error) return res.status(400).json({ error: error.message })

  // The invitation of record lives in app_metadata, which only the service
  // role can write. user_metadata (the `data` above) is editable by the user
  // themselves, so POST /team/accept-invite never reads it.
  const { error: metaErr } = data.user?.id
    ? await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        app_metadata: inviteMetadata(req.user.agency_id, normalizedRole, req.user.id),
      })
    : { error: { message: 'invite returned no user id' } }
  if (metaErr) {
    console.error(`[team] could not record invitation for ${email}: ${metaErr.message}`)
    return res.status(500).json({ error: 'Invitation could not be recorded. Invite this person again.' })
  }

  res.json({ invited: true, email, role: normalizedRole, id: data.user.id, elapsedMs: elapsed })
})

// POST /team/accept-invite — the invited user joins the agency that invited them.
// Any authenticated user may call it; what they join is decided solely by the
// invitation recorded in app_metadata at invite time. `role` and `agency_id`
// can only be written here (service role) — the profiles guard trigger rejects
// them from a browser session.
router.post('/accept-invite', async (req, res) => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
  if (error || !data?.user) {
    return res.status(500).json({ error: error?.message || 'Could not load user' })
  }

  const authUser = data.user
  const invite   = authUser.app_metadata || {}
  const agencyId = invite.invited_agency_id
  if (!agencyId) return res.status(404).json({ error: 'No pending invitation for this account' })
  if (req.user.agency_id && req.user.agency_id !== agencyId) {
    return res.status(409).json({ error: 'This account already belongs to another agency' })
  }
  const role = invite.invited_role === 'admin' ? 'admin' : 'staff'

  // Consume the invitation BEFORE creating the profile: it is single-use, so a
  // member who is later removed cannot re-join by calling this again.
  const { error: consumeErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    app_metadata: inviteMetadata(null, null, null),
  })
  if (consumeErr) return res.status(500).json({ error: consumeErr.message })

  const bodyName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : ''
  const fullName = bodyName || authUser.user_metadata?.full_name || (authUser.email || '').split('@')[0]

  const { error: upsertErr } = await supabaseAdmin
    .from('profiles')
    .upsert(
      { id: authUser.id, email: authUser.email, full_name: fullName, agency_id: agencyId, role },
      { onConflict: 'id' }
    )

  if (upsertErr) {
    // Put the invitation back so the user can retry instead of being stranded.
    const { error: restoreErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      app_metadata: inviteMetadata(agencyId, role, invite.invited_by ?? null),
    })
    if (restoreErr) console.error(`[team] could not restore invitation for ${authUser.id}: ${restoreErr.message}`)
    const status = /SEAT_LIMIT_REACHED/.test(upsertErr.message || '') ? 409 : 500
    return res.status(status).json({ error: upsertErr.message })
  }

  res.json({ joined: true, agency_id: agencyId, role })
})

// PATCH /team/:id/role — admin changes a member's role
router.patch('/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

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
