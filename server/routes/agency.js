import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()

// All agency routes require a valid Supabase JWT
router.use(requireAuth)

// GET /agency — fetch the agency of the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('agency_id, role')
      .eq('id', req.user.id)
      .single()

    if (profileError || !profile) return res.status(404).json({ error: 'Profile not found' })

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .select('*')
      .eq('id', profile.agency_id)
      .single()

    if (agencyError) return next(agencyError)
    res.json(agency)
  } catch (err) {
    next(err)
  }
})

// PATCH /agency — update agency settings (admin only)
router.patch('/', requireAdmin, async (req, res, next) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('agency_id')
      .eq('id', req.user.id)
      .single()

    if (!profile) return res.status(404).json({ error: 'Profile not found' })

    const allowed = ['name', 'phone', 'city', 'address', 'email', 'ice', 'rc', 'if_number', 'patente', 'insurance_policy']
    const patch = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    )

    const { data, error } = await supabaseAdmin
      .from('agencies')
      .update(patch)
      .eq('id', profile.agency_id)
      .select()
      .single()

    if (error) return next(error)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
