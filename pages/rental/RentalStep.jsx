import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowLeft, ArrowRight, X } from 'lucide-react'
import { getAvailableVehicles } from '../../lib/db'
import { api } from '../../lib/api'
import { getRentalOptions } from '../../utils/rentalOptions'
import StepButtons from './StepButtons'

export default function RentalStep({ client, onNext, onBack, onSaveAndQuit, onCancel, initialRental }) {
  const { t } = useTranslation('rental')
  const today = new Date().toISOString().split('T')[0]
  const [rentalOptions, setRentalOptions] = useState([])
  const [form, setForm] = useState(initialRental || {
    startDate: today, endDate: '', vehicleId: '',
    startTime: '09:00', endTime: '09:00', fuelLevel: 'Plein',
    paymentMethod: 'Carte bancaire', deposit: 2400,
    pickupLocation: '', returnLocation: '',
    mileageOut: '',
    selectedOptions: {},
  })
  const [vehicles, setVehicles] = useState([])
  const [vehicle, setVehicle] = useState(null)
  const [vehiclesLoading, setVehiclesLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const options = await getRentalOptions()
      setRentalOptions(options)
      setForm(p => ({
        ...p,
        selectedOptions: Object.fromEntries(options.map(o => [o.id, o.enabled])),
      }))
    })()
  }, [])

  useEffect(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return
    let cancelled = false
    setVehiclesLoading(true)
    Promise.all([
      getAvailableVehicles(form.startDate, form.endDate),
      api.network.borrowedFleet({ startDate: form.startDate, endDate: form.endDate })
        .then(r => r.vehicles ?? [])
        .catch(() => []),
    ])
      .then(([own, borrowed]) => {
        if (!cancelled) setVehicles([...own, ...borrowed])
      })
      .catch(err => { console.error('[NewRental] vehicles fetch', err) })
      .finally(() => { if (!cancelled) setVehiclesLoading(false) })
    return () => { cancelled = true }
  }, [form.startDate, form.endDate])

  const selectVehicle = (v) => {
    setVehicle(v)
    setForm(p => ({ ...p, vehicleId: v.id }))
  }

  const days = form.startDate && form.endDate
    ? Math.max(1, Math.ceil((new Date(form.endDate) - new Date(form.startDate)) / 86400000))
    : 0
  const totalHT = vehicle ? vehicle.dailyRate * days : 0
  const extras = rentalOptions.reduce((sum, opt) => {
    if (!form.selectedOptions[opt.id]) return sum
    return sum + (opt.pricingType === 'per_day' ? opt.price * days : opt.price)
  }, 0)
  const totalTTC = Math.round((totalHT + extras) * 1.2)
  const tva      = Math.round((totalHT + extras) * 0.2)

  const dateValid = !form.startDate || !form.endDate || form.endDate >= form.startDate
  const canContinue = vehicle && form.startDate && form.endDate && dateValid && days > 0

  const handleNext = () => {
    onNext({
      ...form,
      vehicle, days,
      totalHT: totalHT + extras,
      tva, totalTTC,
      mileageOut: Number(form.mileageOut) || 0,
      // keep legacy cdw/pai flags for contract display backward-compat
      cdw: !!(form.selectedOptions['cdw']),
      pai: !!(form.selectedOptions['pai']),
    })
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header"><h3>{t('rentalStep.periodTitle')}</h3></div>
        <div className="card-body">
          <div className="form-row cols-3">
            <div className="form-group">
              <label className="form-label">{t('rentalStep.startDate')} *</label>
              <input className="form-input" type="date" value={form.startDate} min={today}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('rentalStep.endDate')} *</label>
              <input className="form-input" type="date" value={form.endDate} min={form.startDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('rentalStep.duration')}</label>
              <input className="form-input text-mono" readOnly value={days > 0 ? t('rentalStep.daysShort', { n: days }) : '—'} />
            </div>
          </div>
          {form.endDate && form.startDate && form.endDate < form.startDate && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
              {t('rentalStep.endBeforeStart')}
            </div>
          )}
          {vehiclesLoading && (
            <div style={{ color: 'var(--text3)', fontSize: 13, margin: '8px 0' }}>
              {t('rentalStep.vehiclesLoading')}
            </div>
          )}

          {!vehiclesLoading && vehicles.length > 0 && (
            <div className="fleet-grid mt-3">
              {vehicles.map(v => (
                <div key={v.id} className="vehicle-card"
                  style={{ cursor:'pointer', border: form.vehicleId === v.id ? '2px solid var(--accent)' : v._isNetworkVehicle ? '1px solid #a5b4fc' : undefined }}
                  onClick={() => selectVehicle(v)}>
                  {v._isNetworkVehicle && (
                    <span className="badge badge-purple" style={{ marginBottom: 6, display: 'inline-block' }}>{t('rentalStep.networkBadge')}</span>
                  )}
                  <div className="vehicle-plate">{v.plate}</div>
                  <div className="vehicle-name">{v.make} {v.model} {v.year}</div>
                  <div className="vehicle-meta">{v.category} · {v.color} · {v.fuelType}</div>
                  <div className="vehicle-status">
                    <span style={{ fontFamily:'DM Mono', fontWeight:600, color:'var(--accent)' }}>{t('rentalStep.perDay', { rate: v.dailyRate })}</span>
                    {form.vehicleId === v.id && <span className="badge badge-green">{t('rentalStep.selected')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!vehiclesLoading && vehicles.length === 0 && form.startDate && form.endDate && (
            <div className="alert alert-warn mt-3">
              <AlertCircle size={14} />
              <span>{t('rentalStep.noVehicles')}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card">
          <div className="card-header"><h3>{t('rentalStep.optionsTitle')}</h3></div>
          <div className="card-body">
            <div className="form-row cols-3">
              <div className="form-group">
                <label className="form-label">{t('rentalStep.startTime')}</label>
                <input className="form-input" type="time" value={form.startTime}
                  onChange={e => setForm(p => ({...p, startTime: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rentalStep.endTime')}</label>
                <input className="form-input" type="time" value={form.endTime}
                  onChange={e => setForm(p => ({...p, endTime: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rentalStep.fuelLevel')}</label>
                <select className="form-select" value={form.fuelLevel}
                  onChange={e => setForm(p => ({...p, fuelLevel: e.target.value}))}>
                  {[['Plein','full'],['3/4','3_4'],['1/2','1_2'],['1/4','1_4'],['Vide','empty']].map(([val,key]) => <option key={val} value={val}>{t(`rentalStep.fuel.${key}`)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">{t('rentalStep.pickupLocation')}</label>
                <input className="form-input" value={form.pickupLocation} placeholder={t('rentalStep.locationPlaceholder')}
                  onChange={e => setForm(p => ({...p, pickupLocation: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('rentalStep.returnLocation')}</label>
                <input className="form-input" value={form.returnLocation} placeholder="Agency / Airport…"
                  onChange={e => setForm(p => ({...p, returnLocation: e.target.value}))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">{t('rentalStep.mileageOut')} *</label>
                <input className="form-input text-mono" type="number" min={0} value={form.mileageOut}
                  placeholder={t('rentalStep.mileagePlaceholder')}
                  onChange={e => setForm(p => ({...p, mileageOut: e.target.value}))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">{t('rentalStep.paymentMethod')}</label>
                <select className="form-select" value={form.paymentMethod}
                  onChange={e => setForm(p => ({...p, paymentMethod: e.target.value}))}>
                  {[['Carte bancaire','card'],['Espèces','cash'],['Virement','transfer'],['CMI','cmi']].map(([val,key]) => <option key={val} value={val}>{t(`rentalStep.payment.${key}`)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('rentalStep.deposit')}</label>
                <input className="form-input text-mono" type="number" value={form.deposit}
                  onChange={e => setForm(p => ({...p, deposit: e.target.value}))} />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rentalOptions.map(opt => {
                const checked = !!form.selectedOptions[opt.id]
                const priceLbl = opt.pricingType === 'per_day'
                  ? t('rentalStep.optionPerDay', { price: opt.price })
                  : t('rentalStep.optionFlat', { price: opt.price })
                return (
                  <label key={opt.id} style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer',
                    background: checked ? 'var(--green-bg)' : 'var(--bg)',
                    border: `1px solid ${checked ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                    <input type="checkbox" checked={checked}
                      onChange={e => setForm(p => ({ ...p, selectedOptions: { ...p.selectedOptions, [opt.id]: e.target.checked } }))}
                      style={{ marginTop:2 }} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{opt.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{priceLbl}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{t('rentalStep.priceTitle')}</h3></div>
          <div className="card-body">
            {[
              { label: t('rentalStep.priceVehicle'), value: t('rentalStep.priceMultiplier', { a: vehicle?.dailyRate || 0, b: days }), amount: totalHT },
              ...rentalOptions
                .filter(opt => form.selectedOptions[opt.id])
                .map(opt => ({
                  label: opt.name,
                  value: opt.pricingType === 'per_day' ? t('rentalStep.priceMultiplier', { a: opt.price, b: days }) : t('rentalStep.priceFlat'),
                  amount: opt.pricingType === 'per_day' ? opt.price * days : opt.price,
                })),
              { label: t('rentalStep.priceTVA'), value: '', amount: tva },
            ].map(({ label, value, amount }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <div>
                  <div>{label}</div>
                  {value && <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'DM Mono' }}>{value}</div>}
                </div>
                <div className="text-mono" style={{ fontWeight:500 }}>{amount} MAD</div>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0 0', fontSize:16, fontWeight:600 }}>
              <span>{t('rentalStep.priceTotal')}</span>
              <span className="text-mono" style={{ color:'var(--accent)' }}>{totalTTC} MAD</span>
            </div>
          </div>
        </div>
      </div>

      <StepButtons
        leftBtns={
          <>
            <button className="btn-outline-ink" style={{ fontSize: 14 }} onClick={onBack}><ArrowLeft size={15} /> {t('common:back', 'Retour')}</button>
            <button className="btn-outline-ink" style={{ fontSize: 14, color: '#CF4500', borderColor: '#CF4500' }} onClick={onCancel}>
              <X size={15} /> {t('rentalStep.cancelBtn')}
            </button>
          </>
        }
        rightBtns={
          <>
            <button className="btn-outline-ink" style={{ fontSize: 14 }} onClick={() => onSaveAndQuit({ ...form, vehicle })}>
              {t('rentalStep.saveQuitBtn')}
            </button>
            <button className="btn-ink" style={{ fontSize: 15 }} disabled={!canContinue} onClick={handleNext}>
              {t('rentalStep.continueBtn')} <ArrowRight size={15} />
            </button>
          </>
        }
      />
    </div>
  )
}
