import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, ArrowRight, ArrowLeft, Download } from 'lucide-react'
import { updateContract, saveInvoice, getFleet, saveVehicle, getAgency } from '../lib/db'
import CarPhotoGuide from '../components/CarPhotoGuide'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// ── Constants ─────────────────────────────────────────────

const STEPS = ['return', 'photos', 'inspection', 'closure']

const PHOTO_SLOTS = [
  { id: 'front' },
  { id: 'rear' },
  { id: 'left' },
  { id: 'right' },
  { id: 'interior' },
  { id: 'damage' },
]

const ZONES = ['A', 'B', 'C', 'D', 'E']

const FUEL_LEVELS = { 'Vide': 0, '1/4': 1, '1/2': 2, '3/4': 3, 'Plein': 4 }
const FUEL_OPTIONS = ['Vide', '1/4', '1/2', '3/4', 'Plein']

// ── Helpers ───────────────────────────────────────────────

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
    img.src = url
  })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

// ── Shared fee computation ────────────────────────────────

function computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee = 0 }) {
  const startMileage = contract.startMileage || contract.mileageOut || 0
  const startDate = contract.startDate
  const endDate = contract.endDate || today()
  const contractDays = Math.max(1, daysBetween(startDate, endDate))
  const kmDriven = Math.max(0, (returnMileage || 0) - startMileage)
  const departureLevel = contract.fuelLevel || 'Plein'

  let extraKm = 0
  let extraKmFee = 0
  let kmAllowed = 0
  if (vehicle?.maxKmEnabled && vehicle?.maxKmPerDay) {
    kmAllowed = vehicle.maxKmPerDay * contractDays
    extraKm = Math.max(0, kmDriven - kmAllowed)
    extraKmFee = extraKm * 2
  }

  const fuelDiff = Math.max(0, (FUEL_LEVELS[departureLevel] || 0) - (FUEL_LEVELS[returnFuelLevel] || 0))
  const fuelFee = fuelDiff * 100
  const totalExtraFees = extraKmFee + fuelFee + (Number(damageFee) || 0)

  return { extraKm, extraKmFee, kmAllowed, kmDriven, fuelDiff, fuelFee, totalExtraFees, contractDays }
}

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

// ── PDF Generation ────────────────────────────────────────

