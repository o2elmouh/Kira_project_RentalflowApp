import { useState, useEffect, useRef, useMemo } from 'react'
import { CheckCircle, AlertCircle, ArrowLeft, X, Edit3, FileSignature } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAgency, saveVehicle, saveContract, saveInvoice, getFleet } from '../../lib/db'
import { holdDeposit } from '../../utils/accounting.js'
import { generateContractBuffer } from '../../utils/pdf'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { snapshotOnStart } from '../../utils/snapshots'
import StepButtons from './StepButtons'
import SignChannelModal from './review/SignChannelModal'
import AwaitingSignatureBanner from './review/AwaitingSignatureBanner'

// Phases derived from contract row state — not stored as separate state.
const Phase = Object.freeze({
  REVIEW:             'REVIEW',
  AWAITING_SIGNATURE: 'AWAITING_SIGNATURE',
  SIGNED_ONLINE:      'SIGNED_ONLINE',
})

function derivePhase(contract) {
  if (!contract) return Phase.REVIEW
  if (contract.signature_status === 'signed') return Phase.SIGNED_ONLINE
  if (contract.signature_status === 'pending') return Phase.AWAITING_SIGNATURE
  return Phase.REVIEW
}

export default function ContractStep({
  client, rental, photos,
  onDone, onBack, onSaveAndQuit, onCancel,
  onEditStep1, onEditStep2,
  onFinalized,
}) {
  const { t } = useTranslation('contracts')
  const [agency, setAgency]       = useState({})
  const [contract, setContract]   = useState(null)
  const [, setInvoice]            = useState(null)

  const [persisting, setPersisting] = useState(false)         // creating DB row
  const [finalizing, setFinalizing] = useState(false)         // calling /finalize
  const [error, setError]           = useState(null)

  const [signModalOpen,   setSignModalOpen]   = useState(false)
  const [sendingChannel,  setSendingChannel]  = useState(null) // 'email' | 'whatsapp' | null
  const [lastSentChannel, setLastSentChannel] = useState(null)
  const [lastSentAt,      setLastSentAt]      = useState(null)

  const channelRef = useRef(null)

  const phase = useMemo(() => derivePhase(contract), [contract])

  const canSignViaEmail    = Boolean(client?.email)
  const canSignViaWhatsApp = Boolean(client?.phone)
  const canSignAtAll       = canSignViaEmail || canSignViaWhatsApp
  const showEditButtons    = phase === Phase.REVIEW

  // ── Load agency once ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    getAgency()
      .then(data => { if (!cancelled) setAgency(data || {}) })
      .catch(err => { console.error('[ContractStep] getAgency', err) })
    return () => { cancelled = true }
  }, [])

  // ── Realtime — updates phase inline; agent must still click Finaliser ──
  // Per user spec: "Si le client signe en ligne… celle-ci apparaît
  // automatiquement sur le contrat affiché à l'écran" (no auto-navigation).
  useEffect(() => {
    if (!contract?.id) return
    let mounted = true
    const channel = supabase
      .channel(`contract-sign-${contract.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'contracts', filter: `id=eq.${contract.id}`,
      }, (payload) => {
        if (!mounted || !payload.new) return
        setContract((prev) => ({ ...prev, ...payload.new }))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      mounted = false
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [contract?.id])

  // ── Ensure the contract row exists (idempotent) ────────────
  const ensureContract = async () => {
    if (contract) return contract
    if (persisting) return null
    setPersisting(true)
    setError(null)
    try {
      const savedClient = await api.saveClient(client)
      const c = await saveContract({
        clientId: savedClient.id,
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleId: rental.vehicle.id,
        vehicleName: `${rental.vehicle.make} ${rental.vehicle.model}`,
        ...rental,
        photos,
        status: 'active',
      })
      // v1.14.23: vehicle.status flip to 'rented' moved out of ensureContract.
      // ensureContract fires when the agent picks a signing channel (link
      // dispatch happens BEFORE the client signs); flagging the car rented
      // at that point locked it even when the client never signed or the
      // agent abandoned the wizard. The car is now flipped only when the
      // agent clicks "Finaliser le contrat" (handleFinalize). Date-overlap
      // booking protection is unaffected — that rule keys on
      // `contracts.status='active' AND date overlap`, not on vehicle.status.

      const inv = await saveInvoice({
        contractId: c.id,
        contractNumber: c.contractNumber,
        clientId: c.clientId,
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
      setContract(c)
      setInvoice(inv)
      try { await snapshotOnStart(c) } catch (e) { console.warn('[ContractStep] snapshotOnStart failed:', e) }
      return c
    } catch (err) {
      console.error('[ContractStep] ensureContract', err)
      setError(err.message || t('review.errors.prepareFailed'))
      return null
    } finally {
      setPersisting(false)
    }
  }

  // ── Revert ensureContract side-effects when the user backs out ──
  // Once ensureContract runs (e.g. user picks a sign channel), the vehicle
  // is marked 'rented' and a contract/invoice row exists. Quitting at that
  // point must not leave the vehicle locked.
  const [reverting, setReverting] = useState(false)
  const revertEnsured = async () => {
    if (!contract || phase === Phase.SIGNED_ONLINE) return
    setReverting(true)
    try {
      const fleet = await getFleet()
      const v = fleet.find(veh => veh.id === rental.vehicle?.id || veh.id === rental.vehicleId)
      if (v && v.status === 'rented') await saveVehicle({ ...v, status: 'available' })
      await saveContract({ ...contract, status: 'cancelled' })
    } catch (err) {
      console.error('[ContractStep] revertEnsured', err)
    } finally {
      setReverting(false)
    }
  }

  const handleCancel = async () => {
    await revertEnsured()
    onCancel?.()
  }

  // Save & quit leaves the contract intact — the agent can resume later.
  // Only "Annuler la location" reverts the ensureContract side-effects.
  const handleSaveAndQuit = () => {
    onSaveAndQuit?.()
  }

  // ── Send signature link via email or whatsapp ──────────────
  const handlePickChannel = async (channel) => {
    if (sendingChannel) return
    setSendingChannel(channel)
    setError(null)
    try {
      const c = await ensureContract()
      if (!c) throw new Error(t('review.errors.prepareFailed'))

      const buffer = await generateContractBuffer(c, client, rental.vehicle, agency)
      const bytes  = new Uint8Array(buffer)
      let binary   = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const pdfBase64 = btoa(binary)

      const resp = channel === 'email'
        ? await api.sendContractSignLinkEmail(c.id, pdfBase64)
        : await api.sendContractSignLink(c.id, pdfBase64)

      if (!resp?.success) throw new Error(resp?.error || t('review.errors.sendFailed'))

      setContract((prev) => ({ ...(prev || c), signature_status: 'pending' }))
      setLastSentChannel(channel)
      setLastSentAt(new Date().toISOString())
      setSignModalOpen(false)
    } catch (err) {
      console.error('[ContractStep] handlePickChannel', err)
      setError(err.message || t('review.errors.sendFailed'))
    } finally {
      setSendingChannel(null)
    }
  }

  // ── Finalize: lock the case. status stays 'active', sets finalized_at.
  // Online signature is optional — manual in-agency signing is supported.
  const handleFinalize = async () => {
    if (finalizing) return
    setFinalizing(true)
    setError(null)
    try {
      const c = await ensureContract()
      if (!c) throw new Error(t('review.errors.prepareFailed'))

      // v1.14.23: flip vehicle to 'rented' HERE — not in ensureContract.
      // ensureContract fires on link dispatch (before signing); the agent's
      // click on "Finaliser le contrat" is the canonical "rental is now
      // effective" signal. The contract is already status='active' from
      // ensureContract so the date range is already protected against
      // double-booking; this flip is just the physical-state hint shown
      // in Fleet / Dashboard / FleetMap.
      try {
        const fleet = await getFleet()
        const v = fleet.find(veh => veh.id === rental.vehicle?.id || veh.id === rental.vehicleId)
        if (v && v.status !== 'rented') await saveVehicle({ ...v, status: 'rented' })
      } catch (vehErr) {
        // Don't block finalize on this — worst case the agent flips the
        // status manually from Fleet. Log so we know if it's recurring.
        console.warn('[ContractStep] vehicle flip to rented non-blocking:', vehErr.message)
      }

      // Hold security deposit (non-blocking — accounting must never block
      // the rental flow). Skip when no deposit was collected.
      try {
        const depositAmount = Number(rental?.deposit ?? rental?.depositAmount ?? 0)
        if (depositAmount > 0) {
          await holdDeposit({
            contractId:  c.id,
            clientName:  `${client.firstName} ${client.lastName}`,
            vehicleName: `${rental.vehicle.make} ${rental.vehicle.model}`,
            amount:      depositAmount,
            date:        rental.startDate || new Date().toISOString().slice(0, 10),
          })
        }
      } catch (depErr) {
        console.warn('[ContractStep] holdDeposit non-blocking:', depErr.message)
      }

      try {
        await api.finalizeContract(c.id)
      } catch (finErr) {
        // Endpoint may be unavailable in older deploys — don't block the wizard.
        console.warn('[ContractStep] finalize non-blocking:', finErr.message)
      }
      // Navigate to success screen via App-level routing.
      if (onFinalized) onFinalized(c.id)
      else onDone()
    } catch (err) {
      console.error('[ContractStep] handleFinalize', err)
      setError(err.message || t('review.errors.finalizeFailed'))
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div>
      {/* ── Edit buttons — visible only in REVIEW ─────────── */}
      {showEditButtons && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}>
          <button
            className="btn-outline-ink"
            style={{ fontSize: 13 }}
            onClick={onEditStep1}
            disabled={persisting || sendingChannel || finalizing}
          >
            <Edit3 size={14} /> {t('review.editClient')}
          </button>
          <button
            className="btn-outline-ink"
            style={{ fontSize: 13 }}
            onClick={onEditStep2}
            disabled={persisting || sendingChannel || finalizing}
          >
            <Edit3 size={14} /> {t('review.editVehicle')}
          </button>
        </div>
      )}

      {/* ── Awaiting-signature banner ─────────────────────── */}
      {phase === Phase.AWAITING_SIGNATURE && (
        <AwaitingSignatureBanner
          channel={lastSentChannel}
          sentAt={lastSentAt}
          resending={Boolean(sendingChannel)}
          onResend={() => setSignModalOpen(true)}
        />
      )}

      {/* ── Signed-online success banner ───────────────────── */}
      {phase === Phase.SIGNED_ONLINE && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderRadius: 16,
          background: '#D1FAE5', border: '1px solid #22C55E',
          marginBottom: 16,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}>
          <CheckCircle size={20} color="#065F46" />
          <div style={{ fontSize: 14, color: '#065F46' }}>
            {t('review.signedOnline')}
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger mb-3" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Contract preview ───────────────────────────────── */}
      <div className="card mb-4">
        <div className="card-header">
          <h3>Aperçu du contrat</h3>
          {phase === Phase.SIGNED_ONLINE && (
            <span className="badge badge-green"><CheckCircle size={11} /> {t('review.badges.signed')}</span>
          )}
          {phase === Phase.AWAITING_SIGNATURE && (
            <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B' }}>
              {t('review.badges.awaiting')}
            </span>
          )}
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

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, minHeight: 20 }}>
                  {agency.signature || agency.name || ''}
                </div>
                <div style={{ borderTop: '1px solid #999', width: 160, marginBottom: 4 }} />
                <div style={{ fontSize: 11, color: '#666' }}>Signature du loueur</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                {phase === Phase.SIGNED_ONLINE ? (
                  <div style={{
                    width: 160, height: 50, marginBottom: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#065F46', fontSize: 11, fontStyle: 'italic',
                  }}>
                    {t('review.signature.electronic')}
                  </div>
                ) : (
                  <div style={{ width: 160, height: 50, marginBottom: 4 }} />
                )}
                <div style={{ borderTop: '1px solid #999', width: 160, marginBottom: 4 }} />
                <div style={{ fontSize: 11, color: '#666' }}>
                  Signature du locataire {phase !== Phase.SIGNED_ONLINE && '(Lu et approuvé)'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer actions ─────────────────────────────────── */}
      <StepButtons
        leftBtns={
          <>
            <button
              className="btn-outline-ink"
              style={{ fontSize: 14 }}
              onClick={onBack}
              disabled={persisting || sendingChannel || finalizing}
            >
              <ArrowLeft size={15} /> Retour
            </button>
            <button
              className="btn-outline-ink"
              style={{ fontSize: 14, color: '#CF4500', borderColor: '#CF4500' }}
              disabled={persisting || sendingChannel || finalizing || reverting}
              onClick={handleCancel}
            >
              <X size={15} /> {reverting ? 'Annulation…' : 'Annuler la location'}
            </button>
          </>
        }
        rightBtns={
          <>
            <button
              className="btn-outline-ink"
              style={{ fontSize: 14 }}
              onClick={handleSaveAndQuit}
              disabled={persisting || sendingChannel || finalizing || reverting}
            >
              💾 Sauvegarder & quitter
            </button>

            <button
              className="btn-outline-ink"
              style={{ fontSize: 14 }}
              disabled={!canSignAtAll || persisting || finalizing || phase === Phase.SIGNED_ONLINE}
              onClick={() => setSignModalOpen(true)}
              title={!canSignAtAll ? t('review.errors.noContact') : ''}
            >
              <FileSignature size={15} />
              {phase === Phase.AWAITING_SIGNATURE ? t('review.resendLink') : t('review.signContract')}
            </button>

            <button
              className="btn-ink"
              style={{ fontSize: 15 }}
              onClick={handleFinalize}
              disabled={persisting || finalizing}
            >
              <CheckCircle size={15} />
              {finalizing ? t('review.finalizing') : t('review.finalize')}
            </button>
          </>
        }
      />

      <SignChannelModal
        open={signModalOpen}
        onClose={() => setSignModalOpen(false)}
        onPick={handlePickChannel}
        hasEmail={canSignViaEmail}
        hasPhone={canSignViaWhatsApp}
        sendingChannel={sendingChannel}
      />
    </div>
  )
}
