/**
 * utils/telemetry.js — Adapter pattern for GPS/telematics providers.
 *
 * Normalizes raw API responses from Traccar or Flespi into a single
 * VehicleData shape used throughout the app.
 *
 * VehicleData {
 *   deviceId:      string   — provider device ID
 *   vehicleId:     string   — RentaFlow rf_fleet vehicle ID (if mapped)
 *   lat:           number
 *   lng:           number
 *   speed:         number   — km/h
 *   mileage:       number   — total odometer in km
 *   fuel:          number   — fuel level 0–100 (%)
 *   engineOn:      boolean
 *   ignition:      boolean
 *   dtcCodes:      string[] — OBD trouble codes e.g. ['P0300']
 *   lastUpdate:    string   — ISO timestamp
 *   provider:      'traccar'|'flespi'|'mock'
 * }
 */

// ── Traccar adapter ──────────────────────────────────────────────────────────
// Traccar REST: GET /api/positions?deviceId=X  →  array of position objects
// Traccar REST: GET /api/devices               →  array of device objects

function normalizeTraccar(position, device = {}) {
  const attrs = position.attributes || {}
  return {
    deviceId: String(position.deviceId || device.id || ''),
    vehicleId: device.uniqueId || null,          // store plate / rf vehicleId as uniqueId
    lat: Number(position.latitude ?? 0),
    lng: Number(position.longitude ?? 0),
    speed: Number(position.speed ?? 0),
    mileage: Number(attrs.totalDistance != null
      ? Math.round(attrs.totalDistance / 1000)
      : (attrs.odometer ? Math.round(attrs.odometer / 1000) : 0)),
    fuel: Number(attrs.fuel ?? attrs.fuelLevel ?? -1),
    engineOn: Boolean(attrs.ignition ?? false),
    ignition: Boolean(attrs.ignition ?? false),
    dtcCodes: parseDtc(attrs.dtcs || attrs.obdDtcs || ''),
    lastUpdate: position.fixTime || position.deviceTime || new Date().toISOString(),
    provider: 'traccar',
    raw: { position, device },
  }
}

// ── Flespi adapter ───────────────────────────────────────────────────────────
// Flespi REST: GET /gw/devices/{id}/messages  →  { result: [message, ...] }
// Most recent message = messages[messages.length - 1]

function normalizeFlespi(message, deviceId = '') {
  const pos = message['position.latitude'] !== undefined ? {
    lat: message['position.latitude'],
    lng: message['position.longitude'],
  } : { lat: 0, lng: 0 }

  // Flespi uses snake_case top-level keys for parameters
  const fuelRaw = message['can.fuel.level']
    ?? message['fuel.level']
    ?? message['engine.fuel.level']
    ?? -1

  const mileageRaw = message['can.mileage']
    ?? message['vehicle.mileage']
    ?? message['position.odometer']
    ?? 0

  const dtcRaw = message['can.dtc.faults']
    ?? message['obd.dtc.codes']
    ?? ''

  return {
    deviceId: String(deviceId),
    vehicleId: message['ident'] || null,
    lat: Number(pos.lat),
    lng: Number(pos.lng),
    speed: Number(message['position.speed'] ?? 0),
    mileage: Number(mileageRaw),
    fuel: Number(fuelRaw),
    engineOn: Boolean(message['engine.ignition.status'] ?? message['can.engine.ignition'] ?? false),
    ignition: Boolean(message['engine.ignition.status'] ?? false),
    dtcCodes: parseDtc(dtcRaw),
    lastUpdate: message['timestamp']
      ? new Date(message['timestamp'] * 1000).toISOString()
      : new Date().toISOString(),
    provider: 'flespi',
    raw: message,
  }
}

// ── Mock adapter (dev / demo mode) ───────────────────────────────────────────
export function mockVehicleData(vehicleId, overrides = {}) {
  // Seed random but deterministic values from vehicleId
  const seed = vehicleId.split('').reduce((n, c) => n + c.charCodeAt(0), 0)
  const rand = (min, max) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min)
  return {
    deviceId: `mock-${vehicleId}`,
    vehicleId,
    lat: 31.63 + (rand(-1, 1) * 0.8),   // Morocco bounding box
    lng: -7.98 + (rand(-1, 1) * 2.0),
    speed: Math.round(rand(0, 120)),
    mileage: Math.round(rand(5000, 120000)),
    fuel: Math.round(rand(10, 100)),
    engineOn: rand(0, 1) > 0.4,
    ignition: rand(0, 1) > 0.4,
    dtcCodes: rand(0, 1) > 0.85 ? ['P0300'] : [],
    lastUpdate: new Date().toISOString(),
    provider: 'mock',
    ...overrides,
  }
}

