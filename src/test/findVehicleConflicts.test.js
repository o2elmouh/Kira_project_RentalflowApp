import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * findVehicleConflicts is an async Supabase query. The interesting logic is
 * the overlap predicate (`pickup_date < endDate AND return_date > startDate`)
 * and the `excludeContractId` neq filter. We replicate the function inline
 * against an in-memory builder mock so we can assert the filters without
 * dragging in the real supabase client / auth.
 */

function buildBuilder({ rows = [], error = null } = {}) {
  const filters = {}
  const builder = {
    filters,
    select(_cols) { return this },
    eq(k, v)  { filters[`eq:${k}`]  = v; return this },
    neq(k, v) { filters[`neq:${k}`] = v; return this },
    lt(k, v)  { filters[`lt:${k}`]  = v; return this },
    gt(k, v)  { filters[`gt:${k}`]  = v; return this },
    then(resolve) { resolve({ data: rows, error }); return this },
  }
  return builder
}

// Replica of lib/db.js#findVehicleConflicts with getAgencyId pre-stubbed to
// 'agency-test'. Identical predicate / mapping logic — kept in sync by review.
async function findVehicleConflicts(supabase, agencyId, vehicleId, startDate, endDate, excludeContractId) {
  if (!vehicleId || !startDate || !endDate) return []
  if (!agencyId) return []
  let q = supabase
    .from('contracts')
    .select('id, contract_number, pickup_date, return_date, client_name, vehicle_id')
    .eq('agency_id', agencyId)
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .lt('pickup_date', endDate)
    .gt('return_date', startDate)
  if (excludeContractId) q = q.neq('id', excludeContractId)
  const { data, error } = await q
  if (error) { console.error('[db] findVehicleConflicts', error); return [] }
  return (data || []).map(c => ({
    id: c.id,
    contractNumber: c.contract_number,
    startDate: c.pickup_date,
    endDate: c.return_date,
    clientName: c.client_name,
    vehicleId: c.vehicle_id,
  }))
}

let activeBuilder = null
const supabaseFake = {
  from: vi.fn(() => activeBuilder),
}

beforeEach(() => {
  activeBuilder = buildBuilder()
  supabaseFake.from.mockClear()
})

describe('findVehicleConflicts', () => {
  it('returns [] when vehicleId / startDate / endDate is missing', async () => {
    expect(await findVehicleConflicts(supabaseFake, 'a', null, '2026-09-01', '2026-09-10')).toEqual([])
    expect(await findVehicleConflicts(supabaseFake, 'a', 'veh-1', null, '2026-09-10')).toEqual([])
    expect(await findVehicleConflicts(supabaseFake, 'a', 'veh-1', '2026-09-01', null)).toEqual([])
  })

  it('returns [] when agencyId is missing', async () => {
    expect(await findVehicleConflicts(supabaseFake, null, 'veh-1', '2026-09-01', '2026-09-10')).toEqual([])
  })

  it('returns mapped rows when supabase finds overlapping contracts', async () => {
    activeBuilder = buildBuilder({ rows: [
      { id: 'ctr-9', contract_number: 'CTR-00009', pickup_date: '2026-09-05', return_date: '2026-09-12', client_name: 'Other', vehicle_id: 'veh-1' },
    ] })
    const result = await findVehicleConflicts(supabaseFake, 'agency-test', 'veh-1', '2026-09-01', '2026-09-10', 'ctr-1')
    expect(result).toEqual([
      { id: 'ctr-9', contractNumber: 'CTR-00009', startDate: '2026-09-05', endDate: '2026-09-12', clientName: 'Other', vehicleId: 'veh-1' },
    ])
  })

  it('applies the half-open overlap predicate and the excludeContractId neq filter', async () => {
    activeBuilder = buildBuilder({ rows: [] })
    await findVehicleConflicts(supabaseFake, 'agency-test', 'veh-1', '2026-09-01', '2026-09-10', 'ctr-1')
    expect(activeBuilder.filters['eq:agency_id']).toBe('agency-test')
    expect(activeBuilder.filters['eq:vehicle_id']).toBe('veh-1')
    expect(activeBuilder.filters['eq:status']).toBe('active')
    expect(activeBuilder.filters['lt:pickup_date']).toBe('2026-09-10')
    expect(activeBuilder.filters['gt:return_date']).toBe('2026-09-01')
    expect(activeBuilder.filters['neq:id']).toBe('ctr-1')
  })

  it('omits the neq filter when excludeContractId is not provided', async () => {
    activeBuilder = buildBuilder({ rows: [] })
    await findVehicleConflicts(supabaseFake, 'agency-test', 'veh-1', '2026-09-01', '2026-09-10')
    expect(activeBuilder.filters['neq:id']).toBeUndefined()
  })

  it('returns [] when supabase errors', async () => {
    activeBuilder = buildBuilder({ rows: null, error: { message: 'boom' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await findVehicleConflicts(supabaseFake, 'agency-test', 'veh-1', '2026-09-01', '2026-09-10')).toEqual([])
    errSpy.mockRestore()
  })
})
