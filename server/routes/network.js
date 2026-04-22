/**
 * RentalFlow Network — Cross-Agency Resource Sharing
 * Zero-Trust: every handler re-verifies agency ownership before acting.
 *
 * Routes:
 *   PATCH  /network/vehicles/:id/visibility  — toggle is_network_visible (admin only)
 *   GET    /network/search                   — masked search (mandatory params, max 20)
 *   POST   /network/requests                 — create PENDING request
 *   GET    /network/requests/incoming        — requests where I'm the owner
 *   GET    /network/requests/outgoing        — requests where I'm the requester
 *   PATCH  /network/requests/:id/status      — approve / reject / cancel (role-gated)
 *   GET    /network/requests/:id/reveal      — expanded DTO (only when APPROVED)
 */

import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()
router.use(requireAuth)

// ─────────────────────────────────────────────────────────────────────────────
// DTOs — strict field whitelists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MASKED DTO: returned in network search results.
 * Strips: agency identity, plate_number, vin, exact address, rental history.
 */
function toMaskedCarDTO(vehicle) {
  return {
    id:                   vehicle.id,
    brand:                vehicle.brand,
    model:                vehicle.model,
    year:                 vehicle.year,
    transmission:         vehicle.transmission,
    fuel_type:            vehicle.fuel_type,
    seats:                vehicle.seats,
    network_daily_price:  vehicle.network_daily_price,
    // General city only — no street address, no agency name
    city:                 vehicle.agency_city ?? null,
    status:               vehicle.status,
    image_url:            (vehicle.image_url ?? []).slice(0, 1), // first photo only
  }
}

/**
 * REVEALED DTO: returned ONLY after request reaches APPROVED status.
 * Adds: agency contact info, exact pickup address (city), license plate.
 * VIN is still withheld — unnecessary for physical handover.
 */
