/**
 * utils/snapshots.js
 *
 * Client-side contract snapshot trigger.
 * Replaces the "Supabase Edge Function" approach — runs in the browser,
 * calls the Railway /telemetry/snapshot endpoint, stores results in localStorage.
 *
 * Usage:
 *   import { snapshotOnStart, snapshotOnEnd } from '../utils/snapshots'
 *
 *   // When a contract goes active:
 *   await snapshotOnStart(contract)
 *
 *   // When a contract is returned:
 *   const { charges } = await snapshotOnEnd(contract)
 *   // charges → array of { reason, amount, type } to add to invoice
 */

// ── Telemetry disabled for v2 — will be re-enabled in v3 ─────────────────────
const TELEMETRY_ENABLED = false

import { api } from '../lib/api.js'
import {
  getVehicle, saveVehicle,
  saveSnapshot, getSnapshotsForContract,
  getDeviceForVehicle, updateContract,
} from '../lib/db.js'
import { normalize, computeDeltas, hasCriticalDtc } from './telemetry.js'

// ── Internal: fetch telemetry from backend and normalize ─────────────────────
async function fetchAndNormalize(vehicleId) {
  const deviceId = await getDeviceForVehicle(vehicleId)

  // Always call the backend — in 'mock' mode it returns synthetic data
  const result = await api.takeSnapshot({ deviceId: deviceId || vehicleId, vehicleId })
  const { provider, raw } = result

  return normalize(provider, raw, { deviceId: deviceId || vehicleId, vehicleId })
}

// ── snapshotOnStart ──────────────────────────────────────────────────────────
/**
 * Called when a contract's status transitions to 'active'.
 * Fetches current vehicle telemetry and saves a 'start' snapshot.
 *
 * @param {object} contract — full contract object from localStorage
 * @returns {object} saved snapshot
 */
export async function snapshotOnStart(contract) {
  if (!TELEMETRY_ENABLED) return null
  try {
    const data = await fetchAndNormalize(contract.vehicleId)

    const snapshot = saveSnapshot({
      contractId: contract.id,
      vehicleId:  contract.vehicleId,
      phase:      'start',
      mileage:    data.mileage,
      fuel:       data.fuel,
      lat:        data.lat,
      lng:        data.lng,
      engineOn:   data.engineOn,
      dtcCodes:   data.dtcCodes,
      provider:   data.provider,
    })

    // If there are DTC codes at start, flag vehicle now
    if (hasCriticalDtc(data.dtcCodes)) {
      await _flagMaintenance(contract.vehicleId, data.dtcCodes)
    }

    console.log(`[Snapshot] START — contract ${contract.contractNumber}, mileage: ${data.mileage} km, fuel: ${data.fuel}%`)
    return snapshot
  } catch (err) {
    console.warn('[Snapshot] START failed (continuing without telemetry):', err.message)
    return null
  }
}

// ── snapshotOnEnd ────────────────────────────────────────────────────────────
/**
 * Called when a contract's status transitions to 'closed' / 'returned'.
 * Fetches current telemetry, computes deltas vs the start snapshot,
 * flags maintenance if DTC codes present, returns auto-charges.
 *
 * @param {object} contract — full contract object (with days, dailyRate, maxKmEnabled, etc.)
 * @returns {{ snapshot, charges: Array<{reason,amount,type}>, dtcCodes }}
 */
export async function snapshotOnEnd(contract) {
  if (!TELEMETRY_ENABLED) return { charges: [] }
  try {
    const data = await fetchAndNormalize(contract.vehicleId)

    const snapshot = saveSnapshot({
      contractId: contract.id,
      vehicleId:  contract.vehicleId,
      phase:      'end',
      mileage:    data.mileage,
      fuel:       data.fuel,
      lat:        data.lat,
      lng:        data.lng,
      engineOn:   data.engineOn,
      dtcCodes:   data.dtcCodes,
      provider:   data.provider,
    })

    // Persist end-snapshot data onto the contract for reference
    await updateContract(contract.id, {
      telemetryEnd: {
        mileage:  data.mileage,
        fuel:     data.fuel,
        takenAt:  snapshot.takenAt,
      },
    })

    // Find the matching start snapshot
    const allSnaps    = getSnapshotsForContract(contract.id)
    const startSnap   = allSnaps.find(s => s.phase === 'start')
    let   charges     = []

    if (startSnap) {
      const result = computeDeltas(startSnap, snapshot, contract)
      charges = result.charges

      // Persist deltas onto contract
      await updateContract(contract.id, {
        telemetryMileageDelta: result.mileageDelta,
        telemetryFuelDelta:    result.fuelDelta,
      })
    }

    // DTC / engine light check
    if (hasCriticalDtc(data.dtcCodes)) {
      await _flagMaintenance(contract.vehicleId, data.dtcCodes)
      console.warn(`[Snapshot] END — DTC codes detected: ${data.dtcCodes.join(', ')}. Vehicle flagged for maintenance.`)
    }

    console.log(`[Snapshot] END — contract ${contract.contractNumber}, charges: ${charges.length}`)
    return { snapshot, charges, dtcCodes: data.dtcCodes }
  } catch (err) {
    console.warn('[Snapshot] END failed (continuing without telemetry):', err.message)
    return { snapshot: null, charges: [], dtcCodes: [] }
  }
}

// ── Internal: flag vehicle for maintenance ───────────────────────────────────
async function _flagMaintenance(vehicleId, dtcCodes) {
  const vehicle = await getVehicle(vehicleId)
  if (!vehicle) return
  await saveVehicle({
    ...vehicle,
    status:        'maintenance',
    dtcCodes,
    dtcDetectedAt: new Date().toISOString(),
    maintenanceReason: `DTC automatique: ${dtcCodes.join(', ')}`,
  })
  console.warn(`[Telematics] Vehicle ${vehicleId} flagged → maintenance (${dtcCodes.join(', ')})`)
}
