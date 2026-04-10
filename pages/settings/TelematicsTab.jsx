import { useState, useEffect } from 'react'
import { Radio, Plus, Trash2 } from 'lucide-react'
import { getFleet, getTelemetryConfig, saveTelemetryConfig } from '../../lib/db'

export default function TelematicsTab() {
  const [cfg, setCfg]     = useState(null)
  const [fleet, setFleet] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      const telCfg = await getTelemetryConfig()
      setCfg(telCfg)
      const fleetData = await getFleet()
      setFleet(fleetData)
    })()
  }, [])

  const setProvider = (p) => setCfg(c => c ? { ...c, provider: p } : { provider: p, mappings: [] })

  const setMapping = (idx, field, value) =>
    setCfg(c => {
      if (!c) return null
      const mappings = [...(c.mappings || [])]
      mappings[idx] = { ...mappings[idx], [field]: value }
      return { ...c, mappings }
    })

  const addMapping = () =>
    setCfg(c => {
      if (!c) return { provider: 'mock', mappings: [{ vehicleId: '', deviceId: '' }] }
      return { ...c, mappings: [...(c.mappings || []), { vehicleId: '', deviceId: '' }] }
    })

  const removeMapping = (idx) =>
    setCfg(c => {
      if (!c) return null
      return { ...c, mappings: (c.mappings || []).filter((_, i) => i !== idx) }
    })

  const save = async () => {
    await saveTelemetryConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const s = {
    input: {
      background: 'var(--bg-tertiary, #252a3a)', border: '1px solid var(--border)',
      borderRadius: 6, color: 'var(--text1)', padding: '7px 10px', fontSize: 13,
      width: '100%', boxSizing: 'border-box',
    },
    select: {
      background: 'var(--bg-tertiary, #252a3a)', border: '1px solid var(--border)',
      borderRadius: 6, color: 'var(--text1)', padding: '7px 10px', fontSize: 13,
      width: '100%', boxSizing: 'border-box',
    },
    label: { fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4, fontWeight: 600 },
    card:  { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 20 },
  }

  // Tracked vehicles (those with trackedDevice set in fleet)
  const trackedInFleet = fleet.filter(v => v.trackedDevice)

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Provider */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Radio size={15} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Fournisseur télématique</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['mock', 'traccar', 'flespi'].map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                padding: '7px 18px', borderRadius: 6, border: '1px solid var(--border)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: cfg?.provider === p ? 'var(--accent)' : 'transparent',
                color: cfg?.provider === p ? '#fff' : 'var(--text2)',
              }}
            >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
        {cfg?.provider === 'mock' && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 12px' }}>
            Mode démo — positions GPS simulées. Aucune clé API requise.
          </div>
        )}
        {cfg?.provider === 'traccar' && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
            Configurez <b>TRACCAR_URL</b>, <b>TRACCAR_EMAIL</b> et <b>TRACCAR_PASSWORD</b> dans les variables Railway.
          </div>
        )}
        {cfg?.provider === 'flespi' && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
            Configurez <b>FLESPI_TOKEN</b> dans les variables Railway.
          </div>
        )}
      </div>

      {/* Vehicle ↔ Device mappings */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Association véhicule ↔ boîtier</span>
          <button
            onClick={addMapping}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={13} /> Ajouter
          </button>
        </div>

        {/* Auto-detected from fleet */}
        {trackedInFleet.length > 0 && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Boîtiers définis dans les fiches véhicule ({trackedInFleet.length})
            </div>
            {trackedInFleet.map(v => (
              <div key={v.id} style={{ display: 'flex', gap: 8, color: 'var(--text3)', marginBottom: 3 }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{v.trackedDevice}</span>
                <span>→ {v.make} {v.model} {v.year}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, color: 'var(--text3)', fontStyle: 'italic' }}>
              Ces associations sont lues automatiquement. Les entrées manuelles ci-dessous servent de complément.
            </div>
          </div>
        )}

        {(!cfg?.mappings || cfg.mappings.length === 0) ? (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>
            Aucune association manuelle. Utilisez le champ "ID boîtier" dans la fiche véhicule, ou ajoutez une entrée ici.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <span style={s.label}>Véhicule</span>
              <span style={s.label}>ID boîtier (deviceId)</span>
              <span />
            </div>
            {cfg?.mappings?.map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                <select
                  style={s.select}
                  value={m.vehicleId}
                  onChange={e => setMapping(i, 'vehicleId', e.target.value)}
                >
                  <option value="">— Choisir véhicule —</option>
                  {fleet.map(v => (
                    <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} — {v.plate}</option>
                  ))}
                </select>
                <input
                  style={s.input}
                  placeholder="ex: device-001"
                  value={m.deviceId}
                  onChange={e => setMapping(i, 'deviceId', e.target.value)}
                />
                <button
                  onClick={() => removeMapping(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={save}
        style={{ background: saved ? '#166534' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        {saved ? '✓ Sauvegardé' : 'Enregistrer'}
      </button>
    </div>
  )
}