// ── Main normalize entry-point ────────────────────────────────────────────────
/**
 * normalize(provider, rawData, meta)
 * @param {'traccar'|'flespi'|'mock'} provider
 * @param {object} rawData  — raw API response object
 * @param {object} meta     — extra context (device object for traccar, deviceId string for flespi)
 * @returns {VehicleData}
 */
export function normalize(provider, rawData, meta = {}) {
  switch (provider) {
    case 'traccar': return normalizeTraccar(rawData, meta.device || {})
    case 'flespi': return normalizeFlespi(rawData, meta.deviceId || '')
    case 'mock': return mockVehicleData(meta.vehicleId || 'unknown', rawData)
    default: throw new Error(`Unknown telematics provider: "${provider}"`)
  }
}

// ── DTC helpers ───────────────────────────────────────────────────────────────
function parseDtc(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  // Comma/space-separated string
  return String(raw).split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
}

export function dtcSeverity(code) {
  if (!code) return 'info'
  const prefix = code.charAt(0).toUpperCase()
  if (prefix === 'P') return 'engine'   // Powertrain — most critical
  if (prefix === 'C') return 'chassis'
  if (prefix === 'B') return 'body'
  if (prefix === 'U') return 'network'
  return 'unknown'
}

export function hasCriticalDtc(dtcCodes = []) {
  // Any P-code (powertrain) is considered critical → triggers maintenance flag
  return dtcCodes.some(c => /^P/i.test(c))
}

// ── Delta calculator (used at contract end) ───────────────────────────────────
/**
 * computeDeltas(startSnapshot, endSnapshot, contract)
 * Returns charges to add to the pending invoice.
 *
 * @param {{ mileage, fuel }} startSnapshot
 * @param {{ mileage, fuel }} endSnapshot
 * @param {{ maxKmEnabled, dailyRate, days, allowedKm }} contract
 * @returns {{ mileageDelta, fuelDelta, charges: [{ reason, amount }] }}
 */
export function computeDeltas(startSnapshot, endSnapshot, contract = {}) {
  const mileageDelta = Math.max(0, (endSnapshot.mileage ?? 0) - (startSnapshot.mileage ?? 0))
  const fuelDelta = (startSnapshot.fuel ?? 0) - (endSnapshot.fuel ?? 0)  // positive = consumed

  const charges = []

  // Excess mileage
  if (contract.maxKmEnabled) {
    const allowedKm = contract.allowedKm ?? (contract.days ?? 1) * 300
    const excessKm = Math.max(0, mileageDelta - allowedKm)
    const ratePerKm = contract.extraKmRate ?? 1.5  // MAD/km default
    if (excessKm > 0) {
      charges.push({
        reason: `Kilométrage excessif (+${excessKm} km)`,
        amount: Math.round(excessKm * ratePerKm),
        type: 'excess_mileage',
        detail: { mileageDelta, allowedKm, excessKm, ratePerKm },
      })
    }
  }

  // Fuel refill charge (if fuel dropped more than 5% — tolerance for sensor noise)
  if (fuelDelta > 5) {
    const tankLitres = contract.tankLitres ?? 50  // default tank size
    const pricePerLitre = contract.fuelPrice ?? 14   // MAD/L Morocco
    const litresNeeded = Math.round((fuelDelta / 100) * tankLitres)
    const refillCost = Math.round(litresNeeded * pricePerLitre)
    charges.push({
      reason: `Carburant manquant (${fuelDelta.toFixed(1)}% → ~${litresNeeded}L)`,
      amount: refillCost,
      type: 'refueling',
      detail: { fuelDelta, litresNeeded, pricePerLitre },
    })
  }

  return { mileageDelta, fuelDelta, charges }
}
