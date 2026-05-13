import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import StepBar from './rental/StepBar'
import ScanStep from './rental/ScanStep'
import RentalStep from './rental/RentalStep'
import PhotoStep from './rental/PhotoStep'
import ContractStep from './rental/ContractStep'
import { useUser } from '../lib/UserContext'
import {
  loadDrafts, saveDraft, getDraft, deleteDraft, getDraftLabel,
} from '../lib/newRentalDraft'
import { useCreateReservation } from '../src/hooks/useReservations'

export default function NewRental({ onDone, onSigned, prefilledLead = null }) {
  const { t } = useTranslation('common')
  const { profile } = useUser()
  const agencyId = profile?.agency_id

  const [step,    setStep]    = useState(0)
  const [client,  setClient]  = useState(null)
  const [rental,  setRental]  = useState(null)
  const [photos,  setPhotos]  = useState({})
  const [draftId, setDraftId] = useState(null) // id of draft being edited (null = creating new)
  const [drafts,  setDrafts]  = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Booking Hub — reservation creation on wizard completion (Task 7)
  const createReservation = useCreateReservation()

  // Load drafts once. If any exist (and no prefilled lead), show the picker.
  useEffect(() => {
    if (!agencyId) return
    const list = loadDrafts(agencyId)
    setDrafts(list)
    if (!prefilledLead && list.length > 0) setShowPicker(true)
  }, [agencyId, prefilledLead])

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

  // A draft is "meaningful" if at least one identifying client field, a
  // rental form (vehicle/dates), or any captured photo exists. We avoid
  // persisting empty stub objects (e.g. fresh ScanStep state with all
  // empty strings, or accidental click events from steps that didn't
  // pass a payload).
  const draftHasContent = (d) => {
    if (!d) return false
    const c = d.client
    const hasClient = c && typeof c === 'object' && !c.nativeEvent && (
      (c.firstName && c.firstName.trim()) ||
      (c.lastName && c.lastName.trim()) ||
      (c.cinNumber && c.cinNumber.trim()) ||
      (c.drivingLicenseNumber && c.drivingLicenseNumber.trim())
    )
    const r = d.rental
    const hasRental = r && typeof r === 'object' && !r.nativeEvent && (
      r.vehicle || r.startDate || r.endDate || r.pickupLocation
    )
    const p = d.photos
    const hasPhotos = p && typeof p === 'object' && Object.keys(p).length > 0
    return Boolean(hasClient || hasRental || hasPhotos)
  }

  // Persist current workflow state and exit to caller.
  const handleSaveAndQuit = (patch = {}) => {
    if (!agencyId) { onDone(); return }
    const merged = {
      id:     draftId,
      step:   patch.step    ?? step,
      client: patch.client  ?? client,
      rental: patch.rental  ?? rental,
      photos: patch.photos  ?? photos,
    }
    if (draftHasContent(merged)) saveDraft(agencyId, merged)
    onDone()
  }

  // Each step's onSaveAndQuit passes its latest local payload back.
  // The step number stays at the current step so the user resumes
  // exactly where they left off.
  const saveQuitFromStep = (key) => (payload) => {
    if (key === 'client') return handleSaveAndQuit({ client: payload, step })
    if (key === 'rental') return handleSaveAndQuit({ rental: payload, step })
    if (key === 'photos') return handleSaveAndQuit({ photos: payload, step })
    return handleSaveAndQuit({ step })
  }

  const handleResume = (id) => {
    const d = getDraft(agencyId, id)
    if (!d) return
    setDraftId(d.id)
    setStep(d.step || 0)
    setClient(d.client || null)
    setRental(d.rental || null)
    setPhotos(d.photos || {})
    setShowPicker(false)
  }

  const handleStartNew = () => {
    setDraftId(null)
    setStep(0)
    setClient(null)
    setRental(null)
    setPhotos({})
    setShowPicker(false)
  }

  const handleDeleteDraft = (id) => {
    if (!window.confirm('Supprimer ce brouillon ?')) return
    deleteDraft(agencyId, id)
    const next = loadDrafts(agencyId)
    setDrafts(next)
    if (next.length === 0) setShowPicker(false)
  }

  const handleCancelConfirmed = () => {
    setShowCancelConfirm(false)
    if (draftId && agencyId) deleteDraft(agencyId, draftId)
    onDone()
  }

  const handleDone = () => {
    if (draftId && agencyId) deleteDraft(agencyId, draftId)

    // ── Booking Hub: create the reservation row ──────────────
    // Fire-and-forget so the wizard exits immediately. The query cache
    // is invalidated on success and the row appears in the Reservations
    // page on next render. Errors are logged but never block the UX.
    try {
      const sourceFromLead = prefilledLead?.source?.toLowerCase()
      const source_channel =
        sourceFromLead === 'whatsapp' ? 'WHATSAPP' :
        sourceFromLead === 'gmail' || sourceFromLead === 'email' ? 'EMAIL' :
        'IN_PERSON'

      const customer_name    = `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Client'
      const customer_contact = client?.phone || client?.email || client?.cinNumber || '—'
      const car_model =
        rental?.vehicle?.label ||
        [rental?.vehicle?.make, rental?.vehicle?.model].filter(Boolean).join(' ') ||
        'Véhicule'

      const start_date = rental?.startDate ? new Date(rental.startDate).toISOString() : new Date().toISOString()
      const end_date   = rental?.endDate   ? new Date(rental.endDate).toISOString()   : new Date(Date.now() + 86_400_000).toISOString()
      const total_price = Number(rental?.totalPrice ?? rental?.total ?? 0)

      createReservation.mutate({
        client_id:        client?.id || null,
        customer_name,
        customer_contact,
        vehicle_id:       rental?.vehicle?.id || null,
        car_model,
        start_date,
        end_date,
        total_price,
        currency:         'MAD',
        source_channel,
        status:           'CONFIRMED',
        source_metadata: {
          pending_demand_id: prefilledLead?.leadId || prefilledLead?.id || null,
          original_lead:     prefilledLead?.id ? { id: prefilledLead.id, source: prefilledLead.source } : null,
          created_via:    'new_rental_wizard',
          pickup_location: rental?.pickupLocation || null,
          return_location: rental?.returnLocation || null,
        },
        lead_id: prefilledLead?.leadId || prefilledLead?.id || null,  // FK → pending_demands
      })
    } catch (err) {
      console.error('[NewRental] Failed to create reservation:', err)
    }

    onDone()
  }

  // ── Draft picker (block grid like Fleet) ──────────────────
  if (showPicker) {
    return (
      <div style={{ background: '#F3F0EE', minHeight: '100%' }}>
        <div style={{ padding: '36px 40px 24px' }}>
          <div className="mc-eyebrow">
            <span style={{ color: '#F37338', fontSize: 14, lineHeight: 1 }}>•</span>
            LOCATIONS EN COURS
          </div>
          <h2 style={{
            fontSize: 32, fontWeight: 500, color: '#141413',
            letterSpacing: '-0.64px', lineHeight: '40px',
            fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          }}>
            Reprendre ou créer
          </h2>
          <p style={{
            fontSize: 14, color: '#696969', marginTop: 6,
            fontFamily: "'Sofia Sans', 'Inter', sans-serif", lineHeight: '22px',
          }}>
            Continuez une location en cours ou démarrez-en une nouvelle.
          </p>
        </div>

        <div style={{ padding: '0 40px 48px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}>
            {/* + New Rental block — first card */}
            <button
              onClick={handleStartNew}
              style={{
                background: '#FCFBFA',
                border: '2px dashed #C9C5C0',
                borderRadius: 28,
                padding: 28,
                minHeight: 180,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10,
                fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#F37338'; e.currentTarget.style.background = '#FFF8F2' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#C9C5C0'; e.currentTarget.style.background = '#FCFBFA' }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#F37338', color: '#FCFBFA',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={24} strokeWidth={2.5} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#141413' }}>
                Nouvelle location
              </div>
              <div style={{ fontSize: 12, color: '#696969' }}>
                Démarrer un nouveau dossier
              </div>
            </button>

            {/* One block per saved draft */}
            {drafts.map(d => (
              <div
                key={d.id}
                style={{
                  background: '#FCFBFA',
                  border: '1px solid #E8E5E1',
                  borderRadius: 28,
                  padding: 24,
                  minHeight: 180,
                  display: 'flex', flexDirection: 'column',
                  fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                  transition: 'box-shadow .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,20,19,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div className="mc-eyebrow" style={{ marginBottom: 8 }}>
                  <span style={{ color: '#F37338' }}>•</span>
                  ÉTAPE {(d.step ?? 0) + 1} / 4
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#141413', marginBottom: 4 }}>
                  {getDraftLabel(d)}
                </div>
                <div style={{ fontSize: 12, color: '#696969', marginBottom: 16 }}>
                  Mis à jour {new Date(d.updatedAt).toLocaleDateString('fr-FR')}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <button
                    className="btn-ink"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 14 }}
                    onClick={() => handleResume(d.id)}
                  >
                    Continuer
                  </button>
                  <button
                    className="btn-outline-ink"
                    style={{ fontSize: 14, color: '#CF4500', borderColor: '#CF4500', padding: '8px 12px' }}
                    onClick={() => handleDeleteDraft(d.id)}
                    aria-label="Supprimer le brouillon"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
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
          {t('pages.newRental.title')}
        </h2>
        <p style={{
          fontSize: 14,
          color: '#696969',
          marginTop: 6,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          lineHeight: '22px',
        }}>
          {t('pages.newRental.subtitle')}
        </p>
      </div>

      {/* ── Step content ────────────────────────────────────── */}
      <div style={{ padding: '0 40px 48px' }}>
        <StepBar current={step} />
        {step === 0 && <ScanStep   initialClient={prefilledLead || client} onNext={c => advance({ client: c, step: 1 })} onSaveAndQuit={saveQuitFromStep('client')} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 1 && <RentalStep client={client} initialRental={rental || rentalPrefill} onNext={r => advance({ rental: r, step: 2 })} onBack={() => advance({ step: 0 })} onSaveAndQuit={saveQuitFromStep('rental')} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 2 && <PhotoStep  initialPhotos={photos} onNext={p => advance({ photos: p, step: 3 })} onBack={() => advance({ step: 1 })} onSaveAndQuit={saveQuitFromStep('photos')} onCancel={() => setShowCancelConfirm(true)} />}
        {step === 3 && <ContractStep
          client={client}
          rental={rental}
          photos={photos}
          onDone={handleDone}
          onBack={() => advance({ step: 2 })}
          onSaveAndQuit={saveQuitFromStep()}
          onCancel={() => setShowCancelConfirm(true)}
          onEditStep1={() => advance({ step: 0 })}
          onEditStep2={() => advance({ step: 1 })}
          onFinalized={onSigned}
        />}
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
                onClick={handleCancelConfirmed}
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
