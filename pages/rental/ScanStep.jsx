import { useRef, useEffect } from 'react'
import { Camera, CheckCircle, AlertCircle, ArrowRight, X, PenLine } from 'lucide-react'
import { useScannerFlow } from '../../src/hooks/useScannerFlow'
import ClientAlerts from './ClientAlerts'
import StepButtons from './StepButtons'

export default function ScanStep({ onNext, onSaveAndQuit, onCancel, initialClient }) {
  const cinRef = useRef()
  const licRef = useRef()

  const {
    clientData,
    scanning,
    progress,
    activeScanType,
    scanError,
    extracted,
    scanAttemptCount,
    showManualEntryPrompt,
    manualEntrySlot,
    startScan,
    updateField,
    dismissManualEntryPrompt,
    resetAttemptCount,
  } = useScannerFlow(initialClient || {
    firstName: '', lastName: '', cinNumber: '', cinExpiry: '',
    drivingLicenseNumber: '', licenseExpiry: '', nationality: 'Marocain', dateOfBirth: '',
  })

  // Reset attempt counter when the user switches document type
  // (detected by the file input changing — handled in handleFile)

  const handleFile = async (type, file) => {
    if (!file || scanning) return
    await startScan(type, file)
  }

  const allFilled = clientData.firstName && clientData.lastName &&
    clientData.cinNumber && clientData.drivingLicenseNumber

  return (
    <div>
      {/* Manual-entry prompt modal */}
      {showManualEntryPrompt && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div className="card" style={{ maxWidth: 420, width: '90%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PenLine size={18} style={{ color: 'var(--accent)' }} />
                Saisie manuelle recommandée
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={dismissManualEntryPrompt}>
                <X size={14} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
              Après {scanAttemptCount[manualEntrySlot ?? 'cin']} tentatives, le scanner n'a pas pu extraire
              tous les champs du {manualEntrySlot === 'license' ? 'permis de conduire' : 'CIN / passeport'}.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
              Pour gagner du temps, remplissez les champs directement dans le formulaire ci-dessous.
              Vous pouvez également réessayer avec une photo plus lumineuse.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={dismissManualEntryPrompt}>
                <PenLine size={13} /> Saisir manuellement
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                if (manualEntrySlot) resetAttemptCount(manualEntrySlot)
                dismissManualEntryPrompt()
              }}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* CIN Scan */}
        <div className="card">
          <div className="card-header">
            <h3>Carte nationale (CIN) ou Passeport</h3>
            {extracted.cin && (
              <span className="badge badge-green">
                <CheckCircle size={11} /> {extracted.cin.docType === 'passport' ? 'Passport MRZ' : 'CIN'} scanné
              </span>
            )}
            {scanAttemptCount.cin > 0 && !extracted.cin && (
              <span className="badge badge-orange" title={`${scanAttemptCount.cin} tentative(s)`}>
                {scanAttemptCount.cin}/{5}
              </span>
            )}
          </div>
          <div className="card-body">
            <div
              className={`scan-zone${scanning && activeScanType === 'cin' ? ' scanning' : ''}`}
              onClick={() => !scanning && cinRef.current?.click()}
            >
              <div className="scan-icon">🪪</div>
              <div className="scan-title">Importer CIN / Passeport</div>
              <div className="scan-hint">Cliquez ou déposez un fichier (JPG, PNG)</div>
              {scanning && activeScanType === 'cin' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            {scanError && activeScanType === 'cin' && (
              <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{scanError}</div>
            )}
            <input
              ref={cinRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile('cin', e.target.files?.[0])}
            />
          </div>
        </div>

        {/* License Scan */}
        <div className="card">
          <div className="card-header">
            <h3>Permis de conduire</h3>
            {extracted.license && (
              <span className="badge badge-green"><CheckCircle size={11} /> Permis scanné</span>
            )}
            {scanAttemptCount.license > 0 && !extracted.license && (
              <span className="badge badge-orange" title={`${scanAttemptCount.license} tentative(s)`}>
                {scanAttemptCount.license}/{5}
              </span>
            )}
          </div>
          <div className="card-body">
            <div
              className={`scan-zone${scanning && activeScanType === 'license' ? ' scanning' : ''}`}
              onClick={() => !scanning && licRef.current?.click()}
            >
              <div className="scan-icon">🪙</div>
              <div className="scan-title">Importer le permis</div>
              <div className="scan-hint">Recto du permis marocain ou européen</div>
              {scanning && activeScanType === 'license' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            {scanError && activeScanType === 'license' && (
              <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{scanError}</div>
            )}
            <input
              ref={licRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile('license', e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      {/* Extracted / Editable fields */}
      <div className="card">
        <div className="card-header">
          <h3>Informations client</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Vérifiez et corrigez les résultats OCR</span>
        </div>
        <div className="card-body">
          <div className="form-row cols-3">
            {[
              { label: 'Prénom *', key: 'firstName' },
              { label: 'Nom *', key: 'lastName' },
              { label: 'Nationalité', key: 'nationality' },
            ].map(({ label, key }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className="form-input"
                  value={clientData[key] ?? ''}
                  onChange={e => updateField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            {[
              { label: 'N° CIN / Passeport *', key: 'cinNumber' },
              { label: 'Expiration CIN', key: 'cinExpiry', type: 'date' },
              { label: 'N° Permis de conduire *', key: 'drivingLicenseNumber' },
              { label: 'Expiration permis', key: 'licenseExpiry', type: 'date' },
            ].map(({ label, key, type = 'text' }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className="form-input text-mono"
                  type={type}
                  value={clientData[key] ?? ''}
                  onChange={e => updateField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            {[
              { label: 'Téléphone', key: 'phone' },
              { label: 'Email', key: 'email' },
            ].map(({ label, key }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className="form-input"
                  value={clientData[key] ?? ''}
                  onChange={e => updateField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="form-row cols-2">
            <div className="form-group">
              <label className="form-label">Date de naissance</label>
              <input
                className="form-input text-mono"
                type="date"
                value={clientData.dateOfBirth ?? ''}
                onChange={e => updateField('dateOfBirth', e.target.value)}
              />
            </div>
          </div>
          <div className="alert alert-info mt-2" style={{ fontSize: 12 }}>
            <AlertCircle size={14} />
            <span>Conformément à la Loi 09-08 (CNDP), seuls les champs texte extraits sont conservés — aucune image de document n'est stockée.</span>
          </div>
        </div>
      </div>

      <ClientAlerts client={clientData} />

      <StepButtons
        leftBtns={
          <button className="btn btn-primary btn-lg" style={{ color: '#dc2626' }} onClick={onCancel}>
            <X size={15} /> Annuler
          </button>
        }
        rightBtns={
          <>
            <button className="btn btn-ghost" onClick={() => onSaveAndQuit(clientData)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              💾 Sauvegarder & quitter
            </button>
            <button className="btn btn-primary btn-lg" disabled={!allFilled} onClick={() => onNext(clientData)}>
              Continuer <ArrowRight size={15} />
            </button>
          </>
        }
      />
    </div>
  )
}
