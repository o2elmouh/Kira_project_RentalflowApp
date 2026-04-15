/**
 * utils/telemetry.js
 * Telemetry disabled for v2 — all exports are no-ops/stubs.
 */

export function normalize() { return {} }
export function computeDeltas() { return { charges: [], mileageDelta: 0, fuelDelta: 0 } }
export function hasCriticalDtc() { return false }
