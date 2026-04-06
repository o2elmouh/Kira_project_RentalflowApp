import { useState, useEffect } from 'react'
import { Edit2 } from 'lucide-react'
import { getFleetConfig, saveFleetConfig, resetFleetConfig } from '../../lib/db'

const FLEET_CONFIG_COLS = [
  { key: 'make',             label: 'Marque',                     type: 'text' },
  { key: 'warrantyGeneral',  label: 'Garantie générale',          type: 'text' },
  { key: 'warrantyYears',    label: 'Durée (ans)',                type: 'number' },
  { key: 'warrantyBattery',  label: 'Garantie batterie',          type: 'text' },
  { key: 'controlTechYears', label: 'Contrôle technique (ans)',   type: 'number' },
  { key: 'vidangeKm',        label: 'Vidange (km)',               type: 'number' },
  { key: 'courroieKm',       label: 'Courroie distribution (km)', type: 'number' },
  { key: 'extension',        label: 'Extension possible',         type: 'text' },
]

export default function FleetConfigTab() {
  const [config, setConfig] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [editData, setEditData] = useState({})
  const [savedRow, setSavedRow] = useState(null)

  useEffect(() => {
    let cancelled = false
    getFleetConfig()
      .then(data => {
        if (cancelled) return
        setConfig(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('[Settings] getFleetConfig', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const startEditRow = (i) => {
    setEditRow(i)
    setEditData({ ...config[i] })
  }

  const saveRow = async (i) => {
    const updated = config.map((r, idx) => idx === i ? { ...editData } : r)
    setConfig(updated)
    try {
      await saveFleetConfig(updated)
      setEditRow(null)
      setSavedRow(i)
      setTimeout(() => setSavedRow(null), 1500)
    } catch (err) {
      console.error('[Settings] saveFleetConfig', err)
      setEditRow(null)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser la configuration parc aux valeurs par défaut ?')) return
    const defaults = await resetFleetConfig()
    setConfig(defaults || [])
    setEditRow(null)
  }

  if (loading) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</p>

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Configuration parc</h3>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleReset}>
          Réinitialiser les valeurs par défaut
        </button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              {FLEET_CONFIG_COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
              <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.map((row, i) => {
              const isEditing = editRow === i
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg2)' : undefined }}>
                  {FLEET_CONFIG_COLS.map(col => (
                    <td key={col.key} style={{ padding: '8px 12px' }}>
                      {isEditing ? (
                        col.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!editData[col.key]}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: e.target.checked }))}
                          />
                        ) : (
                          <input
                            className="form-input"
                            type={col.type === 'number' ? 'number' : 'text'}
                            style={{ padding: '4px 8px', fontSize: 12, width: col.type === 'number' ? 80 : 140 }}
                            value={editData[col.key] ?? ''}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: col.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          />
                        )
                      ) : (
                        col.type === 'boolean'
                          ? (row[col.key] ? '✓' : '✗')
                          : (row[col.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRow(i)}>Sauvegarder</button>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditRow(null)}>Annuler</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => startEditRow(i)}>
                          <Edit2 size={13} /> Modifier
                        </button>
                        {savedRow === i && <span className="badge badge-green" style={{ fontSize: 11 }}>Enregistré</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
