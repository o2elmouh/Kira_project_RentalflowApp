/**
 * pages/FleetMap.jsx
 *
 * Live GPS map of the fleet using react-leaflet.
 * - Green marker  = available vehicle
 * - Orange marker = rented vehicle
 * - Red marker    = maintenance / DTC alert
 *
 * Falls back to a "no device mapped" state for vehicles without a GPS device.
 */

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { getFleet, getContracts, getTelemetryConfig } from '../lib/db'
import { api } from '../lib/api.js'
import { normalize } from '../utils/telemetry.js'

// ── Fix Leaflet default icon broken by Vite bundler ──────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom colored dot markers ────────────────────────────────────────────────
function dotIcon(color, pulse = false) {
  const size  = 14
  const inner = pulse
    ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.4;animation:ping 1.2s cubic-bezier(0,0,.2,1) infinite"></span>`
    : ''
  const html = `
    <style>@keyframes ping{75%,100%{transform:scale(2);opacity:0}}</style>
    <div style="position:relative;width:${size}px;height:${size}px">
      ${inner}
      <div style="position:absolute;inset:0;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.7);box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>
    </div>`
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [7, 7], popupAnchor: [0, -10] })
}

const ICON_AVAILABLE   = dotIcon('#4ade80')
const ICON_RENTED      = dotIcon('#f59e0b', true)   // pulsing = in use
const ICON_MAINTENANCE = dotIcon('#f87171')

function markerIcon(status) {
  if (status === 'maintenance') return ICON_MAINTENANCE
  if (status === 'rented')      return ICON_RENTED
  return ICON_AVAILABLE
}

// ── Morocco center ────────────────────────────────────────────────────────────
const MOROCCO_CENTER = [31.79, -7.09]
const DEFAULT_ZOOM   = 6

// ── Fit bounds helper ─────────────────────────────────────────────────────────
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) { map.setView(points[0], 12); return }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, [points, map])
  return null
}