function toRevealedCarDTO(vehicle, owningAgency) {
  return {
    ...toMaskedCarDTO(vehicle),
    plate_number:         vehicle.plate_number,
    agency_name:          owningAgency.name,
    agency_phone:         owningAgency.phone   ?? null,
    agency_email:         owningAgency.email   ?? null,
    agency_city:          owningAgency.city    ?? null,
    agency_address:       owningAgency.address ?? null,
    // VIN intentionally omitted — not needed for handover
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve agency_id from the authenticated user (cached on req.user by requireAuth). */
async function resolveAgencyId(req) {
  if (req.user.agency_id) return req.user.agency_id
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('agency_id')
    .eq('id', req.user.id)
    .maybeSingle()
  return data?.agency_id ?? null
}

/**
 * Verify a vehicle belongs to the caller's agency.
 * Returns { vehicle } or calls next(err).
 */
async function assertVehicleOwner(vehicleId, agencyId) {
  const { data: v, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, agency_id, brand, model, year, transmission, fuel_type, seats, status, network_daily_price, is_network_visible, plate_number, image_url')
    .eq('id', vehicleId)
    .maybeSingle()
  if (error || !v) return { vehicle: null, err: 'Vehicle not found' }
  if (v.agency_id !== agencyId) return { vehicle: null, err: 'Forbidden' }
  return { vehicle: v }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /network/vehicles/:id/visibility
// Toggle network visibility + set inter-agency price. Admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/vehicles/:id/visibility', requireAdmin, async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { vehicle, err } = await assertVehicleOwner(req.params.id, agencyId)
    if (err) return res.status(err === 'Forbidden' ? 403 : 404).json({ error: err })

    const { is_network_visible, network_daily_price } = req.body
    if (typeof is_network_visible !== 'boolean') {
      return res.status(400).json({ error: 'is_network_visible (boolean) is required' })
    }
    if (is_network_visible && (network_daily_price == null || Number(network_daily_price) <= 0)) {
      return res.status(400).json({ error: 'network_daily_price is required when enabling visibility' })
    }

    const { data, error } = await supabaseAdmin
      .from('vehicles')
      .update({
        is_network_visible,
        network_daily_price: is_network_visible ? Number(network_daily_price) : null,
      })
      .eq('id', vehicle.id)
      .select('id, is_network_visible, network_daily_price')
      .single()

    if (error) return next(error)
    res.json({ vehicle: data })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /network/search
// Mandatory params: startDate, endDate. Optional: city, transmission.
// Result limit: 20. NEVER returns the caller's own vehicles.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { startDate, endDate, city, transmission } = req.query

    // Mandatory date params — prevent "browse all" queries
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' })
    }
    const start = new Date(startDate)
    const end   = new Date(endDate)
    if (isNaN(start) || isNaN(end) || end <= start) {
      return res.status(400).json({ error: 'Invalid date range' })
    }

    // 1. Find vehicle IDs blocked by an overlapping APPROVED request
    const { data: blocked } = await supabaseAdmin
      .from('cross_agency_requests')
      .select('vehicle_id')
      .in('status', ['PENDING', 'APPROVED'])
      .lt('start_date', endDate)
      .gt('end_date', startDate)

    const blockedIds = (blocked ?? []).map(r => r.vehicle_id)

    // 2. Build vehicle query
    let q = supabaseAdmin
      .from('vehicles')
      .select(`
        id, brand, model, year, transmission, fuel_type, seats,
        network_daily_price, status, image_url, plate_number,
        agencies!inner ( city )
      `)
      .eq('is_network_visible', true)
      .eq('status', 'available')
      .neq('agency_id', agencyId)    // ← core isolation: never own vehicles
      .limit(20)                      // ← scraping guard

    if (blockedIds.length > 0) {
      q = q.not('id', 'in', `(${blockedIds.join(',')})`)
    }
    if (city) {
      q = q.ilike('agencies.city', `%${city}%`)
    }
    if (transmission) {
      q = q.eq('transmission', transmission)
    }

    const { data: vehicles, error } = await q
    if (error) return next(error)

    // 3. Map to masked DTO — agency identity stripped
    const results = (vehicles ?? []).map(v => toMaskedCarDTO({
      ...v,
      agency_city: v.agencies?.city,
    }))

    res.json({ results, total: results.length })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /network/requests
// Agency A requests a car from Agency B. Creates PENDING request.
// End-customer PII is NEVER stored — strictly B2B.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/requests', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { vehicle_id, start_date, end_date, requester_notes } = req.body
    if (!vehicle_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'vehicle_id, start_date, end_date are required' })
    }

    // Verify target vehicle is actually on the network and available
    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, agency_id, is_network_visible, status, network_daily_price')
      .eq('id', vehicle_id)
      .maybeSingle()

    if (vErr || !vehicle) return res.status(404).json({ error: 'Vehicle not found' })
    if (vehicle.agency_id === agencyId) return res.status(400).json({ error: 'Cannot request your own vehicle' })
    if (!vehicle.is_network_visible) return res.status(400).json({ error: 'Vehicle is not on the network' })
    if (vehicle.status !== 'available') return res.status(409).json({ error: 'Vehicle is not available' })

    // Check date overlap with existing active requests
    const { data: overlap } = await supabaseAdmin
      .from('cross_agency_requests')
      .select('id')
      .eq('vehicle_id', vehicle_id)
      .in('status', ['PENDING', 'APPROVED'])
      .lt('start_date', end_date)
      .gt('end_date', start_date)
      .limit(1)

    if (overlap?.length > 0) {
      return res.status(409).json({ error: 'Vehicle has a conflicting reservation for those dates' })
    }

    const start  = new Date(start_date)
    const finish = new Date(end_date)
    const days   = Math.ceil((finish - start) / 86400000)
    const agreedPrice = vehicle.network_daily_price
      ? +(vehicle.network_daily_price * days).toFixed(2)
      : null

    const { data: request, error: rErr } = await supabaseAdmin
      .from('cross_agency_requests')
      .insert({
        requesting_agency_id: agencyId,
        owning_agency_id:     vehicle.agency_id,
        vehicle_id,
        status:               'PENDING',
        start_date,
        end_date,
        agreed_price:         agreedPrice,
        requester_notes:      requester_notes ?? null,
      })
      .select()
      .single()

    if (rErr) return next(rErr)
    res.status(201).json({ request })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /network/requests/incoming  — requests where I am the car owner
// GET /network/requests/outgoing  — requests I created
// ─────────────────────────────────────────────────────────────────────────────
router.get('/requests/incoming', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { data, error } = await supabaseAdmin
      .from('cross_agency_requests')
      .select('*, vehicles(brand, model, year, plate_number, transmission)')
      .eq('owning_agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) return next(error)

    // Strip requesting agency identity from the response — owner sees the car + dates only
    const sanitized = (data ?? []).map(r => ({
      id:              r.id,
      vehicle:         r.vehicles
        ? { brand: r.vehicles.brand, model: r.vehicles.model, year: r.vehicles.year }
        : null,
      status:          r.status,
      start_date:      r.start_date,
      end_date:        r.end_date,
      agreed_price:    r.agreed_price,
      requester_notes: r.requester_notes,
      owner_notes:     r.owner_notes,
      created_at:      r.created_at,
    }))

    res.json({ requests: sanitized })
  } catch (err) {
    next(err)
  }
})

