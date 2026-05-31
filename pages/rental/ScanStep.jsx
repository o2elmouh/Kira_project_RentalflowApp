import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, CheckCircle, AlertCircle, ArrowRight, X, PenLine, Shield } from 'lucide-react'
import { useScannerFlow } from '../../src/hooks/useScannerFlow'
import ClientAlerts from './ClientAlerts'
import StepButtons from './StepButtons'
import DocumentExpiryAlert from '../../components/DocumentExpiryAlert'
import DocumentMismatchModal from '../../components/DocumentMismatchModal'
import { checkClientDocumentExpiry } from '../../utils/documentValidation'

// ── Identity-mismatch detector ────────────────────────────────────────
// Normalises a name down to a comparable token: lowercase, no diacritics,
// no punctuation, no whitespace. Lets us spot OCR-level orthographic
// drift (e.g. "El Mouhib" vs "El-Mouhib") without false positives.
const normalizeName = (s) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// Compare CIN-side identity (firstName + lastName) to the licence-side
// identity. Returns { mismatch: boolean, reason?: string } so the caller
// can decide whether to surface the modal.
function detectIdentityMismatch(cinExtracted, licenseExtracted) {
  if (!cinExtracted || !licenseExtracted) return { mismatch: false }

  const cinFirst = normalizeName(cinExtracted.firstName)
  const cinLast  = normalizeName(cinExtracted.lastName)
  const licFirst = normalizeName(licenseExtracted.firstName)
  const licLast  = normalizeName(licenseExtracted.lastName)

  // If either side has no name at all, we can't reliably compare — skip.
  if (!cinFirst || !cinLast || !licFirst || !licLast) return { mismatch: false }

  const firstMatches = cinFirst === licFirst
  const lastMatches  = cinLast === licLast
  if (firstMatches && lastMatches) return { mismatch: false }

  if (!firstMatches && !lastMatches) {
    return { mismatch: true, reason: "Le prénom et le nom diffèrent entre la pièce d'identité et le permis de conduire." }
  }
  if (!firstMatches) {
    return { mismatch: true, reason: "Le prénom diffère entre la pièce d'identité et le permis de conduire." }
  }
  return { mismatch: true, reason: "Le nom de famille diffère entre la pièce d'identité et le permis de conduire." }
}

