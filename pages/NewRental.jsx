import { useState } from 'react'
import StepBar from './rental/StepBar'
import ScanStep from './rental/ScanStep'
import RentalStep from './rental/RentalStep'
import PhotoStep from './rental/PhotoStep'
import ContractStep from './rental/ContractStep'

export default function NewRental({ onDone, prefilledLead = null }) {
  const [step,   setStep]   = useState(0)
  const [client, setClient] = useState(null)
  const [rental, setRental] = useState(null)
  const [photos, setPhotos] = useState({})
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const ri = prefilledLead?.rentalIntent
  const today = new Date().toISOString().split('T')[0]
  const rentalPrefill = (ri?.detected || ri?.pickupLocation || ri?.returnLocation || ri?.startDate || ri?.endDate) ? {
    startDate:      ri.startDate      || today,
    endDate:        ri.endDate        || '',
    pickupLocation: ri.pickupLocation || '',
    returnLocation: ri.returnLocation || '',
  } : null

  const advance = (patch) => {
    if (patch.step   !== undefined) setStep(patch.step)
    if (patch.client !== undefined) setClient(patch.client)
    if (patch.rental !== undefined) setRental(patch.rental)
    if (patch.photos !== undefined) setPhotos(patch.photos)
  }

  return (
    <div style={{ background: '#F3F0EE', minHeight: '100%' }}>

      {/* ── Page Header ─────────────────────────────────────── */}
      <div style={{ padding: '36px 40px 24px' }}>
        <div className="mc-eyebrow">
          <span style={{ color: '#F37338', fontSize: 14, lineHeight: 1 }}>•</span>
          NOUVELLE LOCATION
        </div>
        <h2 style={{
          fontSize: 32,
          fontWeight: 500,
          color: '#141413',
          letterSpacing: '-0.64px',
          lineHeight: '40px',
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}>
          New Rental
        </h2>
        <p style={{
          fontSize: 14,
          color: '#696969',
          marginTop: 6,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          lineHeight: '22px',
        }}>
          Complete all steps to generate the contract and invoice
        </p>
      </div>

      {/* ── Step content ────────────────────────────────────── */}
      <div style={{ padding: '0 40px 48px' }}>
        <StepBar current={step} />
        {step === 0 && <ScanStep   initialClient={prefilledLead || client} onNext={c => advance({ client: c, step: 1 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 1 && <RentalStep client={client} initialRental={rental || rentalPrefill} onNext={r => advance({ rental: r, step: 2 })} onBack={() => advance({ step: 0 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 2 && <PhotoStep  initialPhotos={photos} onNext={p => advance({ photos: p, step: 3 })} onBack={() => advance({ step: 1 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 3 && <ContractStep client={client} rental={rental} photos={photos} onDone={onDone} onBack={() => advance({ step: 2 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
      </div>

      {/* ── Cancel Confirmation Modal ────────────────────────── */}
      {showCancelConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,20,19,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            style={{
              background: '#FCFBFA',
              borderRadius: 40,
              padding: '40px 44px',
              maxWidth: 420,
              width: '90%',
              boxShadow: 'rgba(0,0,0,0.08) 0px 24px 48px 0px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mc-eyebrow" style={{ marginBottom: 14 }}>
              <span style={{ color: '#F37338' }}>•</span>
              ANNULATION
            </div>
            <h3 style={{
              fontSize: 24,
              fontWeight: 500,
              color: '#141413',
              letterSpacing: '-0.48px',
              lineHeight: '30px',
              fontFamily: "'Sofia Sans', 'Inter', sans-serif",
              marginBottom: 12,
            }}>
              Annuler la location ?
            </h3>
            <p style={{
              fontSize: 14,
              color: '#696969',
              marginBottom: 32,
              fontFamily: "'Sofia Sans', 'Inter', sans-serif",
              lineHeight: '22px',
            }}>
              Toutes les données saisies seront supprimées. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn-ink"
                style={{ flex: 1, justifyContent: 'center', fontSize: 15 }}
                onClick={() => { setShowCancelConfirm(false); onDone() }}
              >
                Oui, annuler
              </button>
              <button
                className="btn-outline-ink"
                style={{ fontSize: 15 }}
                onClick={() => setShowCancelConfirm(false)}
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
