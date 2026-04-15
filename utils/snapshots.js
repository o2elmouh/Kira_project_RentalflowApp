/**
 * utils/snapshots.js
 * Telemetry disabled for v2 — all exports are no-ops.
 */

export async function snapshotOnStart(_contract) { return null }
export async function snapshotOnEnd(_contract) { return { charges: [] } }