// ── VehicleData overlay card ──────────────────────────────────────────────────
function TelemetryBadge({ data }) {
  if (!data) return null
  return (
    <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
      <div>🛣 <b>{data.mileage?.toLocaleString() ?? '—'}</b> km</div>
      <div>⛽ <b>{data.fuel >= 0 ? `${Math.round(data.fuel)}%` : '—'}</b></div>
      <div>🔑 Moteur: <b>{data.engineOn ? 'ON' : 'OFF'}</b></div>
      {data.speed > 0 && <div>💨 <b>{Math.round(data.speed)}</b> km/h</div>}
      {data.dtcCodes?.length > 0 && (
        <div style={{ color: '#f87171', fontWeight: 700 }}>
          ⚠️ DTC: {data.dtcCodes.join(', ')}
        </div>
      )}
      <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>
        Mis à jour: {new Date(data.lastUpdate).toLocaleTimeString('fr-MA')}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FleetMap({ height = 520 }) {
  const [vehicles, setVehicles]     = useState([])
  const [positions, setPositions]   = useState({})  // vehicleId → VehicleData
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef(null)

  // Load fleet + active contracts to determine status
  useEffect(() => {
    (async () => {
      const fleet     = await getFleet()
      const contracts = await getContracts()
      const activeIds = new Set(contracts.filter(c => c.status === 'active').map(c => c.vehicleId))
      setVehicles(fleet.map(v => ({
        ...v,
        liveStatus: activeIds.has(v.id) ? 'rented' : v.status,
        activeContract: contracts.find(c => c.vehicleId === v.id && c.status === 'active') || null,
      })))
    })()
  }, [])

  // Only vehicles with a trackedDevice field are shown on the map
  const trackedVehicles   = vehicles.filter(v => v.trackedDevice)
  const untrackedCount    = vehicles.length - trackedVehicles.length

  // Fetch positions from backend
  const fetchPositions = async () => {
    setLoading(true)
    setError(null)
    try {
      const cfg       = await getTelemetryConfig()
      const mappings  = cfg.mappings || []
      // Use trackedDevice IDs directly from vehicle objects
      const ids = trackedVehicles.map(v => v.trackedDevice).filter(Boolean)
      const resp  = await api.getTelemetryPositions(ids)

      const map = {}
      ;(resp.positions || []).forEach(raw => {
        const rawDeviceId = String(raw.deviceId || raw.ident || '')
        // Match by trackedDevice field on the vehicle object
        const vehicle = trackedVehicles.find(v => v.trackedDevice === rawDeviceId)
        const vId     = vehicle?.id || mappings.find(m => m.deviceId === rawDeviceId)?.vehicleId
        if (!vId) return
        try {
          map[vId] = normalize(resp.provider, raw, { deviceId: rawDeviceId, vehicleId: vId })
        } catch { /* skip malformed */ }
      })
      setPositions(map)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh every 30s
  useEffect(() => {
    if (autoRefresh) {
      fetchPositions()
      intervalRef.current = setInterval(fetchPositions, 30_000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, vehicles.length])

  // Build points that have actual GPS coordinates (tracked only)
  const mappedVehicles = trackedVehicles.filter(v => positions[v.id]?.lat && positions[v.id]?.lng)
  const points         = mappedVehicles.map(v => [positions[v.id].lat, positions[v.id].lng])

  // Status legend counts (tracked only)
  const counts = trackedVehicles.reduce((acc, v) => {
    acc[v.liveStatus] = (acc[v.liveStatus] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={fetchPositions}
          disabled={loading}
          style={{
            background: 'var(--accent, #6366f1)', color: '#fff', border: 'none',
            borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Actualisation…' : '↻ Actualiser'}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            style={{ accentColor: 'var(--accent, #6366f1)' }}
          />
          Auto-refresh 30s
        </label>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', fontSize: 12 }}>
          {[
            { color: '#4ade80', label: `Disponible (${counts.available || 0})` },
            { color: '#f59e0b', label: `En location (${counts.rented || 0})` },
            { color: '#f87171', label: `Maintenance (${counts.maintenance || 0})` },
          ].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#3b1a1a', color: '#f87171', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          ⚠ {error}
        </div>
      )}

      {/* Map */}
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border, #2d3147)' }}>
        <MapContainer
          center={MOROCCO_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height, width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {points.length > 0 && <FitBounds points={points} />}

          {trackedVehicles.map(v => {
            const pos = positions[v.id]
            if (!pos?.lat || !pos?.lng) return null
            const contract = v.activeContract
            return (
              <Marker
                key={v.id}
                position={[pos.lat, pos.lng]}
                icon={markerIcon(v.liveStatus)}
              >
                <Popup minWidth={200}>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {v.make} {v.model} — {v.plate}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      background: v.liveStatus === 'rented' ? '#713f12' : v.liveStatus === 'maintenance' ? '#450a0a' : '#14532d',
                      color: v.liveStatus === 'rented' ? '#fbbf24' : v.liveStatus === 'maintenance' ? '#f87171' : '#4ade80',
                      marginBottom: 6,
                    }}>
                      {v.liveStatus === 'rented' ? 'En location' : v.liveStatus === 'maintenance' ? 'Maintenance' : 'Disponible'}
                    </div>
                    {contract && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                        Contrat {contract.contractNumber} — {contract.clientName}
                      </div>
                    )}
                    <TelemetryBadge data={pos} />
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* No positions yet */}
      {!loading && Object.keys(positions).length === 0 && trackedVehicles.length > 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 12 }}>
          Cliquez sur <b>Actualiser</b> pour charger les positions GPS.
        </div>
      )}

      {/* No tracked vehicles at all */}
      {trackedVehicles.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 12 }}>
          Aucun véhicule équipé d'un boîtier GPS. Activez le GPS dans la fiche véhicule.
        </div>
      )}

      {/* Untracked count notice */}
      {untrackedCount > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>
          {untrackedCount} véhicule{untrackedCount > 1 ? 's' : ''} sans GPS non affiché{untrackedCount > 1 ? 's' : ''} sur la carte.
        </div>
      )}
    </div>
  )
}
