import { useState, useRef } from 'react'
import { Camera, CheckCircle, AlertCircle, ArrowRight, X } from 'lucide-react'
import { runOCR } from '../../lib/ocr'
import ClientAlerts from './ClientAlerts'
import StepButtons from './StepButtons'

export default function ScanStep({ onNext, onSaveAndQuit, onCancel }) {
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
      : { drivingLicenseNumber: 'W87654321', licenseExpiry: '2028-11-20', dateOfBirth: '1990-06-15' }
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

      <StepButtons
        leftBtns={
          <button className="btn btn-primary btn-lg" style={{ color: '#dc2626' }} onClick={onCancel}>
            <X size={15} /> Annuler
          </button>
        }
        rightBtns={
          <>
            <button className="btn btn-ghost" onClick={onSaveAndQuit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              💾 Sauvegarder & quitter
            </button>
            <button className="btn btn-primary btn-lg" disabled={!allFilled} onClick={() => onNext(client)}>
              Continuer <ArrowRight size={15} />
            </button>
          </>
        }
      />
    </div>
  )
}