router.get('/requests/outgoing', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { data, error } = await supabaseAdmin
      .from('cross_agency_requests')
      .select('*, vehicles(brand, model, year, transmission, fuel_type)')
      .eq('requesting_agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) return next(error)
    res.json({ requests: data ?? [] })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /network/requests/:id/status
// Allowed transitions:
//   Owner admin  → PENDING → APPROVED | REJECTED
//   Owner admin  → APPROVED → COMPLETED
//   Requester    → PENDING | APPROVED → CANCELLED
// ─────────────────────────────────────────────────────────────────────────────
const OWNER_TRANSITIONS = {
  PENDING:  ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED'],
}
const REQUESTER_TRANSITIONS = {
  PENDING:  ['CANCELLED'],
  APPROVED: ['CANCELLED'],
}

router.patch('/requests/:id/status', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { id } = req.params
    const { status: newStatus, owner_notes } = req.body
    if (!newStatus) return res.status(400).json({ error: 'status is required' })

    const { data: request, error: rErr } = await supabaseAdmin
      .from('cross_agency_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (rErr || !request) return res.status(404).json({ error: 'Request not found' })

    const isOwner     = request.owning_agency_id     === agencyId
    const isRequester = request.requesting_agency_id === agencyId

    if (!isOwner && !isRequester) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Validate transition
    const allowedForOwner     = OWNER_TRANSITIONS[request.status]     ?? []
    const allowedForRequester = REQUESTER_TRANSITIONS[request.status] ?? []
    const isValidOwnerMove     = isOwner && req.user.role === 'admin' && allowedForOwner.includes(newStatus)
    const isValidRequesterMove = isRequester && allowedForRequester.includes(newStatus)

    if (!isValidOwnerMove && !isValidRequesterMove) {
      return res.status(400).json({
        error: `Transition from ${request.status} → ${newStatus} is not allowed for your role`,
      })
    }

    const patch = { status: newStatus }
    if (owner_notes != null && isOwner) patch.owner_notes = owner_notes

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('cross_agency_requests')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (uErr) return next(uErr)

    // Sync vehicle status with the request lifecycle
    if (newStatus === 'APPROVED') {
      await supabaseAdmin
        .from('vehicles')
        .update({ status: 'rented' })
        .eq('id', request.vehicle_id)
    } else if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(newStatus)) {
      // Only revert if it was rented due to this request (status was APPROVED)
      if (['APPROVED', 'PENDING'].includes(request.status)) {
        await supabaseAdmin
          .from('vehicles')
          .update({ status: 'available' })
          .eq('id', request.vehicle_id)
      }
    }

    res.json({ request: updated })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /network/requests/:id/reveal
// Returns the REVEALED DTO only when status === APPROVED.
// Both parties can call this once approved — they each get what they need.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/requests/:id/reveal', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { data: request, error: rErr } = await supabaseAdmin
      .from('cross_agency_requests')
      .select(`
        *,
        vehicles (
          id, brand, model, year, transmission, fuel_type,
          seats, network_daily_price, plate_number, image_url, status
        )
      `)
      .eq('id', req.params.id)
      .maybeSingle()

    if (rErr || !request) return res.status(404).json({ error: 'Request not found' })

    // Only parties to this request may call this endpoint
    const isOwner     = request.owning_agency_id     === agencyId
    const isRequester = request.requesting_agency_id === agencyId
    if (!isOwner && !isRequester) return res.status(403).json({ error: 'Forbidden' })

    // Gate: only reveal on APPROVED or COMPLETED
    if (!['APPROVED', 'COMPLETED'].includes(request.status)) {
      return res.status(403).json({
        error: 'Details are only available once the request is approved',
        current_status: request.status,
      })
    }

    // Fetch owning agency public contact info
    const { data: owningAgency } = await supabaseAdmin
      .from('agencies')
      .select('name, city, phone, email, address')
      .eq('id', request.owning_agency_id)
      .maybeSingle()

    const revealedCar = toRevealedCarDTO(request.vehicles ?? {}, owningAgency ?? {})

    res.json({
      request: {
        id:           request.id,
        status:       request.status,
        start_date:   request.start_date,
        end_date:     request.end_date,
        agreed_price: request.agreed_price,
        owner_notes:  request.owner_notes,
      },
      vehicle: revealedCar,
      // Note: end-customer PII is never stored — no customer field here
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /network/requests/borrowed-fleet?startDate=&endDate=
// Returns APPROVED borrowed vehicles shaped for the New Rental vehicle picker.
// Daily rate = network_daily_price (inter-agency rate, not the owner's daily_rate).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/requests/borrowed-fleet', async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req)
    if (!agencyId) return res.status(403).json({ error: 'No agency associated with account' })

    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' })
    }

    const { data, error } = await supabaseAdmin
      .from('cross_agency_requests')
      .select(`
        id,
        start_date,
        end_date,
        agreed_price,
        vehicles (
          id, brand, model, year, plate_number, fuel_type,
          transmission, seats, color, network_daily_price,
          status, image_url
        )
      `)
      .eq('requesting_agency_id', agencyId)
      .eq('status', 'APPROVED')
      // Request window must overlap the queried rental window
      .lte('start_date', endDate)
      .gte('end_date', startDate)

    if (error) return next(error)

    const FUEL_MAP  = { gasoline: 'Essence', diesel: 'Diesel', electric: 'Électrique', hybrid: 'Hybride' }
    const TRANS_MAP = { manual: 'Manuelle', automatic: 'Automatique' }

    const vehicles = (data ?? [])
      .filter(r => r.vehicles)
      .map(r => ({
        // Shape matches vehicleFromDb output so RentalStep works unchanged
        id:           r.vehicles.id,
        make:         r.vehicles.brand,
        model:        r.vehicles.model,
        year:         r.vehicles.year,
        plate:        r.vehicles.plate_number,
        color:        r.vehicles.color ?? '—',
        fuelType:     FUEL_MAP[r.vehicles.fuel_type] || r.vehicles.fuel_type,
        transmission: TRANS_MAP[r.vehicles.transmission] || r.vehicles.transmission,
        seats:        r.vehicles.seats,
        dailyRate:    r.vehicles.network_daily_price ?? r.agreed_price ?? 0,
        depositAmount: 0,
        category:     'Network',
        image_url:    r.vehicles.image_url ?? [],
        status:       r.vehicles.status,
        // Extra metadata so the UI can badge it
        _isNetworkVehicle: true,
        _networkRequestId: r.id,
        _networkWindow:    { start: r.start_date, end: r.end_date },
      }))

    res.json({ vehicles })
  } catch (err) {
    next(err)
  }
})

export default router
