import { useEffect, useState } from 'react'
import { CheckCircle, Download, Printer, Home, AlertCircle } from 'lucide-react'
import { getContractById, getClient, getVehicle } from '../lib/db'
import { api } from '../lib/api'

export default function ContractSuccess({ contractId, onDone }) {
  const [contract, setContract] = useState(null)
  const [client, setClient]     = useState(null)
  const [vehicle, setVehicle]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const c = await getContractById(contractId)
        if (cancelled) return
        if (!c) { setError('Contrat introuvable.'); return }
        setContract(c)
        const [cl, v] = await Promise.all([
          c.clientId  ? getClient(c.clientId) : null,
          c.vehicleId ? getVehicle(c.vehicleId) : null,
        ])
        if (cancelled) return
        setClient(cl)
        setVehicle(v)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erreur de chargement.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [contractId])

  // Mints a fresh 60s signed URL on demand — no long-lived URLs in the DB.
  const fetchSignedUrl = async () => {
    const { url } = await api.getSignedPdfUrl(contractId)
    return url
  }

  const downloadSignedPdf = async () => {
    setDownloading(true)
    try {
      const url = await fetchSignedUrl()
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      alert('Impossible de récupérer le PDF: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  const handlePrint = async () => {
    setDownloading(true)
    try {
      const url = await fetchSignedUrl()
      const w = window.open(url, '_blank', 'noopener')
      if (w) w.addEventListener('load', () => { try { w.print() } catch {} })
    } catch (err) {
      alert('Impossible d’imprimer: ' + err.message)
    } finally {
      setDownloading(false)
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

  const hasSignedPdf = Boolean(contract?.signedPdfPath || contract?.signed_pdf_path)

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
        <button className="btn-ink" style={{ fontSize: 14 }} disabled={!hasSignedPdf || downloading} onClick={downloadSignedPdf}>
          <Download size={15} /> {downloading ? 'Préparation…' : 'Télécharger le PDF signé'}
        </button>
        <button className="btn-outline-ink" style={{ fontSize: 14 }} disabled={!hasSignedPdf || downloading} onClick={handlePrint}>
          <Printer size={15} /> Imprimer
        </button>
      </div>

      {!hasSignedPdf && (
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
