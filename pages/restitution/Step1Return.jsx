import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio } from 'lucide-react'
import { FUEL_LEVELS, FUEL_OPTIONS } from '../../utils/restitutionUtils'
import { getSnapshotsForContract } from '../../lib/db'

export default function Step1Return({ contract, vehicle, data, onChange, onNext }) {
  const { t } = useTranslation('restitution')
  const startMileage   = contract.startMileage || contract.mileageOut || 0
  const departureLevel = contract.fuelLevel || 'Plein'
  const kmDriven = data.returnMileage ? Math.max(0, data.returnMileage - startMileage) : 0
  const fuelDiff = (FUEL_LEVELS[departureLevel] || 0) - (FUEL_LEVELS[data.returnFuelLevel] || 0)

  const isValid = data.returnMileage >= startMileage && data.returnDate && data.returnTime

  // Check for a telemetry end-snapshot for pre-fill
  const [snapFill, setSnapFill] = useState(null)
  useEffect(() => {
    (async () => {
      const snaps   = await getSnapshotsForContract(contract.id)
      const endSnap = snaps.find(s => s.phase === 'end')
      if (endSnap && vehicle?.trackedDevice) setSnapFill(endSnap)
    })()
  }, [contract.id, vehicle])

  const applySnapshot = () => {
    if (!snapFill) return
    // Convert fuel % to nearest FUEL_OPTIONS label
    const fuelPct = snapFill.fuel ?? -1
    let fuelLabel = data.returnFuelLevel
    if (fuelPct >= 90) fuelLabel = 'Plein'
    else if (fuelPct >= 65) fuelLabel = '3/4'
    else if (fuelPct >= 40) fuelLabel = '1/2'
    else if (fuelPct >= 15) fuelLabel = '1/4'
    else if (fuelPct >= 0)  fuelLabel = 'Vide'
    onChange({ returnMileage: snapFill.mileage, returnFuelLevel: fuelLabel })
  }

  return (
    <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>{t('step1.title')}</h3></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Telemetry pre-fill banner */}
        {snapFill ? (
          <div style={{ background: '#0f2a1a', border: '1px solid #166534', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio size={14} color="#4ade80" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>Données télématiques disponibles</div>
                <div style={{ fontSize: 11, color: '#86efac', marginTop: 2 }}>
                  {snapFill.mileage?.toLocaleString()} km · Carburant {Math.round(snapFill.fuel ?? 0)}%
                  {snapFill.dtcCodes?.length > 0 && <span style={{ color: '#f87171', marginLeft: 8 }}>⚠ DTC: {snapFill.dtcCodes.join(', ')}</span>}
                </div>
              </div>
            </div>
            <button
              onClick={applySnapshot}
              style={{ background: '#166534', color: '#4ade80', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Pré-remplir
            </button>
          </div>
        ) : vehicle?.trackedDevice ? (
          <div style={{ background: '#1e1e2a', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Radio size={12} />
            Véhicule GPS — aucun snapshot de fin disponible. Saisie manuelle.
          </div>
        ) : null}

        <div className="form-group">
          <label className="form-label">{t('step1.returnKm')}</label>
          <input
            type="number"
            className="form-input"
            min={startMileage}
            value={data.returnMileage}
            onChange={e => onChange({ returnMileage: Number(e.target.value) })}
          />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            {t('step1.kmHint', { departure: startMileage, driven: kmDriven })}
          </div>
          {data.returnMileage < startMileage && (
            <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>
              {t('step1.kmError', { departure: startMileage })}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t('step1.fuelLevel')}</label>
          <select
            className="form-input"
            value={data.returnFuelLevel}
            onChange={e => onChange({ returnFuelLevel: e.target.value })}
          >
            {FUEL_OPTIONS.map(o => <option key={o} value={o}>{t(`fuelLevels.${o}`)}</option>)}
          </select>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            {t('step1.fuelDepartureHint', { level: departureLevel })}
          </div>
          {fuelDiff > 0 && (
            <div style={{ marginTop: 6, padding: '8px 12px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, color: '#c2410c', fontSize: 13 }}>
              {t('step1.fuelWarning', { diff: fuelDiff })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">{t('step1.returnDate')}</label>
            <input
              type="date"
              className="form-input"
              value={data.returnDate}
              onChange={e => onChange({ returnDate: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('step1.returnTime')}</label>
            <input
              type="time"
              className="form-input"
              value={data.returnTime}
              onChange={e => onChange({ returnTime: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            className="btn btn-primary"
            disabled={!isValid}
            onClick={onNext}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {t('nav.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