export default function ScanStep({ onNext, onSaveAndQuit, onCancel, initialClient }) {
  const { t } = useTranslation(['rental', 'common'])
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
    simulateScan,
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

  // ── Document expiry gate ─────────────────────────────────
  const [expiredDoc, setExpiredDoc] = useState(null) // { type, expiry } | null

  // ── Identity-mismatch gate ───────────────────────────────
  // After both scans land, the names extracted from the CIN/passport
  // and the driving licence are compared. If they disagree we trap
  // the operator with a confirmation modal so they don't accidentally
  // create a rental for the wrong person. The flag is sticky once
  // dismissed (acknowledgedMismatch) so re-renders don't re-trigger
  // the modal on the same scans.
  const [mismatch, setMismatch] = useState(null) // { reason } | null
  const [acknowledgedMismatch, setAcknowledgedMismatch] = useState(false)

  useEffect(() => {
    if (!extracted.cin || !extracted.license) return
    if (acknowledgedMismatch) return
    const result = detectIdentityMismatch(extracted.cin, extracted.license)
    if (result.mismatch) setMismatch({ reason: result.reason })
  }, [extracted.cin, extracted.license, acknowledgedMismatch])

  const handleContinue = () => {
    // If a mismatch has been detected and not yet acknowledged, surface
    // it before checking expiry — operator must explicitly resolve it.
    if (mismatch && !acknowledgedMismatch) return
    const expiry = checkClientDocumentExpiry(clientData)
    if (expiry) {
      setExpiredDoc(expiry)
      return
    }
    onNext(clientData)
  }

  // v1.14.15: lead-level identity mismatch (server-detected, e.g. passport
  // and driving licence belong to different people). Non-blocking banner;
  // operator decides what to do.
  const leadMismatch = initialClient?.identityMismatch === true

  return (
    <div>
      {leadMismatch && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: '#FFF5E0', border: '1px solid #E4A700', borderRadius: 12,
            padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#4A3700',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1, color: '#B07400' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: 2 }}>
              {t('rental:scanStep.leadMismatchTitle', 'Documents potentiellement non concordants')}
            </strong>
            {t(
              'rental:scanStep.leadMismatchBody',
              "Les documents envoyés par le client (passeport, CIN, permis) ne semblent pas appartenir à la même personne. Vérifiez chaque champ avant de continuer.",
            )}
          </div>
        </div>
      )}

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
                {t('rental:scanStep.manualEntryTitle')}
              </h3>
              <button className="btn-outline-ink" style={{ padding: '4px 12px', fontSize: 13 }} onClick={dismissManualEntryPrompt}>
                <X size={14} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
              {t('rental:scanStep.manualEntryReason', { n: scanAttemptCount[manualEntrySlot ?? 'cin'], doc: manualEntrySlot === 'license' ? t('rental:scanStep.docLicense') : t('rental:scanStep.docCin') })}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
              {t('rental:scanStep.manualEntryHint')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ink" style={{ flex: 1, justifyContent: 'center', fontSize: 14 }} onClick={dismissManualEntryPrompt}>
                <PenLine size={13} /> {t('rental:scanStep.manualEntryConfirm')}
              </button>
              <button className="btn-outline-ink" style={{ fontSize: 14 }} onClick={() => {
                if (manualEntrySlot) resetAttemptCount(manualEntrySlot)
                dismissManualEntryPrompt()
              }}>
                {t('rental:scanStep.retryBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Law 09-08 privacy notice */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        marginBottom: 16,
        background: 'var(--surface-2, #F7F5F2)',
        border: '1px solid var(--border, #E5E1DA)',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--text2, #5A564F)',
      }}>
        <Shield size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent, #2D7A47)' }} />
        <span>{t('common:privacy.scanNotice')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* CIN Scan */}
        <div className="card">
          <div className="card-header">
            <h3>{t('rental:scanStep.cinSection')}</h3>
            {extracted.cin && (
              <span className="badge badge-green">
                <CheckCircle size={11} /> {t('rental:scanStep.scannedBadge', { type: extracted.cin.docType === 'passport' ? t('rental:scanStep.passportType') : 'CIN' })}
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
              <div className="scan-title">{t('rental:scanStep.importCin')}</div>
              <div className="scan-hint">{t('rental:scanStep.importHint')}</div>
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
            <button
              type="button"
              className="btn-outline-ink"
              style={{ fontSize: 12, marginTop: 8, width: '100%', justifyContent: 'center' }}
              disabled={scanning}
              onClick={() => simulateScan('cin')}
            >
              🧪 Simuler scan CIN
            </button>
          </div>
        </div>

        {/* License Scan */}
        <div className="card">
          <div className="card-header">
            <h3>{t('rental:scanStep.licenseSection')}</h3>
            {extracted.license && (
              <span className="badge badge-green"><CheckCircle size={11} /> {t('rental:scanStep.licenseScanned')}</span>
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
              <div className="scan-title">{t('rental:scanStep.importLicense')}</div>
              <div className="scan-hint">{t('rental:scanStep.licenseHint')}</div>
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
            <button
              type="button"
              className="btn-outline-ink"
              style={{ fontSize: 12, marginTop: 8, width: '100%', justifyContent: 'center' }}
              disabled={scanning}
              onClick={() => simulateScan('license')}
            >
              🧪 Simuler scan permis
            </button>
          </div>
        </div>
      </div>

      {/* Extracted / Editable fields */}
      <div className="card">
        <div className="card-header">
          <h3>{t('rental:scanStep.clientInfo')}</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{t('rental:scanStep.ocrHint')}</span>
        </div>
        <div className="card-body">
          <div className="form-row cols-3">
            {[
              { label: t('rental:scanStep.firstNameReq'), key: 'firstName' },
              { label: t('rental:scanStep.lastNameReq'), key: 'lastName' },
              { label: t('rental:scanStep.nationality'), key: 'nationality' },
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
              { label: t('rental:scanStep.cinNumberReq'), key: 'cinNumber' },
              { label: t('rental:scanStep.cinExpiryShort'), key: 'cinExpiry', type: 'date' },
              { label: t('rental:scanStep.licenseNumberReq'), key: 'drivingLicenseNumber' },
              { label: t('rental:scanStep.licenseExpiryShort'), key: 'licenseExpiry', type: 'date' },
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
              { label: t('rental:scanStep.phone'), key: 'phone' },
              { label: t('rental:scanStep.email'), key: 'email' },
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
              <label className="form-label">{t('rental:scanStep.dateOfBirth')}</label>
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
            <span>{t('rental:scanStep.law0908Notice')}</span>
          </div>
        </div>
      </div>

      <ClientAlerts client={clientData} />

      <StepButtons
        leftBtns={
          <button className="btn-outline-ink" style={{ fontSize: 14, color: '#CF4500', borderColor: '#CF4500' }} onClick={onCancel}>
            <X size={15} /> {t('rental:scanStep.cancelShort')}
          </button>
        }
        rightBtns={
          <>
            <button className="btn-outline-ink" style={{ fontSize: 14 }} onClick={() => onSaveAndQuit(clientData)}>
              {t('rental:scanStep.saveQuitBtn')}
            </button>
            <button className="btn-ink" style={{ fontSize: 15 }} disabled={!allFilled} onClick={handleContinue}>
              {t('rental:scanStep.continueBtn')} <ArrowRight size={15} />
            </button>
          </>
        }
      />

      {/* Document expiry alert — shown when CIN or license expiry is past */}
      {expiredDoc && (
        <DocumentExpiryAlert
          documentType={expiredDoc.type}
          expiryDate={expiredDoc.expiry}
          onClose={() => setExpiredDoc(null)}
          onContinue={() => {
            setExpiredDoc(null)
            onNext(clientData)
          }}
        />
      )}

      {/* Document-mismatch modal — shown when CIN and license names diverge.
          Cancel resets both scans so the operator can re-scan; Continue
          marks the warning acknowledged and lets handleContinue proceed. */}
      {mismatch && !acknowledgedMismatch && (
        <DocumentMismatchModal
          cinLabel={extracted.cin?.docType === 'passport' ? 'Passport' : 'CIN'}
          cinName={`${extracted.cin?.firstName || ''} ${extracted.cin?.lastName || ''}`.trim()}
          licenseLabel="Permis"
          licenseName={`${extracted.license?.firstName || ''} ${extracted.license?.lastName || ''}`.trim()}
          reason={mismatch.reason}
          onCancel={() => {
            // Reset all client identity fields so the operator re-scans
            // both documents from a clean slate.
            setMismatch(null)
            setAcknowledgedMismatch(false)
            updateField('firstName', '')
            updateField('lastName', '')
            updateField('cinNumber', '')
            updateField('cinExpiry', '')
            updateField('drivingLicenseNumber', '')
            updateField('licenseExpiry', '')
          }}
          onContinue={() => {
            setAcknowledgedMismatch(true)
            setMismatch(null)
          }}
        />
      )}
    </div>
  )
}
