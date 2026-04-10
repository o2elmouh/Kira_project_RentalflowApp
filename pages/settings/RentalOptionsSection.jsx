import { useState, useEffect } from 'react'
import { DEFAULT_RENTAL_OPTIONS } from '../../utils/rentalOptions'
import { getGeneralConfig, saveGeneralConfig } from '../../lib/db'

export default function RentalOptionsSection() {
  const [options, setOptions] = useState(DEFAULT_RENTAL_OPTIONS)

  useEffect(() => {
    (async () => {
      const cfg = await getGeneralConfig()
      setOptions(cfg.rentalOptions && cfg.rentalOptions.length > 0 ? cfg.rentalOptions : DEFAULT_RENTAL_OPTIONS)
    })()
  }, [])
  const [saved, setSaved] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const PROTECTED = ['cdw', 'pai']

  const update = (id, field, value) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o))
    setSaved(false)
  }

  const addOption = () => {
    const newId = 'opt_' + Date.now()
    setOptions(prev => [...prev, { id: newId, name: '', pricingType: 'per_day', price: 0, enabled: true }])
  }

  const removeOption = (id) => {
    setOptions(prev => prev.filter(o => o.id !== id))
  }

  const save = async () => {
    const cfg = await getGeneralConfig()
    await saveGeneralConfig({ ...cfg, rentalOptions: options })
    setSaved(true)
    setEditMode(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card" style={{ maxWidth: 780 }}>
      <div className="card-header">
        <h3>Options de location</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span className="badge badge-green">Enregistré</span>}
          {!editMode && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Modifier</button>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map(opt => (
            <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: `36px 1fr 130px 90px${editMode && !PROTECTED.includes(opt.id) ? ' 36px' : ''}`, gap: 8, alignItems: 'center', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              <input
                type="checkbox"
                checked={opt.enabled}
                onChange={e => update(opt.id, 'enabled', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <input
                className="form-input"
                style={{ fontSize: 13, padding: '5px 8px', minWidth: 0 }}
                value={opt.name}
                placeholder="Nom de l'option"
                readOnly={!editMode}
                onChange={e => update(opt.id, 'name', e.target.value)}
              />
              <select
                className="form-select"
                style={{ fontSize: 12, padding: '5px 8px' }}
                value={opt.pricingType}
                disabled={!editMode}
                onChange={e => update(opt.id, 'pricingType', e.target.value)}
              >
                <option value="per_day">Par jour</option>
                <option value="fixed">Fixe</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <input
                  className="form-input text-mono"
                  style={{ fontSize: 13, padding: '5px 8px', width: 0, flex: 1, minWidth: 0 }}
                  type="number"
                  min="0"
                  readOnly={!editMode}
                  value={opt.price}
                  onChange={e => update(opt.id, 'price', Number(e.target.value))}
                />
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>MAD</span>
              </div>
              {editMode && !PROTECTED.includes(opt.id) && (
                <button
                  onClick={() => removeOption(opt.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#ef4444', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Supprimer"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
        {editMode && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={addOption}>
              + Ajouter une option
            </button>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>
              Enregistrer
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => { setOptions(DEFAULT_RENTAL_OPTIONS); setEditMode(false) }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
