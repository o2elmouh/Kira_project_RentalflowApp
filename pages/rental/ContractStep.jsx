import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Printer, Download, ArrowLeft, X, MessageSquare } from 'lucide-react'
import { getAgency, saveClient, saveVehicle, saveContract, saveInvoice, getFleet } from '../../lib/db'
import { generateContract, generateInvoice } from '../../utils/pdf'
import { api } from '../../lib/api'
import { snapshotOnStart } from '../../utils/snapshots'
import StepButtons from './StepButtons'

export default function ContractStep({ client, rental, photos, onDone, onBack, onSaveAndQuit, onCancel }) {
  const [agency, setAgency]       = useState({})
  const [finalized, setFinalized] = useState(false)
  const [contract, setContract]   = useState(null)
  const [invoice, setInvoice]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [signing, setSigning]     = useState(false)
  const [signStatus, setSignStatus] = useState(null) // 'sent' | 'error' | null

  useEffect(() => {
    let cancelled = false
    getAgency()
      .then(data => { if (!cancelled) setAgency(data || {}) })
      .catch(err => { console.error('[NewRental] getAgency', err) })
    return () => { cancelled = true }
  }, [])

  const handleFinalize = async () => {
    if (saving || finalized) return
    setSaving(true)
    setSaveError(null)
    try {
      // 1. Save client + contract
      const savedClient = await saveClient(client)
      const c = await saveContract({
        clientId: savedClient.id,
        clientName: `${client.firstName} ${client.lastName}`,
        vehicleId: rental.vehicle.id,
        vehicleName: `${rental.vehicle.make} ${rental.vehicle.model}`,
        ...rental,
        photos,
        status: 'active',
      })
      const fleet = await getFleet()
      const v = fleet.find(veh => veh.id === rental.vehicle?.id || veh.id === rental.vehicleId)
      if (v) await saveVehicle({ ...v, status: 'rented' })

      // 2. Save invoice
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
      setFinalized(true)
      try { await snapshotOnStart(c) } catch (e) { console.warn('[NewRental] snapshotOnStart failed:', e) }
    } catch (err) {
      console.error('[NewRental] handleFinalize', err)
      setSaveError(err.message || 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  const downloadContract = () => contract && generateContract(contract, client, rental.vehicle, agency)
  const downloadInvoice  = () => invoice  && generateInvoice(invoice, contract, client, rental.vehicle, agency)

  const handleSign = async () => {
    if (!contract || signing) return
    setSigning(true)
    setSignStatus(null)
    try {
      const payload = {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        clientName: `${client.firstName} ${client.lastName}`,
        clientPhone: client.phone,
        clientEmail: client.email,
        vehicle: `${rental.vehicle.make} ${rental.vehicle.model}`,
        startDate: rental.startDate,
        endDate: rental.endDate,
        totalTTC: rental.totalTTC,
      }
      await Promise.allSettled([
        client.phone ? api.sendContractWhatsApp(payload) : Promise.resolve(),
        client.email ? api.sendContractEmail(payload)    : Promise.resolve(),
      ])
      setSignStatus('sent')
    } catch (err) {
      console.error('[NewRental] handleSign', err)
      setSignStatus('error')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <h3>Aperçu du contrat</h3>
          {finalized && <span className="badge badge-green"><CheckCircle size={11} /> Finalisé</span>}
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

      {saveError && (
        <div className="alert alert-danger mb-3" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{saveError}</span>
        </div>
      )}

      {signStatus === 'sent' && (
        <div className="alert alert-success mb-3" style={{ display: 'flex', gap: 8 }}>
          <CheckCircle size={14} />
          <span>Contrat envoyé au client par WhatsApp{client.email ? ' et email' : ''}.</span>
        </div>
      )}
      {signStatus === 'error' && (
        <div className="alert alert-danger mb-3" style={{ display: 'flex', gap: 8 }}>
          <AlertCircle size={14} />
          <span>Erreur d'envoi — vérifiez la configuration WhatsApp/email.</span>
        </div>
      )}

      <StepButtons
        leftBtns={
          !finalized ? (
            <>
              <button className="btn btn-primary btn-lg" onClick={onBack} disabled={saving} style={{ color: 'white' }}>
                <ArrowLeft size={15} /> Retour
              </button>
              <button className="btn btn-primary btn-lg" style={{ color: 'white' }} disabled={saving} onClick={onCancel}>
                <X size={15} /> Annuler la location
              </button>
            </>
          ) : null
        }
        rightBtns={
          !finalized ? (
            <>
              <button className="btn btn-ghost" onClick={onSaveAndQuit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                💾 Sauvegarder & quitter
              </button>
              <button className="btn btn-primary btn-lg" disabled={saving} onClick={handleFinalize}>
                {saving ? 'Finalisation…' : <><CheckCircle size={15} /> Finaliser le contrat</>}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-lg" onClick={downloadInvoice}>
                <Download size={14} /> Télécharger l'invoice
              </button>
              <button className="btn btn-primary btn-lg" onClick={downloadContract}>
                <Printer size={14} /> Télécharger le contrat
              </button>
              <button className="btn btn-primary btn-lg" disabled={signing} onClick={handleSign}>
                <MessageSquare size={14} /> {signing ? 'Envoi…' : 'Signer le contrat'}
              </button>
              <button className="btn btn-primary btn-lg" onClick={onDone}>
                <CheckCircle size={15} /> Terminer
              </button>
            </>
          )
        }
      />
    </div>
  )
}
