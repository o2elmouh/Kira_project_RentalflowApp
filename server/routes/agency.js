import { Router } from 'express'
import multer from 'multer'
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

// ── Contract template upload (admin only) ─────────────────────
// Each agency may upload a custom contract PDF template; signing flow stamps
// onto this template instead of the auto-generated one. Stored in the
// `agency-templates` private bucket. 5 MB cap, PDF only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
})

router.post('/contract-template', requireAdmin, upload.single('template'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file received (field name: "template")' })
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(400).json({ error: 'No agency on profile' })

    const path = `${agencyId}/contract.pdf`
    const { error: upErr } = await supabaseAdmin
      .storage.from('agency-templates')
      .upload(path, req.file.buffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) return res.status(500).json({ error: 'upload_failed', detail: upErr.message })

    const { data: urlData } = await supabaseAdmin
      .storage.from('agency-templates')
      .createSignedUrl(path, 365 * 24 * 3600) // 1 year — refreshed on save
    const url = urlData?.signedUrl

    const { error: updErr } = await supabaseAdmin
      .from('agencies')
      .update({ contract_template_url: url })
      .eq('id', agencyId)
    if (updErr) return next(updErr)

    res.json({ contract_template_url: url })
  } catch (err) { next(err) }
})

router.delete('/contract-template', requireAdmin, async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(400).json({ error: 'No agency on profile' })

    await supabaseAdmin.storage.from('agency-templates').remove([`${agencyId}/contract.pdf`])
    const { error: updErr } = await supabaseAdmin
      .from('agencies')
      .update({ contract_template_url: null })
      .eq('id', agencyId)
    if (updErr) return next(updErr)

    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
