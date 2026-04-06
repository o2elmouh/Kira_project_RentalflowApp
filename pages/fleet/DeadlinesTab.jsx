import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFleetConfigForMake } from '../../lib/db'
import DeadlineBadge from './DeadlineBadge'
import { computeDeadlinesFromConfig } from './constants'

export default function DeadlinesTab({ vehicle, onSave }) {
  const { t } = useTranslation('fleet')
  const config = getFleetConfigForMake(vehicle.make)

  const [form, setForm] = useState(() => computeDeadlinesFromConfig(vehicle))
  const [saved, setSaved] = useState(false)

  const save = () => {
    onSave({ ...vehicle, ...form, nextControleTech: form.nextControleTech })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const recalc = () => {
    setForm(computeDeadlinesFromConfig({ ...vehicle, nextOilChangeMileage: '', nextTimingBeltMileage: '', warrantyEnd: '', nextControleTech: '' }))
  }

  const deadlines = [
    { label: t('detail.modal.oilChange'),     dateKey: 'nextOilChange',   mileageKey: 'nextOilChangeMileage',  icon: '🛢️', configHint: config ? t('detail.modal.configHintKm', { km: config.vidangeKm.toLocaleString() }) : null },
    { label: t('detail.modal.timingBelt'),    dateKey: 'nextTimingBelt',  mileageKey: 'nextTimingBeltMileage', icon: '⚙️', configHint: config ? t('detail.modal.configHintAtKm', { km: config.courroieKm.toLocaleString() }) : null },
    { label: t('detail.modal.controleTech'),  dateKey: 'nextControleTech', icon: '📋', configHint: config ? t('detail.modal.configHintYears', { years: config.controlTechYears }) : null },
    { label: t('detail.modal.nextRepair'),    dateKey: 'nextRepair',      icon: '🔧', configHint: null },
    { label: t('detail.modal.warrantyEnd'),   dateKey: 'warrantyEnd',     icon: '🛡️', configHint: config ? `Config : ${config.warrantyGeneral}` : null },
    { label: t('detail.modal.plannedSale'),   dateKey: 'plannedSaleDate', icon: '💰', configHint: null },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Config banner */}
      {config && (
        <div style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px' }}>
          {t('echeances.configBanner', { make: vehicle.make, warranty: config.warrantyGeneral, ct: config.controlTechYears, vidange: config.vidangeKm.toLocaleString(), courroie: config.courroieKm.toLocaleString() })}
        </div>
      )}

      {/* Status overview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {deadlines.map(({ label, dateKey, mileageKey, icon, configHint }) => {
          const date = form[dateKey]
          const days = date ? Math.ceil((new Date(date) - new Date()) / 86400000) : null
          const urgent = days !== null && days <= 30
          const overdue = days !== null && days < 0
          const isComputed = !vehicle[dateKey] && !!form[dateKey]
          return (
            <div key={dateKey} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 8,
              background: overdue ? '#fef2f2' : urgent ? '#fff7ed' : 'var(--bg2)',
              border: `1px solid ${overdue ? '#fecaca' : urgent ? '#fed7aa' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {label}
                  {isComputed && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 6, fontWeight: 400 }}>{t('echeances.computed')}</span>}
                </div>
                {mileageKey && form[mileageKey] && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t('echeances.atKm', { km: Number(form[mileageKey]).toLocaleString() })}</div>
                )}
                {configHint && (
                  <div style={{ fontSize: 10, color: '#a5b4fc' }}>{configHint}</div>
                )}
              </div>
              <DeadlineBadge date={date} />
            </div>
          )
        })}
      </div>

      {/* Edit form */}
      <div className="card">
        <div className="card-header">
          <h3>{t('detail.modal.title')}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {config && (
              <button className="btn btn-ghost btn-sm" onClick={recalc} title={t('echeances.recalcTitle')}>
                {t('echeances.recalcBtn')}
              </button>
            )}
            {saved && <span className="badge badge-green">{t('saved')}</span>}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {deadlines.map(({ label, dateKey, mileageKey, configHint }) => (
              <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label">
                  {label}
                  {configHint && <span style={{ fontSize: 10, color: '#a5b4fc', marginLeft: 4 }}>({configHint})</span>}
                </label>
                <input className="form-input" type="date" value={form[dateKey] || ''}
                  onChange={e => setForm(p => ({ ...p, [dateKey]: e.target.value }))} />
                {mileageKey && (
                  <input className="form-input text-mono" type="number" placeholder={t('detail.modal.mileagePlaceholder')}
                    value={form[mileageKey] || ''}
                    onChange={e => setForm(p => ({ ...p, [mileageKey]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={save}>{t('repairs.addBtn')}</button>
        </div>
      </div>
    </div>
  )
}
