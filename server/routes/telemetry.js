/**
 * server/routes/telemetry.js
 *
 * Backend proxy for Traccar and Flespi telematics APIs.
 * Keeps provider credentials (API keys / tokens) server-side only.
 *
 * Required env vars (Railway):
 *   TELEMETRY_PROVIDER     = 'traccar' | 'flespi' | 'mock'
 *   TRACCAR_URL            = https://your-traccar-host
 *   TRACCAR_EMAIL          = admin@example.com
 *   TRACCAR_PASSWORD       = xxxxxx
 *   FLESPI_TOKEN           = your_flespi_token
 *
 * Endpoints:
 *   GET  /telemetry/positions          — all device positions (fleet overview)
 *   GET  /telemetry/position/:deviceId — single device latest position
 *   GET  /telemetry/devices            — list of registered devices
 *   POST /telemetry/snapshot           — take a snapshot for a vehicle right now
 */

import { Router } from 'express'

const router = Router()

// Telemetry is disabled for v2 — will be re-enabled in v3
router.use((_req, res) => res.status(503).json({ error: 'Telemetry disabled in v2' }))

const PROVIDER  = process.env.TELEMETRY_PROVIDER || 'mock'
const TRACCAR   = {
  url:      process.env.TRACCAR_URL      || '',
  email:    process.env.TRACCAR_EMAIL    || '',
  password: process.env.TRACCAR_PASSWORD || '',
}
const FLESPI_TOKEN = process.env.FLESPI_TOKEN || ''

// ── Traccar helpers ────────────────────────────────────────
function traccarAuth() {
  return 'Basic ' + Buffer.from(`${TRACCAR.email}:${TRACCAR.password}`).toString('base64')
}

async function traccarFetch(path) {
  const res = await fetch(`${TRACCAR.url}/api${path}`, {
    headers: { Authorization: traccarAuth(), Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Traccar ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Flespi helpers ─────────────────────────────────────────
async function flespiGet(path) {
  const res = await fetch(`https://flespi.io${path}`, {
    headers: { Authorization: `FlespiToken ${FLESPI_TOKEN}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Flespi ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Mock helper ────────────────────────────────────────────
function mockPositions(deviceIds = []) {
  const seeds = deviceIds.length ? deviceIds : ['v1', 'v2', 'v3']
  return seeds.map((id, i) => {
    const h = id.split('').reduce((n, c) => n + c.charCodeAt(0), i * 31)
    return {
      deviceId:   id,
      lat:        31.63 + ((h % 100) / 100 - 0.5) * 1.6,
      lng:        -7.98 + ((h % 137) / 137 - 0.5) * 4.0,
      speed:      (h % 120),
      attributes: {
        totalDistance: (50000 + h * 100) * 1000,  // metres
        fuel:          20 + (h % 80),
        ignition:      h % 3 !== 0,
        dtcs:          h % 7 === 0 ? 'P0300' : '',
      },
      fixTime: new Date().toISOString(),
      provider: 'mock',
    }
  })
}

// ── GET /telemetry/positions ───────────────────────────────
router.get('/positions', async (req, res) => {
  try {
    let positions = []

    if (PROVIDER === 'traccar') {
      positions = await traccarFetch('/positions')

    } else if (PROVIDER === 'flespi') {
      // Get all devices, then latest message for each
      const devicesRes = await flespiGet('/gw/devices/all')
      const devices    = devicesRes.result || []
      const msgs = await Promise.all(
        devices.map(d =>
          flespiGet(`/gw/devices/${d.id}/messages?data={"from":0,"to":${Date.now()},"reverse":true,"count":1}`)
            .then(r => ({ deviceId: String(d.id), ident: d.configuration?.ident, msg: (r.result || [])[0] }))
            .catch(() => null)
        )
      )
      positions = msgs.filter(Boolean).map(({ deviceId, ident, msg }) => ({
        ...msg,
        deviceId,
        ident,
        provider: 'flespi',
      }))

    } else {
      // Mock — accept optional deviceIds query param
      const ids = req.query.ids ? String(req.query.ids).split(',') : []
      positions = mockPositions(ids)
    }

    res.json({ provider: PROVIDER, positions, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[Telemetry/positions]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── GET /telemetry/position/:deviceId ─────────────────────
router.get('/position/:deviceId', async (req, res) => {
  const { deviceId } = req.params
  try {
    let position = null

    if (PROVIDER === 'traccar') {
      const positions = await traccarFetch(`/positions?deviceId=${deviceId}`)
      position = positions[0] || null

    } else if (PROVIDER === 'flespi') {
      const r = await flespiGet(
        `/gw/devices/${deviceId}/messages?data={"reverse":true,"count":1}`
      )
      const msg = (r.result || [])[0]
      position  = msg ? { ...msg, deviceId, provider: 'flespi' } : null

    } else {
      position = mockPositions([deviceId])[0]
    }

    if (!position) return res.status(404).json({ error: 'No position found for device' })
    res.json({ provider: PROVIDER, position, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[Telemetry/position]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── GET /telemetry/devices ─────────────────────────────────
router.get('/devices', async (req, res) => {
  try {
    let devices = []

    if (PROVIDER === 'traccar') {
      devices = await traccarFetch('/devices')

    } else if (PROVIDER === 'flespi') {
      const r = await flespiGet('/gw/devices/all')
      devices = (r.result || []).map(d => ({
        id:   String(d.id),
        name: d.name || d.configuration?.ident || String(d.id),
        uniqueId: d.configuration?.ident || String(d.id),
      }))

    } else {
      devices = ['v1', 'v2', 'v3'].map(id => ({ id, name: `Vehicle ${id}`, uniqueId: id }))
    }

    res.json({ provider: PROVIDER, devices })
  } catch (err) {
    console.error('[Telemetry/devices]', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── POST /telemetry/snapshot ───────────────────────────────
// Body: { deviceId, vehicleId }
// Returns a normalized position snapshot to be stored by the frontend in localStorage
router.post('/snapshot', async (req, res) => {
  const { deviceId, vehicleId } = req.body
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' })

  try {
    let raw      = null
    let provider = PROVIDER

    if (PROVIDER === 'traccar') {
      const positions = await traccarFetch(`/positions?deviceId=${deviceId}`)
      raw = positions[0] || null

    } else if (PROVIDER === 'flespi') {
      const r = await flespiGet(
        `/gw/devices/${deviceId}/messages?data={"reverse":true,"count":1}`
      )
      raw = (r.result || [])[0] || null

    } else {
      raw = mockPositions([deviceId || vehicleId || 'v1'])[0]
      provider = 'mock'
    }

    if (!raw) return res.status(404).json({ error: 'No data from device' })

    res.json({
      provider,
      deviceId,
      vehicleId: vehicleId || null,
      raw,
      snapshotAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Telemetry/snapshot]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
