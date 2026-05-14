/**
 * Law 09-08 Phase 5: backend-only CRUD for client PII.
 *
 * Encrypt-on-write / decrypt-on-read for `id_number`, `driving_license_num`,
 * `date_of_birth`. Behaviour is feature-flagged via `ENCRYPT_PII`:
 *
 *   ENCRYPT_PII !== 'true'  →  read/write the legacy plaintext columns.
 *                              The _enc columns are ignored entirely. This is
 *                              the safe default for Phase 5a: no behaviour
 *                              change, no dependency on the data migration.
 *
 *   ENCRYPT_PII === 'true'  →  read/write the *_enc columns. Plaintext
 *                              columns are written as NULL on every save so
 *                              they can be dropped in a later migration.
 *
 * Frontend shape (camelCase) is preserved: the route accepts and returns the
 * same JSON `lib/db.js` was producing pre-Phase-5. This lets the v1.10.7
 * frontend switch be a pure import-path change.
 */

import { Router } from 'express'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { encrypt, decrypt } from '../lib/encryption.js'

const router = Router()
router.use(requireAuth)

const ENCRYPT_PII = process.env.ENCRYPT_PII === 'true'

// ── camelCase ⇄ DB row mappers (mirror lib/db.js pre-Phase-5 shape) ─────────

function clientToDb(c) {
  const idNumber    = c.cinNumber  ?? c.idNumber  ?? c.id_number  ?? null
  const licenseNum  = c.drivingLicenseNumber ?? c.driving_license_num ?? null
  const dob         = c.dateOfBirth ?? c.date_of_birth ?? null

  const row = {
    id:                     c.id,
    first_name:             c.firstName   ?? c.first_name,
    last_name:              c.lastName    ?? c.last_name,
    email:                  c.email       ?? null,
    phone:                  c.phone       ?? null,
    phone2:                 c.phone2      ?? null,
    nationality:            c.nationality ?? 'MA',
    id_type:                c.idType      ?? c.id_type ?? 'cin',
    id_expiry:              c.cinExpiry   ?? c.idExpiry   ?? c.id_expiry   ?? null,
    driving_license_expiry: c.licenseExpiry ?? c.driving_license_expiry ?? null,
    address:                c.address     ?? null,
    city:                   c.city        ?? null,
    country:                c.country     ?? 'MA',
    flag_category:          c.flag?.category ?? c.flagCategory ?? c.flag_category ?? null,
    flag_note:              c.flag?.note  ?? c.flagNote    ?? c.flag_note    ?? null,
    notes:                  c.notes       ?? null,
  }

  if (ENCRYPT_PII) {
    row.id_number_enc           = idNumber   == null ? null : encrypt(String(idNumber))
    row.driving_license_num_enc = licenseNum == null ? null : encrypt(String(licenseNum))
    row.date_of_birth_enc       = dob        == null ? null : encrypt(String(dob))
    row.id_number               = null
    row.driving_license_num     = null
    row.date_of_birth           = null
  } else {
    row.id_number           = idNumber
    row.driving_license_num = licenseNum
    row.date_of_birth       = dob
  }

  return row
}

function clientFromDb(row) {
  if (!row) return row

  const idNumber   = ENCRYPT_PII && row.id_number_enc           ? decrypt(row.id_number_enc)           : row.id_number
  const licenseNum = ENCRYPT_PII && row.driving_license_num_enc ? decrypt(row.driving_license_num_enc) : row.driving_license_num
  const dob        = ENCRYPT_PII && row.date_of_birth_enc       ? decrypt(row.date_of_birth_enc)       : row.date_of_birth

  return {
    ...row,
    firstName:             row.first_name,
    lastName:              row.last_name,
    cinNumber:             idNumber,
    cinExpiry:             row.id_expiry,
    idType:                row.id_type,
    drivingLicenseNumber:  licenseNum,
    licenseExpiry:         row.driving_license_expiry,
    dateOfBirth:           dob,
    flagCategory:          row.flag_category,
    flagNote:              row.flag_note,
    flag:                  row.flag_category ? { category: row.flag_category, note: row.flag_note } : null,
    createdAt:             row.created_at,
    anonymizedAt:          row.anonymized_at,
    // Strip ciphertext columns from the response so they never leak to the UI.
    id_number_enc:           undefined,
    driving_license_num_enc: undefined,
    date_of_birth_enc:       undefined,
  }
}

async function resolveAgencyId(userId) {
  const { data } = await supabaseAdmin
    .from('profiles').select('agency_id').eq('id', userId).maybeSingle()
  return data?.agency_id ?? null
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /clients — list for the authenticated agency
router.get('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id ?? await resolveAgencyId(req.user.id)
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) return next(error)
    res.json((data || []).map(clientFromDb))
  } catch (err) { next(err) }
})

// GET /clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id ?? await resolveAgencyId(req.user.id)
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (error) return next(error)
    if (!data) return res.status(404).json({ error: 'Client not found' })
    res.json(clientFromDb(data))
  } catch (err) { next(err) }
})

// POST /clients — create or upsert (frontend uses upsert semantics today)
router.post('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id ?? await resolveAgencyId(req.user.id)
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const dbRow = clientToDb(req.body || {})
    Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
    dbRow.agency_id = agencyId

    const { data, error } = await supabaseAdmin
      .from('clients')
      .upsert(dbRow, { onConflict: 'id' })
      .select()
      .single()

    if (error) return next(error)
    res.json(clientFromDb(data))
  } catch (err) { next(err) }
})

// PATCH /clients/:id — partial update
router.patch('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id ?? await resolveAgencyId(req.user.id)
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    // Verify ownership before touching the row.
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('clients').select('id, agency_id').eq('id', req.params.id).maybeSingle()
    if (fetchErr) return next(fetchErr)
    if (!existing)                          return res.status(404).json({ error: 'Client not found' })
    if (existing.agency_id !== agencyId)    return res.status(403).json({ error: 'Forbidden' })

    const dbRow = clientToDb({ ...req.body, id: req.params.id })
    delete dbRow.id
    Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])

    const { data, error } = await supabaseAdmin
      .from('clients').update(dbRow).eq('id', req.params.id).select().single()

    if (error) return next(error)
    res.json(clientFromDb(data))
  } catch (err) { next(err) }
})

// DELETE /clients/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id ?? await resolveAgencyId(req.user.id)
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const { data: existing } = await supabaseAdmin
      .from('clients').select('id, agency_id').eq('id', req.params.id).maybeSingle()
    if (!existing)                       return res.status(404).json({ error: 'Client not found' })
    if (existing.agency_id !== agencyId) return res.status(403).json({ error: 'Forbidden' })

    const { error } = await supabaseAdmin
      .from('clients').delete().eq('id', req.params.id)
    if (error) return next(error)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
