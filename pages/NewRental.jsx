import { useState } from 'react'
import StepBar, { STEPS } from './rental/StepBar'
import ScanStep from './rental/ScanStep'
import RentalStep from './rental/RentalStep'
import PhotoStep from './rental/PhotoStep'
import ContractStep from './rental/ContractStep'

// ── Draft persistence ─────────────────────────────────────
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

// ── Main Wizard ───────────────────────────────────────────
export default function NewRental({ onDone, prefilledLead = null }) {
  // If a lead is being converted, skip the draft entirely
  const draft = prefilledLead ? null : loadDraft()
  const [resumePrompt, setResumePrompt] = useState(!prefilledLead && !!draft)

  const [step,     setStep]     = useState(draft?.step     ?? 0)
  const [client,   setClient]   = useState(draft?.client   ?? null)
  const [rental,   setRental]   = useState(draft?.rental   ?? null)
  const [photos,   setPhotos]   = useState(draft?.photos   ?? {})
  const [contract, setContract] = useState(draft?.contract ?? null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const persist = (patch) => {
    saveDraft({ step, client, rental, photos, contract, ...patch })
  }

  const advance = (patch) => {
    const next = { step, client, rental, photos, contract, ...patch }
    saveDraft(next)
    if (patch.step     !== undefined) setStep(patch.step)
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
      </div>
      <div className="page-body">
        <StepBar current={step} />
        {step === 0 && <ScanStep initialClient={prefilledLead || client} onNext={c => advance({ client: c, step: 1 })} onSaveAndQuit={handleQuit} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 1 && <RentalStep client={client} initialRental={rental} onNext={r => advance({ rental: r, step: 2 })} onBack={() => advance({ step: 0 })} onSaveAndQuit={handleQuit} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 2 && <PhotoStep initialPhotos={photos} onNext={p => advance({ photos: p, step: 3 })} onBack={() => advance({ step: 1 })} onSaveAndQuit={handleQuit} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 3 && <ContractStep client={client} rental={rental} photos={photos} onDone={handleDone} onBack={() => advance({ step: 2 })} onSaveAndQuit={handleQuit} onCancel={() => setShowCancelConfirm(true)} />}
      </div>

      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCancelConfirm(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Annuler la location ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              Toutes les données saisies seront supprimées et le brouillon sera effacé. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626', flex: 1 }}
                onClick={() => { setShowCancelConfirm(false); handleDiscard(); onDone() }}>
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
