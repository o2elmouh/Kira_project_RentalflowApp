import { useEffect, useState } from 'react'
import { CheckCircle, Download, Printer, Home, AlertCircle } from 'lucide-react'
import { getContracts, getClients, getFleet } from '../lib/db'

export default function ContractSuccess({ contractId, onDone }) {
  const [contract, setContract] = useState(null)
  const [client, setClient]     = useState(null)
  const [vehicle, setVehicle]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [contracts, clients, fleet] = await Promise.all([
          getContracts(), getClients(), getFleet(),
        ])
        if (cancelled) return
        const c = contracts.find(x => x.id === contractId)
        if (!c) { setError('Contrat introuvable.'); return }
        setContract(c)
        setClient(clients.find(x => x.id === c.clientId) || null)
        setVehicle(fleet.find(x => x.id === c.vehicleId) || null)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erreur de chargement.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [contractId])

  const signedPdfUrl = contract?.signedPdfUrl || contract?.signed_pdf_url || null

  const downloadSignedPdf = () => {
    if (signedPdfUrl) window.open(signedPdfUrl, '_blank', 'noopener')
  }

  const handlePrint = () => {
    if (!signedPdfUrl) return
    const w = window.open(signedPdfUrl, '_blank', 'noopener')
    if (w) {
      w.addEventListener('load', () => { try { w.print() } catch {} })
    }
  }

  if (loading) {
    return <div className="page-body" style={{ padding: 40, textAlign: 'center' }}>Chargement…</div>
  }
  if (error) {
    return (
      <div className="page-body" style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
        <div className="alert alert-danger" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
        <button className="btn-ink" onClick={onDone}>Retour</button>
      </div>
    )
  }

  return (
    <div className="page-body" style={{ padding: 40, maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
      <CheckCircle size={56} color="#16a34a" style={{ margin: '0 auto 12px', display: 'block' }} />
      <h1 style={{ marginBottom: 8 }}>Contrat signé</h1>
      <p style={{ color: 'var(--text2)', marginBottom: 24 }}>
        Le client a signé le contrat
        {contract?.signedAt || contract?.signed_at
          ? ` le ${new Date(contract.signedAt || contract.signed_at).toLocaleString('fr-FR')}`
          : ''}.
      </p>

      <div className="card mb-3" style={{ padding: 16, textAlign: 'left' }}>
        <div><strong>Client:</strong> {client ? `${client.firstName} ${client.lastName}` : '—'}</div>
        <div><strong>Véhicule:</strong> {vehicle ? `${vehicle.make} ${vehicle.model} — ${vehicle.plate}` : '—'}</div>
        <div><strong>N° Contrat:</strong> {contract?.contractNumber || contract?.id}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', margin: '24px 0' }}>
        <button className="btn-ink" style={{ fontSize: 14 }} disabled={!signedPdfUrl} onClick={downloadSignedPdf}>
          <Download size={15} /> Télécharger le PDF signé
        </button>
        <button className="btn-outline-ink" style={{ fontSize: 14 }} disabled={!signedPdfUrl} onClick={handlePrint}>
          <Printer size={15} /> Imprimer
        </button>
      </div>

      {!signedPdfUrl && (
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Le PDF signé est en cours de génération — réessayez dans un instant.
        </p>
      )}

      <button className="btn-ink" style={{ fontSize: 15, marginTop: 16 }} onClick={onDone}>
        <Home size={15} /> Terminer
      </button>
    </div>
  )
}
