import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getFleet, getAgency } from '../lib/db'
import { ZONES, today, nowTime } from '../utils/restitutionUtils'
import Step1Return from './restitution/Step1Return'
import Step2Photos from './restitution/Step2Photos'
import Step3Damages from './restitution/Step3Damages'
import Step4Closure from './restitution/Step4Closure'

// ── Constants ─────────────────────────────────────────────

const STEPS = ['return', 'photos', 'inspection', 'closure']

// ── StepBar ───────────────────────────────────────────────

function StepBar({ current }) {
  const { t } = useTranslation('restitution')
  return (
    <div className="steps">
      {STEPS.map((key, i) => (
        <div key={i} className="step-item">
          <div className={`step-circle ${i < current ? 'done' : i === current ? 'active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`step-label${i === current ? ' active' : ''}`}>{t(`steps.${key}`)}</span>
          {i < STEPS.length - 1 && <div className={`step-line${i < current ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Main Restitution wizard ───────────────────────────────

export default function Restitution({ contract, onDone }) {
  const { t } = useTranslation('restitution')
  const [step, setStep] = useState(0)
  const [vehicle, setVehicle] = useState(null)
  const [agency, setAgency] = useState({})
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!contract) { setDataLoading(false); return }
    let cancelled = false
    Promise.all([
      getFleet().catch(err => { console.error('[Restitution] getFleet', err); return [] }),
      getAgency().catch(err => { console.error('[Restitution] getAgency', err); return {} }),
    ]).then(([fleet, agencyData]) => {
      if (!cancelled) {
        setVehicle(fleet.find(v => v.id === contract.vehicleId) || null)
        setAgency(agencyData || {})
        setDataLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [contract])

  // Step 1 data
  const [returnData, setReturnData] = useState({
    returnMileage: contract?.startMileage || contract?.mileageOut || 0,
    returnFuelLevel: contract?.fuelLevel || 'Plein',
    returnDate: today(),
    returnTime: nowTime(),
  })

  // Step 2 data
  const [returnPhotos, setReturnPhotos] = useState({})

  // Step 3 data
  const [damages, setDamages] = useState(
    ZONES.map(zone => ({ zone, checked: false, description: '' }))
  )
  const [damageFee, setDamageFee] = useState(0)
  const [fuelPriceOverride, setFuelPriceOverride] = useState(undefined)

  if (!contract) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        {t('noContract')}
      </div>
    )
  }

  if (dataLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        Chargement des données…
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>
            {t('subtitle', { number: contract.contractNumber, clientName: contract.clientName, vehicleName: contract.vehicleName })}
          </p>
        </div>
      </div>

      <div className="page-body">
        <StepBar current={step} />

        <div style={{ marginTop: 24 }}>
          {step === 0 && (
            <Step1Return
              contract={contract}
              vehicle={vehicle}
              data={returnData}
              onChange={patch => setReturnData(prev => ({ ...prev, ...patch }))}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <Step2Photos
              contract={contract}
              photos={returnPhotos}
              onChange={setReturnPhotos}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <Step3Damages
              contract={contract}
              vehicle={vehicle}
              agency={agency}
              returnMileage={returnData.returnMileage}
              returnFuelLevel={returnData.returnFuelLevel}
              returnPhotos={returnPhotos}
              beforePhotos={Object.values(vehicle?.photos || {}).filter(Boolean)}
              damages={damages}
              onChange={setDamages}
              damageFee={damageFee}
              onDamageFee={setDamageFee}
              fuelPriceOverride={fuelPriceOverride}
              onFuelPriceOverride={setFuelPriceOverride}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <Step4Closure
              agency={agency}
              contract={contract}
              vehicle={vehicle}
              returnDate={returnData.returnDate}
              returnTime={returnData.returnTime}
              returnMileage={returnData.returnMileage}
              returnFuelLevel={returnData.returnFuelLevel}
              returnPhotos={returnPhotos}
              damages={damages}
              damageFee={damageFee}
              fuelPriceOverride={fuelPriceOverride}
              onBack={() => setStep(2)}
              onDone={onDone}
            />
          )}
        </div>
      </div>
    </div>
  )
}
