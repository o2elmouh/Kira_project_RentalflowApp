import { useTranslation } from 'react-i18next'
import { ZONES, computeExtraFees } from '../../utils/restitutionUtils'
import AiDamagePanel from './AiDamagePanel'

export default function Step3Damages({ contract, vehicle, agency, returnMileage, returnFuelLevel, returnPhotos, beforePhotos, damages, onChange, damageFee, onDamageFee, fuelPriceOverride, onFuelPriceOverride, onNext, onBack }) {
  const { t } = useTranslation('restitution')
  const { extraKm, extraKmFee, kmAllowed, kmDriven, fuelDiff, fuelFee, totalExtraFees } =
    computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee, fuelPriceOverride })

  const toggleZone = (zone) => {
    const existing = damages.find(d => d.zone === zone)
    if (existing) {
      onChange(damages.map(d => d.zone === zone ? { ...d, checked: !d.checked } : d))
    } else {
      onChange([...damages, { zone, checked: true, description: '' }])
    }
  }

  const setDescription = (zone, description) => {
    onChange(damages.map(d => d.zone === zone ? { ...d, description } : d))
  }

  const getDamage = (zone) => damages.find(d => d.zone === zone) || { checked: false, description: '' }

  return (
    <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>{t('step3.title')}</h3></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Zones checklist */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text2)' }}>{t('step3.damages')}</div>
          {ZONES.map(zone => {
            const dmg = getDamage(zone)
            return (
              <div key={zone} style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={dmg.checked}
                    onChange={() => toggleZone(zone)}
                    style={{ width: 16, height: 16 }}
                  />
                  {t(`zones.${zone}`)}
                </label>
                {dmg.checked && (
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('step3.damagePlaceholder')}
                    value={dmg.description}
                    onChange={e => setDescription(zone, e.target.value)}
                    style={{ marginTop: 6, marginLeft: 24, width: 'calc(100% - 24px)' }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* AI Damage Detection */}
        <AiDamagePanel
          contract={contract}
          vehicle={vehicle}
          agency={agency}
          returnPhotos={returnPhotos}
          beforePhotos={beforePhotos}
          damages={damages}
          onDamagesChange={onChange}
        />

        {/* Auto-calculated fees */}
        <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text2)' }}>{t('step3.extraCosts')}</div>

          {/* Extra km */}
          <div style={{ marginBottom: 8, fontSize: 13 }}>
            {vehicle?.maxKmEnabled ? (
              extraKmFee > 0 ? (
                <div style={{ color: '#c2410c' }}>
                  {t('step3.extraKm', { count: extraKm, fee: extraKmFee })}
                  <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{t('step3.kmAllowed', { km: kmAllowed })}</span>
                </div>
              ) : (
                <div style={{ color: 'var(--text3)' }}>
                  {t('step3.noExtraKm')}
                </div>
              )
            ) : (
              <div style={{ color: 'var(--text3)' }}>{t('step3.noKmLimit')}</div>
            )}
          </div>

          {/* Fuel fee */}
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 12 }}>
              Frais carburant (MAD)
              {fuelDiff > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>calculé : {fuelDiff} niveau{fuelDiff > 1 ? 'x' : ''} × 100</span>}
            </label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={fuelPriceOverride !== undefined ? fuelPriceOverride : fuelDiff * 100}
              onChange={e => onFuelPriceOverride(e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ maxWidth: 180 }}
            />
          </div>

          {/* Damage fee */}
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 12 }}>{t('step3.damageFee')}</label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={damageFee || ''}
              placeholder="0"
              onChange={e => onDamageFee(Number(e.target.value) || 0)}
              style={{ maxWidth: 180 }}
            />
          </div>

          {/* Total */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
              <span>{t('step3.totalFees')}</span>
              <span style={{ color: totalExtraFees > 0 ? '#c2410c' : 'var(--text2)' }}>{totalExtraFees} MAD</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.prev')}
          </button>
          <button className="btn btn-primary" onClick={onNext} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
