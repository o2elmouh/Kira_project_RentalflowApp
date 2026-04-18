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

  // Derive rental prefill from lead rental intent (text or OCR leads)
  const ri = prefilledLead?.rentalIntent
  const today = new Date().toISOString().split('T')[0]
  const rentalPrefill = ri?.detected ? {
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
    <div>
      <div className="page-header">
        <div>
          <h2>New Rental</h2>
          <p>Complete all steps to generate the contract and invoice</p>
        </div>
      </div>
      <div className="page-body">
        <StepBar current={step} />
        {step === 0 && <ScanStep initialClient={prefilledLead || client} onNext={c => advance({ client: c, step: 1 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 1 && <RentalStep client={client} initialRental={rental || rentalPrefill} onNext={r => advance({ rental: r, step: 2 })} onBack={() => advance({ step: 0 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 2 && <PhotoStep initialPhotos={photos} onNext={p => advance({ photos: p, step: 3 })} onBack={() => advance({ step: 1 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 3 && <ContractStep client={client} rental={rental} photos={photos} onDone={onDone} onBack={() => advance({ step: 2 })} onSaveAndQuit={onDone} onCancel={() => setShowCancelConfirm(true)} />}
      </div>

      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCancelConfirm(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Annuler la location ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              Toutes les données saisies seront supprimées. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626', flex: 1 }}
                onClick={() => { setShowCancelConfirm(false); onDone() }}>
                Oui, annuler
              </button>
              <button className="btn btn-ghost" onClick={() => setShowCancelConfirm(false)}>
                Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
