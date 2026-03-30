import { useState, useRef } from 'react'
import { Upload, Camera, CheckCircle, AlertCircle, Printer, Download, ArrowRight, ArrowLeft } from 'lucide-react'
import { runOCR } from './lib/ocr'
import { getAvailableVehicles, saveClient, saveContract, saveInvoice, getAgency, getFleet, saveVehicle } from './utils/storage'
import { generateContract, generateInvoice } from './utils/pdf'
import CarPhotoGuide from './components/CarPhotoGuide'

const STEPS = ['Scan ID', 'Rental Details', 'Photos', 'Contract', 'Invoice']

// ── Photo slots ───────────────────────────────────────────
const PHOTO_SLOTS = [
  { id: 'front',    label: 'Avant' },
  { id: 'rear',     label: 'Arrière' },
  { id: 'left',     label: 'Côté gauche' },
  { id: 'right',    label: 'Côté droit' },
  { id: 'interior', label: 'Intérieur' },
  { id: 'damage',   label: 'Détail / Dommage' },
]

async function compressImage(file, maxW = 1200, quality = 0.78) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function StepBar({ current }) {
  return (
    <div className="steps">
      {STEPS.map((label, i) => (
        <div key={i} className="step-item">
          <div className={`step-circle ${i < current ? 'done' : i === current ? 'active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`step-label${i === current ? ' active' : ''}`}>{label}</span>
          {i < STEPS.length - 1 && <div className={`step-line${i < current ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Client Alerts ─────────────────────────────────────────
function ClientAlerts({ client }) {
  const today = new Date()
  const alerts = []

  if (client.cinExpiry) {
    const exp = new Date(client.cinExpiry)
    if (exp < today) alerts.push({ type: 'error', msg: `CIN expiré depuis le ${exp.toLocaleDateString('fr-MA')}` })
    else if ((exp - today) / 86400000 < 30) alerts.push({ type: 'warn', msg: `CIN expire dans moins de 30 jours (${exp.toLocaleDateString('fr-MA')})` })
  }

  if (client.licenseExpiry) {
    const exp = new Date(client.licenseExpiry)
    if (exp < today) alerts.push({ type: 'error', msg: `Permis de conduire expiré depuis le ${exp.toLocaleDateString('fr-MA')}` })
    else if ((exp - today) / 86400000 < 30) alerts.push({ type: 'warn', msg: `Permis expire dans moins de 30 jours` })
  }

  if (client.dateOfBirth) {
    const age = Math.floor((today - new Date(client.dateOfBirth)) / (365.25 * 86400000))
    if (age < 21) alerts.push({ type: 'error', msg: `Client mineur ou trop jeune — âge minimum 21 ans (âge actuel : ${age} ans)` })
  }

  if (!alerts.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {alerts.map((a, i) => (
        <div key={i} className={`alert alert-${a.type === 'error' ? 'danger' : 'warn'}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          <span>{a.type === 'error' ? '🚫' : '⚠️'}</span>
          <span>{a.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ── Step 1: ID Scan ──────────────────────────────────────
function ScanStep({ onNext }) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [scanType, setScanType] = useState(null)
  const [extracted, setExtracted] = useState({ cin: null, license: null })
  const [client, setClient] = useState({
    firstName: '', lastName: '', cinNumber: '', cinExpiry: '',
    drivingLicenseNumber: '', licenseExpiry: '', phone: '', email: '', nationality: 'Marocain',
    dateOfBirth: '',
  })
  const cinRef = useRef(); const licRef = useRef()
  const [ocrError, setOcrError] = useState(null)

  const handleFile = async (type, file) => {
    if (!file) return
    setScanning(true); setScanType(type); setProgress(0); setOcrError(null)
    try {
      const fields = await runOCR(file, type, pct => setProgress(pct))
      setExtracted(prev => ({ ...prev, [type]: fields }))
      setClient(prev => ({ ...prev, ...fields }))
    } catch (err) {
      console.error('[OCR]', err)
      setOcrError(`OCR failed: ${err.message}`)
    } finally {
      setScanning(false)
      setProgress(0)
    }
  }

  // Demo mode — fills with realistic sample data (no Tesseract needed)
  const simulateScan = (type) => {
    const demo = type === 'cin'
      ? { firstName: 'Karim', lastName: 'El Fassi', cinNumber: 'BJ987654', cinExpiry: '2029-03-15', nationality: 'Marocain', dateOfBirth: '1990-06-15', docType: 'cin' }
      : { drivingLicenseNumber: 'W87654321', licenseExpiry: '2028-11-20' }
    setExtracted(prev => ({ ...prev, [type]: demo }))
    setClient(prev => ({ ...prev, ...demo }))
  }

  const allFilled = client.firstName && client.lastName && client.cinNumber && client.drivingLicenseNumber

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* CIN Scan */}
        <div className="card">
          <div className="card-header">
            <h3>National ID (CIN) or Passport</h3>
            {extracted.cin && (
              <span className="badge badge-green">
                <CheckCircle size={11} /> {extracted.cin.docType === 'passport' ? 'Passport MRZ' : 'CIN'} scanned
              </span>
            )}
          </div>
          <div className="card-body">
            <div className={`scan-zone${scanning && scanType === 'cin' ? ' scanning' : ''}`}
              onClick={() => !scanning && cinRef.current?.click()}>
              <div className="scan-icon">🪪</div>
              <div className="scan-title">Upload CIN / Passport</div>
              <div className="scan-hint">Click to browse or drag & drop (JPG, PNG)</div>
              {scanning && scanType === 'cin' && (
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              )}
            </div>
            {ocrError && scanType === 'cin' && (
              <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{ocrError}</div>
            )}
            <input ref={cinRef} type="file" accept="image/*" style={{ display:'none' }}
              onChange={e => handleFile('cin', e.target.files[0])} />
            <button className="btn btn-secondary btn-sm mt-2" style={{ width:'100%' }}
              onClick={() => simulateScan('cin')}>
              <Camera size={13} /> Demo: Simulate Scan
            </button>
          </div>
        </div>

        {/* License Scan */}
        <div className="card">
          <div className="card-header">
            <h3>Driving License (Permis)</h3>
            {extracted.license && <span className="badge badge-green"><CheckCircle size={11} /> Permis scanned</span>}
          </div>
          <div className="card-body">
            <div className={`scan-zone${scanning && scanType === 'license' ? ' scanning' : ''}`}
              onClick={() => !scanning && licRef.current?.click()}>
              <div className="scan-icon">🪙</div>
              <div className="scan-title">Upload Driving License</div>
              <div className="scan-hint">Front side of the Moroccan permis de conduire</div>
              {scanning && scanType === 'license' && (
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              )}
            </div>
            {ocrError && scanType === 'license' && (
              <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{ocrError}</div>
            )}
            <input ref={licRef} type="file" accept="image/*" style={{ display:'none' }}
              onChange={e => handleFile('license', e.target.files[0])} />
            <button className="btn btn-secondary btn-sm mt-2" style={{ width:'100%' }}
              onClick={() => simulateScan('license')}>
              <Camera size={13} /> Demo: Simulate Scan
            </button>
          </div>
        </div>
      </div>

      {/* Extracted / Editable fields */}
      <div className="card">
        <div className="card-header">
          <h3>Client Information</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Review and correct OCR results</span>
        </div>
        <div className="card-body">
          <div className="form-row cols-3">
            {[
              { label: 'First Name *', key: 'firstName' },
              { label: 'Last Name *', key: 'lastName' },
              { label: 'Nationality', key: 'nationality' },
            ].map(({ label, key }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={client[key]} onChange={e => setClient(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            {[
              { label: 'CIN / Passport Number *', key: 'cinNumber' },
              { label: 'CIN Expiry Date', key: 'cinExpiry', type: 'date' },
              { label: 'Driving License Number *', key: 'drivingLicenseNumber' },
              { label: 'License Expiry Date', key: 'licenseExpiry', type: 'date' },
            ].map(({ label, key, type = 'text' }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input text-mono" type={type} value={client[key]} onChange={e => setClient(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            {[
              { label: 'Phone', key: 'phone' },
              { label: 'Email', key: 'email' },
            ].map(({ label, key }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={client[key]} onChange={e => setClient(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            <div className="form-group">
              <label className="form-label">Date de naissance</label>
              <input className="form-input text-mono" type="date" value={client.dateOfBirth}
                onChange={e => setClient(p => ({ ...p, dateOfBirth: e.target.value }))} />
            </div>
          </div>
          <div className="alert alert-info mt-2" style={{ fontSize: 12 }}>
            <AlertCircle size={14} />
            <span>Per Loi 09-08 (CNDP), only extracted text fields are stored — no raw ID images saved.</span>
          </div>
        </div>
      </div>

      <ClientAlerts client={client} />

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" disabled={!allFilled} onClick={() => onNext(client)}>
          Continue <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Rental Details ───────────────────────────────
function RentalStep({ client, onNext, onBack }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    startDate: today, endDate: '', vehicleId: '',
    startTime: '09:00', endTime: '09:00', fuelLevel: 'Plein',
    paymentMethod: 'Carte bancaire', deposit: 2400,
    pai: false, cdw: true,
    pickupLocation: '', returnLocation: '',
  })
  const [vehicles, setVehicles] = useState([])
  const [vehicle, setVehicle] = useState(null)

  const search = () => {
    if (!form.startDate || !form.endDate) return
    setVehicles(getAvailableVehicles(form.startDate, form.endDate))
  }

  const selectVehicle = (v) => {
    setVehicle(v)
    setForm(p => ({ ...p, vehicleId: v.id }))
  }

  const days = form.startDate && form.endDate
    ? Math.max(1, Math.ceil((new Date(form.endDate) - new Date(form.startDate)) / 86400000))
    : 0
  const totalHT  = vehicle ? vehicle.dailyRate * days : 0
  const extras   = (form.pai ? 50 * days : 0) + (form.cdw ? 80 * days : 0)
  const totalTTC = Math.round((totalHT + extras) * 1.2)
  const tva      = Math.round((totalHT + extras) * 0.2)

  const dateValid = !form.startDate || !form.endDate || form.endDate >= form.startDate
  const canContinue = vehicle && form.startDate && form.endDate && dateValid && days > 0

  const handleNext = () => {
    onNext({ ...form, vehicle, days, totalHT: totalHT + extras, tva, totalTTC })
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
          <button className="btn btn-secondary" onClick={search} disabled={!form.startDate || !form.endDate}>
            Search Available Vehicles
          </button>

          {vehicles.length > 0 && (
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

          {vehicles.length === 0 && form.startDate && form.endDate && (
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
            <div style={{ display:'flex', gap:16 }}>
              {[
                { key:'cdw', label:'CDW — Collision Damage Waiver', sub:'+80 MAD/day' },
                { key:'pai', label:'PAI — Passenger Accident Insurance', sub:'+50 MAD/day' },
              ].map(({ key, label, sub }) => (
                <label key={key} style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', flex:1,
                  background: form[key] ? 'var(--green-bg)' : 'var(--bg)',
                  border: `1px solid ${form[key] ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                  <input type="checkbox" checked={form[key]} onChange={e => setForm(p => ({...p, [key]: e.target.checked}))} style={{ marginTop:2 }} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Price Summary</h3></div>
          <div className="card-body">
            {[
              { label: 'Vehicle rental', value: `${vehicle?.dailyRate || 0} × ${days} days`, amount: totalHT },
              ...(form.cdw ? [{ label: 'CDW insurance', value: `80 × ${days} days`, amount: 80*days }] : []),
              ...(form.pai ? [{ label: 'PAI insurance', value: `50 × ${days} days`, amount: 50*days }] : []),
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

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:16 }}>
        <button className="btn btn-ghost btn-lg" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <button className="btn btn-primary btn-lg" disabled={!canContinue} onClick={handleNext}>
          Generate Contract <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Car diagram SVG ───────────────────────────────────────
function CarDiagram({ activeSlot, takenSlots }) {
  const zone = (id) => {
    if (activeSlot === id) return { fill: '#ef4444', fillOpacity: 0.55 }
    if (takenSlots?.[id])  return { fill: '#22c55e', fillOpacity: 0.40 }
    return { fill: 'transparent', fillOpacity: 0 }
  }

  return (
    <svg viewBox="0 0 120 210" style={{ width: 130, height: 195, flexShrink: 0 }}>
      <defs>
        <clipPath id="bodyClip">
          <rect x="26" y="20" width="68" height="164" rx="14" />
        </clipPath>
      </defs>

      {/* Body base */}
      <rect x="26" y="20" width="68" height="164" rx="14" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.5" />

      {/* Zone overlays — clipped to body shape */}
      <g clipPath="url(#bodyClip)">
        {/* front hood */}
        <rect x="26" y="20" width="68" height="52" {...zone('front')} />
        {/* rear trunk */}
        <rect x="26" y="132" width="68" height="52" {...zone('rear')} />
        {/* left side */}
        <rect x="26" y="60" width="30" height="84" {...zone('left')} />
        {/* right side */}
        <rect x="64" y="60" width="30" height="84" {...zone('right')} />
        {/* interior */}
        <rect x="34" y="62" width="52" height="80" {...zone('interior')} />
      </g>

      {/* Windshields */}
      <rect x="34" y="34" width="52" height="24" rx="4" fill="#bfdbfe" fillOpacity="0.85" stroke="#93c5fd" strokeWidth="0.8" />
      <rect x="34" y="146" width="52" height="24" rx="4" fill="#bfdbfe" fillOpacity="0.85" stroke="#93c5fd" strokeWidth="0.8" />

      {/* Wheels */}
      <rect x="11" y="32" width="16" height="22" rx="4" fill="#374151" />
      <rect x="93" y="32" width="16" height="22" rx="4" fill="#374151" />
      <rect x="11" y="150" width="16" height="22" rx="4" fill="#374151" />
      <rect x="93" y="150" width="16" height="22" rx="4" fill="#374151" />

      {/* Body outline on top */}
      <rect x="26" y="20" width="68" height="164" rx="14" fill="none" stroke="#6b7280" strokeWidth="1.5" />

      {/* Damage: dashed border around whole car */}
      {activeSlot === 'damage' && (
        <rect x="26" y="20" width="68" height="164" rx="14" fill="none"
          stroke="#ef4444" strokeWidth="2.5" strokeDasharray="5,3" />
      )}

      {/* Active zone labels */}
      {activeSlot === 'front'    && <text x="60" y="51"  textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">AVANT</text>}
      {activeSlot === 'rear'     && <text x="60" y="163" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">ARRIÈRE</text>}
      {activeSlot === 'left'     && <text x="41" y="105" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">G</text>}
      {activeSlot === 'right'    && <text x="79" y="105" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">D</text>}
      {activeSlot === 'interior' && <text x="60" y="105" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">INT.</text>}
      {activeSlot === 'damage'   && <text x="60" y="105" textAnchor="middle" fontSize="7" fill="#ef4444" fontWeight="bold">DOMMAGE</text>}

      {/* Direction labels */}
      <text x="60" y="14"  textAnchor="middle" fontSize="7" fill="#9ca3af">▲ Avant</text>
      <text x="60" y="204" textAnchor="middle" fontSize="7" fill="#9ca3af">Arrière</text>
    </svg>
  )
}

// ── Step 3: Vehicle Photos ───────────────────────────────
function PhotoStep({ onNext, onBack }) {
  const [photos,     setPhotos]     = useState({})
  const [loading,    setLoading]    = useState({})
  const [activeSlot, setActiveSlot] = useState(null)
  const refs = useRef({})

  const capture = async (id, file) => {
    if (!file) return
    setLoading(p => ({ ...p, [id]: true }))
    const compressed = await compressImage(file)
    if (!compressed) {
      setLoading(p => ({ ...p, [id]: false }))
      return
    }
    const dataUrl = compressed
    setPhotos(p => ({ ...p, [id]: dataUrl }))
    setLoading(p => ({ ...p, [id]: false }))
    setActiveSlot(null)
  }

  const triggerCapture = (id) => {
    setActiveSlot(id)
    refs.current[id]?.click()
  }

  const takenCount = Object.keys(photos).length

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>

        {/* Car diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Guide visuel
          </div>
          <CarDiagram activeSlot={activeSlot} takenSlots={photos} />
          <div style={{
            minHeight: 20, fontSize: 12, fontWeight: 600,
            color: activeSlot ? '#ef4444' : 'var(--text3)',
            textAlign: 'center',
          }}>
            {activeSlot
              ? `📷 ${PHOTO_SLOTS.find(s => s.id === activeSlot)?.label}`
              : takenCount > 0
                ? `${takenCount} / ${PHOTO_SLOTS.length} photos`
                : 'Appuyez sur une zone'}
          </div>
        </div>

        {/* Photo slots */}
        <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {PHOTO_SLOTS.map(({ id, label }) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div
                onClick={() => triggerCapture(id)}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: photos[id]
                    ? '2px solid var(--green)'
                    : activeSlot === id
                      ? '2px solid #ef4444'
                      : '2px dashed var(--border)',
                  background: activeSlot === id ? '#fef2f2' : 'var(--bg2)',
                  cursor: 'pointer',
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {photos[id] ? (
                  <img src={photos[id]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : loading[id] ? (
                  <div style={{ fontSize: 24, opacity: 0.5 }}>⏳</div>
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CarPhotoGuide slotId={id} />
                  </div>
                )}
                {photos[id] && (
                  <div style={{
                    position: 'absolute', bottom: 4, right: 4,
                    background: 'var(--green)', borderRadius: '50%',
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckCircle size={11} color="#fff" />
                  </div>
                )}
              </div>
              <input
                ref={el => refs.current[id] = el}
                type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => capture(id, e.target.files[0])}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
                {photos[id] && (
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 10 }}
                    onClick={() => triggerCapture(id)}>
                    <Camera size={10} /> Reprendre
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {takenCount > 0 && (
        <div className="alert alert-success mb-4" style={{ fontSize: 12 }}>
          <CheckCircle size={14} />
          <span>{takenCount} photo{takenCount > 1 ? 's' : ''} prise{takenCount > 1 ? 's' : ''}. Elles seront incluses dans le contrat PDF.</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-lg" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <button className="btn btn-primary btn-lg" onClick={() => onNext(photos)}>
          {takenCount === 0 ? 'Passer' : 'Continuer'} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Contract Preview ─────────────────────────────
function ContractStep({ client, rental, photos, onNext, onBack }) {
  const agency = getAgency()
  const [saved, setSaved] = useState(false)
  const [contract, setContract] = useState(null)

  const confirmAndSave = () => {
    const savedClient = saveClient(client)
    const c = saveContract({
      clientId: savedClient.id,
      clientName: `${client.firstName} ${client.lastName}`,
      vehicleId: rental.vehicle.id,
      vehicleName: `${rental.vehicle.make} ${rental.vehicle.model}`,
      ...rental,
      photos,
      status: 'active',
    })
    const fleet = getFleet()
    const v = fleet.find(veh => veh.id === rental.vehicle?.id || veh.id === rental.vehicleId)
    if (v) saveVehicle({ ...v, status: 'rented' })
    setContract(c)
    setSaved(true)
  }

  const download = () => {
    if (!contract) return
    generateContract(contract, client, rental.vehicle, agency)
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <h3>Contract Preview</h3>
          {saved && <span className="badge badge-green"><CheckCircle size={11} /> Saved</span>}
        </div>
        <div className="card-body">
          <div className="contract-preview">
            <h3>{agency.name || 'Car Rental Agency'}</h3>
            <div className="subtitle">{agency.address} — {agency.phone}</div>
            <h3 style={{ marginTop: 8 }}>CONTRAT DE LOCATION DE VÉHICULE</h3>
            <div className="subtitle">Location sans chauffeur — Maroc</div>

            <div className="section-title">Article 1 — Parties</div>
            <div className="contract-row"><span className="cl">Loueur:</span><span className="cv">{agency.name}</span></div>
            <div className="contract-row"><span className="cl">RC / ICE:</span><span className="cv">{agency.rc} / {agency.ice}</span></div>
            <div className="contract-row"><span className="cl">Locataire:</span><span className="cv">{client.firstName} {client.lastName}</span></div>
            <div className="contract-row"><span className="cl">CIN / Passeport:</span><span className="cv">{client.cinNumber}</span></div>
            <div className="contract-row"><span className="cl">Permis de conduire:</span><span className="cv">{client.drivingLicenseNumber}</span></div>
            <div className="contract-row"><span className="cl">Tél / Email:</span><span className="cv">{client.phone} / {client.email}</span></div>

            <div className="section-title">Article 2 — Véhicule</div>
            <div className="contract-row"><span className="cl">Véhicule:</span><span className="cv">{rental.vehicle.make} {rental.vehicle.model} ({rental.vehicle.year})</span></div>
            <div className="contract-row"><span className="cl">Immatriculation:</span><span className="cv">{rental.vehicle.plate}</span></div>
            <div className="contract-row"><span className="cl">Carburant:</span><span className="cv">{rental.vehicle.fuelType}</span></div>

            <div className="section-title">Article 3 — Conditions de location</div>
            <div className="contract-row"><span className="cl">Période:</span><span className="cv">{rental.startDate} → {rental.endDate} ({rental.days} jours)</span></div>
            <div className="contract-row"><span className="cl">Lieu de départ:</span><span className="cv">{rental.pickupLocation || agency.city}</span></div>
            <div className="contract-row"><span className="cl">Lieu de retour:</span><span className="cv">{rental.returnLocation || agency.city}</span></div>

            <div className="section-title">Article 4 — Tarif et caution</div>
            <div className="contract-row"><span className="cl">Tarif journalier:</span><span className="cv">{rental.vehicle.dailyRate} MAD/jour</span></div>
            <div className="contract-row"><span className="cl">Total TTC:</span><span className="cv">{rental.totalTTC} MAD</span></div>
            <div className="contract-row"><span className="cl">Caution:</span><span className="cv">{rental.deposit} MAD</span></div>
            <div className="contract-row"><span className="cl">Paiement:</span><span className="cv">{rental.paymentMethod}</span></div>

            <div className="section-title">Article 5 — Assurance</div>
            <div className="contract-row"><span className="cl">Responsabilité civile:</span><span className="cv">Incluse</span></div>
            <div className="contract-row"><span className="cl">CDW:</span><span className="cv">{rental.cdw ? 'Incluse' : 'Non souscrite'}</span></div>
            <div className="contract-row"><span className="cl">PAI:</span><span className="cv">{rental.pai ? 'Incluse' : 'Non souscrite'}</span></div>

            <div className="section-title">Article 6 — Clauses légales</div>
            <div className="contract-clause">• Le locataire s'engage à utiliser le véhicule conformément au Code de la Route marocain et ne peut quitter le territoire national sans autorisation écrite.</div>
            <div className="contract-clause">• En cas d'accident : déclaration obligatoire dans les 24h, constat écrit sous 48h. Le locataire est seul responsable des amendes et contraventions.</div>
            <div className="contract-clause">• Toute journée commencée est due. La location est calculée par tranches de 24h depuis l'heure de prise en charge.</div>
            <div className="contract-clause">• Protection des données (Loi 09-08 — CNDP) : Les données collectées sont traitées par {agency.name} dans le cadre exclusif de la location et conservées 5 ans. Le locataire dispose d'un droit d'accès, de rectification et d'opposition.</div>
            <div className="contract-clause">• En cas de litige, les tribunaux de {agency.city || 'Casablanca'} seront seuls compétents.</div>

            <div style={{ marginTop: 24, display:'flex', justifyContent:'space-between' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ borderTop:'1px solid #999', width:160, marginBottom:4 }} />
                <div style={{ fontSize:11, color:'#666' }}>Signature du loueur</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ borderTop:'1px solid #999', width:160, marginBottom:4 }} />
                <div style={{ fontSize:11, color:'#666' }}>Signature du locataire (Lu et approuvé)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <button className="btn btn-ghost btn-lg" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <div style={{ display:'flex', gap:10 }}>
          {saved ? (
            <>
              <button className="btn btn-secondary" onClick={download}><Download size={14} /> Download PDF</button>
              <button className="btn btn-primary btn-lg" onClick={() => onNext(contract)}>
                Generate Invoice <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={confirmAndSave}>
              <CheckCircle size={15} /> Confirm & Save Contract
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 4: Invoice ──────────────────────────────────────
function InvoiceStep({ client, rental, contract, onDone }) {
  const agency = getAgency()
  const [invoice, setInvoice] = useState(null)

  const generate = () => {
    const inv = saveInvoice({
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      clientId: contract.clientId,
      clientName: `${client.firstName} ${client.lastName}`,
      vehicleName: `${rental.vehicle.make} ${rental.vehicle.model}`,
      totalHT: rental.totalHT,
      tva: rental.tva,
      totalTTC: rental.totalTTC,
      days: rental.days,
      startDate: rental.startDate,
      endDate: rental.endDate,
      status: 'paid',
    })
    setInvoice(inv)
    generateInvoice(inv, contract, client, rental.vehicle, agency)
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <h3>Invoice Summary</h3>
          {invoice && <span className="badge badge-green"><CheckCircle size={11} /> Generated</span>}
        </div>
        <div className="card-body">
          <div style={{ maxWidth: 480 }}>
            {[
              { label: 'Client', value: `${client.firstName} ${client.lastName}` },
              { label: 'Contract', value: contract.contractNumber },
              { label: 'Vehicle', value: `${rental.vehicle.make} ${rental.vehicle.model} — ${rental.vehicle.plate}` },
              { label: 'Period', value: `${rental.startDate} → ${rental.endDate} (${rental.days} days)` },
              { label: 'Total HT', value: `${rental.totalHT} MAD` },
              { label: 'TVA (20%)', value: `${rental.tva} MAD` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ color:'var(--text3)' }}>{label}</span>
                <span style={{ fontWeight:500 }}>{value}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 0 0', fontSize:18, fontWeight:700 }}>
              <span>Total TTC</span>
              <span className="text-mono" style={{ color:'var(--accent)' }}>{rental.totalTTC} MAD</span>
            </div>
          </div>

          {invoice && (
            <div className="alert alert-success mt-4">
              <CheckCircle size={14} />
              <span>Invoice <strong>{invoice.invoiceNumber}</strong> generated and downloaded as PDF.</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div />
        <div style={{ display:'flex', gap:10 }}>
          {!invoice ? (
            <button className="btn btn-primary btn-lg" onClick={generate}>
              <Printer size={15} /> Generate & Download Invoice
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => generateInvoice(invoice, contract, client, rental.vehicle, agency)}>
                <Download size={14} /> Re-download PDF
              </button>
              <button className="btn btn-primary btn-lg" onClick={onDone}>
                <CheckCircle size={15} /> Finish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Wizard ──────────────────────────────────────────
const DRAFT_KEY = 'rf_new_rental_draft'

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { return null }
}
function saveDraft(data) {
  try {
    // Strip photos from draft to avoid localStorage quota issues
    const { photos, ...rest } = data
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rest))
  } catch (e) {
    // QuotaExceededError — draft not saved, silently continue
    console.warn('Draft not saved (storage full):', e.message)
  }
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

export default function NewRental({ onDone }) {
  const draft = loadDraft()
  const [resumePrompt, setResumePrompt] = useState(!!draft)

  const [step,     setStep]     = useState(draft?.step     ?? 0)
  const [client,   setClient]   = useState(draft?.client   ?? null)
  const [rental,   setRental]   = useState(draft?.rental   ?? null)
  const [photos,   setPhotos]   = useState(draft?.photos   ?? {})
  const [contract, setContract] = useState(draft?.contract ?? null)

  const persist = (patch) => {
    saveDraft({ step, client, rental, photos, contract, ...patch })
  }

  const advance = (patch) => {
    const next = { step, client, rental, photos, contract, ...patch }
    saveDraft(next)
    if (patch.step !== undefined) setStep(patch.step)
    if (patch.client   !== undefined) setClient(patch.client)
    if (patch.rental   !== undefined) setRental(patch.rental)
    if (patch.photos   !== undefined) setPhotos(patch.photos)
    if (patch.contract !== undefined) setContract(patch.contract)
  }

  const handleQuit = () => {
    persist({})
    onDone()
  }

  const handleDiscard = () => {
    clearDraft()
    setResumePrompt(false)
    setStep(0); setClient(null); setRental(null); setPhotos({}); setContract(null)
  }

  const handleDone = () => {
    clearDraft()
    onDone()
  }

  if (resumePrompt) {
    const stepLabel = STEPS[draft.step] || 'Début'
    const clientName = draft.client ? `${draft.client.firstName} ${draft.client.lastName}` : null
    return (
      <div>
        <div className="page-header">
          <div><h2>New Rental</h2><p>Un brouillon a été trouvé</p></div>
        </div>
        <div className="page-body">
          <div className="card" style={{ maxWidth: 480, margin: '40px auto', padding: 28 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <h3 style={{ marginBottom: 6 }}>Reprendre le brouillon ?</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>
              Vous avez une location non finalisée enregistrée à l'étape&nbsp;
              <strong>{stepLabel}</strong>.
            </p>
            {clientName && (
              <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 16 }}>
                Client : {clientName}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setResumePrompt(false)}>
                Reprendre
              </button>
              <button className="btn btn-secondary" onClick={handleDiscard}>
                Nouveau
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>New Rental</h2>
          <p>Complete all steps to generate the contract and invoice</p>
        </div>
        {step < 4 && (
          <button className="btn btn-ghost" onClick={handleQuit} title="Sauvegarder et quitter">
            💾 Quitter & sauvegarder
          </button>
        )}
      </div>
      <div className="page-body">
        <StepBar current={step} />
        {step === 0 && <ScanStep onNext={c => advance({ client: c, step: 1 })} />}
        {step === 1 && <RentalStep client={client} onNext={r => advance({ rental: r, step: 2 })} onBack={() => advance({ step: 0 })} />}
        {step === 2 && <PhotoStep onNext={p => advance({ photos: p, step: 3 })} onBack={() => advance({ step: 1 })} />}
        {step === 3 && <ContractStep client={client} rental={rental} photos={photos} onNext={c => advance({ contract: c, step: 4 })} onBack={() => advance({ step: 2 })} />}
        {step === 4 && <InvoiceStep client={client} rental={rental} contract={contract} onDone={handleDone} />}
      </div>
    </div>
  )
}
