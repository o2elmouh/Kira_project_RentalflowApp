import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()
router.use(requireAuth)

// POST /contracts/:id/close — close a contract (server-side so RLS can't block it)
router.post('/:id/close', async (req, res, next) => {
  try {
    const { id } = req.params
    const { returnKm, returnFuelLevel, damages, extraFees } = req.body

    // Verify the contract belongs to the user's agency
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('agency_id')
      .eq('id', req.user.id)
      .single()

    const { data: contract, error: contractError } = await supabaseAdmin
      .from('contracts')
      .select('id, agency_id, vehicle_id, status')
      .eq('id', id)
      .single()

    if (contractError || !contract) return res.status(404).json({ error: 'Contract not found' })
    if (contract.agency_id !== profile.agency_id) return res.status(403).json({ error: 'Forbidden' })
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract is not active' })

    // Close contract + update vehicle status in a transaction-like sequence
    const [closeResult, vehicleResult] = await Promise.all([
      supabaseAdmin
        .from('contracts')
        .update({
          status: 'closed',
          return_km: returnKm,
          return_fuel_level: returnFuelLevel,
          damages: damages || null,
          extra_fees: extraFees || 0,
          closed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single(),

      supabaseAdmin
        .from('vehicles')
        .update({ status: 'available', mileage: returnKm })
        .eq('id', contract.vehicle_id),
    ])

    if (closeResult.error) return next(closeResult.error)
    res.json({ contract: closeResult.data })
  } catch (err) {
    next(err)
  }
})

// POST /contracts/:id/extend — extend contract end date
router.post('/:id/extend', async (req, res, next) => {
  try {
    const { id } = req.params
    const { newEndDate, dailyRate } = req.body

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('agency_id').eq('id', req.user.id).single()

    const { data: contract } = await supabaseAdmin
      .from('contracts').select('*').eq('id', id).single()

    if (!contract || contract.agency_id !== profile.agency_id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const oldEnd  = new Date(contract.end_date)
    const newEnd  = new Date(newEndDate)
    const extraDays = Math.round((newEnd - oldEnd) / 86400000)
    if (extraDays <= 0) return res.status(400).json({ error: 'New end date must be after current end date' })

    const extraAmount = extraDays * (dailyRate || contract.daily_rate)

    const { data, error } = await supabaseAdmin
      .from('contracts')
      .update({
        end_date: newEndDate,
        total_ttc: (contract.total_ttc || 0) + extraAmount,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return next(error)
    res.json({ contract: data, extraDays, extraAmount })
  } catch (err) {
    next(err)
  }
})

export default router
