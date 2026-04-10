import { useState, useEffect } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, X } from 'lucide-react'
import { getAvailableVehicles } from '../../lib/db'
import { getRentalOptions } from '../../utils/rentalOptions'
import StepButtons from './StepButtons'

export default function RentalStep({ client, onNext, onBack, onSaveAndQuit, onCancel, initialRental }) {
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
    getAvailableVehicles(form.startDate, form.endDate)
      .then(data => { if (!cancelled) setVehicles(data) })
      .catch(err => { console.error('[NewRental] getAvailableVehicles', err) })
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
        <div className="card-header"><h3>Rental Period & Vehicle</h3></div>
        <div className="card-body">
          <div className="form-row cols-3">
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input className="form-input" type="date" value={form.startDate} min={today}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input className="form-input" type="date" value={form.endDate} min={form.startDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input className="form-input text-mono" readOnly value={days > 0 ? `${days} day(s)` : '—'} />
            </div>
          </div>
          {form.endDate && form.startDate && form.endDate < form.startDate && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
              ⚠️ La date de fin doit être après la date de début.
            </div>
          )}
          {vehiclesLoading && (
            <div style={{ color: 'var(--text3)', fontSize: 13, margin: '8px 0' }}>
              Chargement des véhicules…
            </div>
          )}

          {!vehiclesLoading && vehicles.length > 0 && (
            <div className="fleet-grid mt-3">
              {vehicles.map(v => (
                <div key={v.id} className="vehicle-card"
                  style={{ cursor:'pointer', border: form.vehicleId === v.id ? '2px solid var(--accent)' : undefined }}
                  onClick={() => selectVehicle(v)}>
                  <div className="vehicle-plate">{v.plate}</div>
                  <div className="vehicle-name">{v.make} {v.model} {v.year}</div>
                  <div className="vehicle-meta">{v.category} · {v.color} · {v.fuelType}</div>
                  <div className="vehicle-status">
                    <span style={{ fontFamily:'DM Mono', fontWeight:600, color:'var(--accent)' }}>{v.dailyRate} MAD/day</span>
                    {form.vehicleId === v.id && <span className="badge badge-green">Selected</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!vehiclesLoading && vehicles.length === 0 && form.startDate && form.endDate && (
            <div className="alert alert-warn mt-3">
              <AlertCircle size={14} />
              <span>No vehicles found for these dates. Try different dates or search again.</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card">
          <div className="card-header"><h3>Options & Insurance</h3></div>
          <div className="card-body">
            <div className="form-row cols-3">
              <div className="form-group">
                <label className="form-label">Heure de départ</label>
                <input className="form-input" type="time" value={form.startTime}
                  onChange={e => setForm(p => ({...p, startTime: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Heure de retour</label>
                <input className="form-input" type="time" value={form.endTime}
                  onChange={e => setForm(p => ({...p, endTime: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Niveau de carburant départ</label>
                <select className="form-select" value={form.fuelLevel}
                  onChange={e => setForm(p => ({...p, fuelLevel: e.target.value}))}>
                  {['Plein', '3/4', '1/2', '1/4', 'Vide'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">Pickup Location</label>
                <input className="form-input" value={form.pickupLocation} placeholder="Agency / Airport…"
                  onChange={e => setForm(p => ({...p, pickupLocation: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Return Location</label>
                <input className="form-input" value={form.returnLocation} placeholder="Agency / Airport…"
                  onChange={e => setForm(p => ({...p, returnLocation: e.target.value}))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">Kilométrage départ (km) *</label>
                <input className="form-input text-mono" type="number" min={0} value={form.mileageOut}
                  placeholder="ex: 45230"
                  onChange={e => setForm(p => ({...p, mileageOut: e.target.value}))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={form.paymentMethod}
                  onChange={e => setForm(p => ({...p, paymentMethod: e.target.value}))}>
                  {['Carte bancaire','Espèces','Virement','CMI'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Deposit (MAD)</label>
                <input className="form-input text-mono" type="number" value={form.deposit}
                  onChange={e => setForm(p => ({...p, deposit: e.target.value}))} />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rentalOptions.map(opt => {
                const checked = !!form.selectedOptions[opt.id]
                const priceLbl = opt.pricingType === 'per_day'
                  ? `+${opt.price} MAD/jour`
                  : `+${opt.price} MAD (fixe)`
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
          <div className="card-header"><h3>Price Summary</h3></div>
          <div className="card-body">
            {[
              { label: 'Vehicle rental', value: `${vehicle?.dailyRate || 0} × ${days} days`, amount: totalHT },
              ...rentalOptions
                .filter(opt => form.selectedOptions[opt.id])
                .map(opt => ({
                  label: opt.name,
                  value: opt.pricingType === 'per_day' ? `${opt.price} × ${days} days` : 'Forfait',
                  amount: opt.pricingType === 'per_day' ? opt.price * days : opt.price,
                })),
              { label: 'TVA (20%)', value: '', amount: tva },
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
              <span>Total TTC</span>
              <span className="text-mono" style={{ color:'var(--accent)' }}>{totalTTC} MAD</span>
            </div>
          </div>
        </div>
      </div>

      <StepButtons
        leftBtns={
          <>
            <button className="btn btn-primary btn-lg" onClick={onBack} style={{ color: 'white' }}><ArrowLeft size={15} /> Retour</button>
            <button className="btn btn-primary btn-lg" style={{ color: 'white' }} onClick={onCancel}>
              <X size={15} /> Annuler la location
            </button>
          </>
        }
        rightBtns={
          <>
            <button className="btn btn-ghost" onClick={onSaveAndQuit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              💾 Sauvegarder & quitter
            </button>
            <button className="btn btn-primary btn-lg" disabled={!canContinue} onClick={handleNext}>
              Continuer <ArrowRight size={15} />
            </button>
          </>
        }
      />
    </div>
  )
}
