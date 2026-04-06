import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusCircle, Edit2, Trash2 } from 'lucide-react'
import { getRepairs, saveRepair, deleteRepair } from '../../lib/db'
import { EMPTY_REPAIR } from './constants'

export default function RepairsTab({ vehicle }) {
  const { t } = useTranslation('fleet')
  const [repairs, setRepairs] = useState([])
  const [form, setForm] = useState(null)

  const refresh = async () => {
    try { setRepairs(await getRepairs(vehicle.id)) } catch (e) { console.error(e) }
  }

  useEffect(() => { refresh() }, [vehicle.id])  // refresh() has its own internal cancel guard

  const save = async () => {
    try {
      await saveRepair({ ...form, vehicleId: vehicle.id, cost: Number(form.cost), mileage: Number(form.mileage) })
      setForm(null)
      await refresh()
    } catch (e) { console.error(e) }
  }

  const remove = async (id) => {
    if (confirm(t('repairs.deleteConfirm'))) {
      try { await deleteRepair(id); await refresh() } catch (e) { console.error(e) }
    }
  }

  const total = repairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {t('repairs.count', { count: repairs.length })} · <strong style={{ color: '#dc2626' }}>{t('repairs.totalCost', { total: total.toLocaleString() })}</strong>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY_REPAIR })}>
          <PlusCircle size={13} /> {t('repairs.addBtn')}
        </button>
      </div>

      {form && (
        <div className="card">
          <div className="card-header"><h3>{form.id ? t('repairs.titleEdit') : t('repairs.titleNew')}</h3></div>
          <div className="card-body">
            <div className="form-row cols-3">
              <div className="form-group">
                <label className="form-label">{t('repairs.date')}</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.type')}</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {Object.keys(t('repairs.types', { returnObjects: true })).map(k => <option key={k} value={k}>{t(`repairs.types.${k}`)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.cost')}</label>
                <input className="form-input text-mono" type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">{t('repairs.garage')}</label>
                <input className="form-input" value={form.garage} placeholder={t('repairs.garagePlaceholder')} onChange={e => setForm(p => ({ ...p, garage: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.kmLabel')}</label>
                <input className="form-input text-mono" type="number" value={form.mileage} onChange={e => setForm(p => ({ ...p, mileage: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('repairs.description')}</label>
              <input className="form-input" value={form.description} placeholder={t('repairs.descriptionPlaceholder')} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save} disabled={!form.date || !form.cost}>{t('form.save')}</button>
              <button className="btn btn-ghost" onClick={() => setForm(null)}>{t('form.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {repairs.length === 0 && !form && (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('repairs.empty')}</p>
      )}

      {repairs.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, background: '#fef2f2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>🔧</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.type}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: '#dc2626' }}>{(r.cost || 0).toLocaleString()} MAD</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {new Date(r.date).toLocaleDateString('fr-MA')}
              {r.garage && ` · ${r.garage}`}
              {r.mileage ? ` · ${Number(r.mileage).toLocaleString()} km` : ''}
            </div>
            {r.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{r.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(r)}><Edit2 size={12} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(r.id)}><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
