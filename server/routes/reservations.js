/**
 * Reservations API
 *
 *   GET    /reservations         — list with filters/sort/pagination
 *   GET    /reservations/:id     — single reservation (with client + vehicle joined)
 *   POST   /reservations         — create (called from NewRental wizard or website)
 *   PATCH  /reservations/:id     — partial update (status changes, edits)
 *
 * All endpoints are agency-scoped via RLS + an explicit `.eq('agency_id', …)`
 * (defense-in-depth: RLS protects against bypass; explicit filter protects
 *  against accidental cross-agency reads if a service-role token is used).
 */

import { Router } from 'express'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { applyReservationFilters } from '../lib/reservationFilters.js'

const router = Router()

// All reservation routes require an authenticated user
router.use(requireAuth)

/**
 * GET /reservations
 * List reservations for the caller's agency with filters/sort/pagination.
 *
 * Returns:
 *   {
 *     data:     Reservation[],
 *     page:     number,
 *     pageSize: number,
 *     total:    number   // grand total matching filters (for pagination UI)
 *   }
 */
router.get('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    // count: 'exact' returns total rows matching the filters (excluding range)
    let query = supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId)

    const built = applyReservationFilters(query, req.query)

    const { data, count, error } = await built.query
    if (error) throw error

    res.json({
      data:     data || [],
      page:     built.page,
      pageSize: built.pageSize,
      total:    count || 0,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /reservations/:id
 * Fetch a single reservation with its client and vehicle joined,
 * for the side-panel detail view.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*, clients(*), vehicles(*)')
      .eq('id', req.params.id)
      .eq('agency_id', agencyId)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })

    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /reservations
 * Create a reservation. Called from the NewRental wizard
 * (IN_PERSON / EMAIL / WHATSAPP) or from the public website endpoint (WEBSITE).
 *
 * Body must include at minimum: customer_name, customer_contact, car_model,
 * start_date, end_date, total_price, source_channel.
 */
router.post('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' })

    const payload = {
      ...req.body,
      agency_id:  agencyId,
      created_by: req.user.id,
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /reservations/:id
 * Partial update — typically used for status transitions (PENDING → CONFIRMED)
 * or for filling in missing fields on a website-direct booking.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id

    // Strip fields that should never be client-mutable
    const { id, agency_id, created_at, created_by, ...patch } = req.body

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update(patch)
      .eq('id', req.params.id)
      .eq('agency_id', agencyId)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })

    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