function generateRestitutionPDF({ agency = {}, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
  returnPhotos, returnDamages, extraKmFee, fuelFee, damageFee, totalExtraFees, extraKm, fuelDiff }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const ACCENT = [199, 75, 31]
  const DARK   = [28, 26, 22]
  const GRAY   = [120, 116, 108]
  const LIGHT  = [245, 243, 238]

  // Header band
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PROCÈS-VERBAL DE RESTITUTION', 14, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(agency.name || 'Agence', 14, 19)
  doc.text(`Contrat: ${contract.contractNumber || '—'}`, 14, 24)
  doc.setTextColor(...DARK)

  let y = 36

  // Client & Vehicle info
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('CLIENT', 14, y)
  doc.text('VÉHICULE', 110, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(contract.clientName || '—', 14, y)
  doc.text(contract.vehicleName || '—', 110, y)
  y += 5

  // Départ vs Retour table
  y += 4
  doc.autoTable({
    startY: y,
    head: [['', 'Départ', 'Retour']],
    body: [
      ['Date', fmtDate(contract.startDate), fmtDate(returnDate)],
      ['Heure', contract.startTime || '—', returnTime || '—'],
      ['Kilométrage', `${contract.startMileage || contract.mileageOut || '—'} km`, `${returnMileage || '—'} km`],
      ['Carburant', contract.fuelLevel || '—', returnFuelLevel || '—'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 8

  // Damages table
  const damagedZones = (returnDamages || []).filter(d => d.checked)
  if (damagedZones.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY)
    doc.text('DOMMAGES CONSTATÉS', 14, y)
    y += 3
    doc.autoTable({
      startY: y,
      head: [['Zone', 'Description']],
      body: damagedZones.map(d => [d.zone, d.description || '—']),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [180, 60, 20], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // Fees table
  const feeRows = []
  if (extraKmFee > 0) feeRows.push([`Km supplémentaires (${extraKm} km × 2 MAD)`, `${extraKmFee} MAD`])
  if (fuelFee > 0) feeRows.push([`Manque carburant (${fuelDiff} quart(s) × 100 MAD)`, `${fuelFee} MAD`])
  if (damageFee > 0) feeRows.push([`Frais dommages`, `${damageFee} MAD`])
  feeRows.push([{ content: 'TOTAL FRAIS SUPPLÉMENTAIRES', styles: { fontStyle: 'bold' } }, { content: `${totalExtraFees} MAD`, styles: { fontStyle: 'bold' } }])

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('FRAIS SUPPLÉMENTAIRES', 14, y)
  y += 3
  doc.autoTable({
    startY: y,
    body: feeRows,
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 12

  // Signature boxes
  if (y > 230) { doc.addPage(); y = 20 }
  doc.setDrawColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('Signature Locataire', 14, y)
  doc.text('Signature Agence', 120, y)
  y += 3
  doc.rect(14, y, 80, 28)
  doc.rect(120, y, 80, 28)

  doc.save(`restitution-${contract.contractNumber || 'doc'}.pdf`)
}

// ── Step 1: Retour kilométrage & carburant ────────────────

function Step1Return({ contract, data, onChange, onNext }) {
  const { t } = useTranslation('restitution')
  const startMileage = contract.startMileage || contract.mileageOut || 0
  const departureLevel = contract.fuelLevel || 'Plein'
  const kmDriven = data.returnMileage ? Math.max(0, data.returnMileage - startMileage) : 0
  const fuelDiff = (FUEL_LEVELS[departureLevel] || 0) - (FUEL_LEVELS[data.returnFuelLevel] || 0)

  const isValid = data.returnMileage >= startMileage && data.returnDate && data.returnTime

  return (
    <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>{t('step1.title')}</h3></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

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
            {t('nav.next')} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Photos retour ─────────────────────────────────

function Step2Photos({ contract, photos, onChange, onNext, onBack }) {
  const { t } = useTranslation('restitution')
  const fileRefs = useRef({})
  const departurePhotos = contract.photos || {}

  const handleFile = async (slotId, file) => {
    if (!file) return
    const compressed = await compressImage(file)
    onChange({ ...photos, [slotId]: compressed })
  }

  return (
    <div className="card" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>{t('step2.title')}</h3></div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {PHOTO_SLOTS.map(slot => {
            const departurePhoto = departurePhotos[slot.id]
            const returnPhoto = photos[slot.id]
            return (
              <div key={slot.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg2)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  {t(`photos.${slot.id}`)}
                </div>
                <div style={{ display: 'flex', gap: 4, padding: 8 }}>
                  {/* Departure photo */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{t('step2.departure')}</div>
                    {departurePhoto ? (
                      <img src={departurePhoto} alt="départ" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', borderRadius: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>—</span>
                      </div>
                    )}
                  </div>
                  {/* Return photo */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{t('step2.return')}</div>
                    {returnPhoto ? (
                      <div style={{ position: 'relative' }}>
                        <img src={returnPhoto} alt="retour" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }} />
                        <button
                          onClick={() => { const p = { ...photos }; delete p[slot.id]; onChange(p) }}
                          style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: 'white', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >×</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileRefs.current[slot.id]?.click()}
                        style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', borderRadius: 4, cursor: 'pointer', border: '2px dashed var(--border)' }}
                      >
                        <CarPhotoGuide slotId={slot.id} size={32} />
                      </div>
                    )}
                    <input
                      ref={el => fileRefs.current[slot.id] = el}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => handleFile(slot.id, e.target.files[0])}
                    />
                    {!returnPhoto && (
                      <button
                        className="btn btn-secondary"
                        style={{ marginTop: 4, padding: '3px 8px', fontSize: 11, width: '100%' }}
                        onClick={() => fileRefs.current[slot.id]?.click()}
                      >
                        {t('step2.add')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} /> {t('nav.prev')}
          </button>
          <button className="btn btn-primary" onClick={onNext} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.next')} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: État des lieux & frais ────────────────────────

function Step3Damages({ contract, vehicle, returnMileage, returnFuelLevel, damages, onChange, damageFee, onDamageFee, onNext, onBack }) {
  const { t } = useTranslation('restitution')
  const { extraKm, extraKmFee, kmAllowed, kmDriven, fuelDiff, fuelFee, totalExtraFees } =
    computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee })

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
          {fuelFee > 0 ? (
            <div style={{ marginBottom: 8, fontSize: 13, color: '#c2410c' }}>
              {t('step3.fuelShortage', { diff: fuelDiff, fee: fuelFee })}
            </div>
          ) : (
            <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text3)' }}>{t('step3.noFuelFee')}</div>
          )}

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
            <ArrowLeft size={16} /> {t('nav.prev')}
          </button>
          <button className="btn btn-primary" onClick={onNext} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.next')} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 4: Clôture ───────────────────────────────────────

function Step4Closure({ agency, contract, vehicle, returnDate, returnTime, returnMileage, returnFuelLevel,
  returnPhotos, damages, damageFee, onBack, onDone }) {

  const { t } = useTranslation('restitution')
  const [closing, setClosing] = useState(false)

  const startDate = contract.startDate
  const realDays = daysBetween(startDate, returnDate || today())
  const { extraKm, extraKmFee, kmDriven, fuelDiff, fuelFee, totalExtraFees } =
    computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee })
  const finalTotal = (contract.totalTTC || 0) + totalExtraFees

  const returnDamages = damages.filter(d => d.checked)

  const handleDownloadPDF = () => {
    generateRestitutionPDF({
      agency, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
      returnPhotos, returnDamages, extraKmFee, fuelFee, damageFee: damageFee || 0,
      totalExtraFees, extraKm, fuelDiff,
    })
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      // 1. Update contract
      await updateContract({
        ...contract,
        status: 'closed',
        returnDate,
        returnMileage,
        returnFuelLevel,
        returnTime,
        returnPhotos,
        returnDamages,
        extraKmFee,
        fuelFee,
        damageFee: damageFee || 0,
        totalExtraFees,
        finalTotal,
      })

      // 2. Update vehicle status to available
      const fleet = await getFleet()
      const v = fleet.find(fv => fv.id === contract.vehicleId)
      if (v) await saveVehicle({ ...v, status: 'available' })

      // 3. Save invoice if extra fees
      if (totalExtraFees > 0) {
        const invoiceItems = [
          extraKmFee > 0 ? { label: 'Km supplémentaires', qty: extraKm, unitPrice: 2 } : null,
          fuelFee > 0 ? { label: 'Manque carburant', qty: fuelDiff, unitPrice: 100 } : null,
          (damageFee || 0) > 0 ? { label: 'Frais dommages', qty: 1, unitPrice: damageFee } : null,
        ].filter(Boolean)

        await saveInvoice({
          clientId: contract.clientId,
          clientName: contract.clientName,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          vehicleName: contract.vehicleName,
          items: invoiceItems,
          totalHT: totalExtraFees / 1.20,
          tva: totalExtraFees - totalExtraFees / 1.20,
          totalTTC: totalExtraFees,
          notes: 'Frais de restitution',
        })
      }

      onDone()
    } catch (err) {
      console.error('[Restitution] handleClose', err)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="card-header">
        <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={18} color="#16a34a" /> {t('step4.title')}
        </h3>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Summary card */}
        <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.06em', marginBottom: 10 }}>
            {t('step4.summary')}
          </div>
          {[
            [t('step4.contract'), contract.contractNumber || '—'],
            [t('step4.client'), contract.clientName || '—'],
            [t('step4.vehicle'), contract.vehicleName || '—'],
            [t('step4.actualDuration'), `${realDays} jour(s)`],
            [t('step4.drivenKm'), `${kmDriven} km`],
            [t('step4.rentalAmount'), `${contract.totalTTC || 0} MAD`],
            [t('step4.extraFees'), `${totalExtraFees} MAD`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--text3)' }}>{label}</span>
              <span style={{ fontWeight: 500 }}>{value}</span>
            </div>
          ))}
          <div style={{ borderTop: '2px solid var(--border)', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
            <span>{t('step4.totalFinal')}</span>
            <span style={{ color: 'var(--accent)' }}>{finalTotal} MAD</span>
          </div>
        </div>

        {/* Damage summary if any */}
        {returnDamages.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>{t('step4.damagesFound')}</div>
            {returnDamages.map(d => (
              <div key={d.zone} style={{ fontSize: 12, marginBottom: 4 }}>
                <strong>{d.zone}</strong>{d.description ? `: ${d.description}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleDownloadPDF}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Download size={15} /> {t('step4.downloadPdf')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleClose}
            disabled={closing}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dc2626', borderColor: '#dc2626' }}
          >
            <CheckCircle size={15} /> {closing ? t('step4.closing') : t('step4.close')}
          </button>
        </div>

        <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> {t('nav.prev')}
        </button>
      </div>
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
              returnMileage={returnData.returnMileage}
              returnFuelLevel={returnData.returnFuelLevel}
              damages={damages}
              onChange={setDamages}
              damageFee={damageFee}
              onDamageFee={setDamageFee}
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
              onBack={() => setStep(2)}
              onDone={onDone}
            />
          )}
        </div>
      </div>
    </div>
  )
}
