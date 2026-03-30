import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getInvoices, getContracts } from '../lib/db'
import { api } from '../lib/api'
import { generateInvoice } from '../utils/pdf'

// ─────────────────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────────────────

export default function Invoices() {
  const { t } = useTranslation('invoices')
  const [invoices, setInvoices] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [waSending, setWaSending] = useState(null) // invoice id being sent
  const [waStatus, setWaStatus] = useState({})     // { [invoiceId]: 'ok'|'err' }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getInvoices(), getContracts()]).then(([invs, ctrs]) => {
      if (cancelled) return
      setInvoices(invs)
      setContracts(ctrs)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const total = invoices.reduce((s, i) => s + (i.totalTTC || 0), 0)

  const sendInvoiceWhatsApp = async (inv) => {
    const contract = contracts.find(c => c.id === inv.contractId) || {}
    const phone = contract.clientPhone || ''
    if (!phone) { alert('Numéro de téléphone client introuvable sur ce contrat.'); return }
    setWaSending(inv.id)
    try {
      const doc = generateInvoice({}, inv, contract)
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(doc.output('arraybuffer'))))
      await api.sendInvoiceWhatsApp({
        to: phone,
        clientName: inv.clientName,
        invoiceNumber: inv.invoiceNumber,
        pdfBase64,
        totalTTC: inv.totalTTC,
      })
      setWaStatus(s => ({ ...s, [inv.id]: 'ok' }))
    } catch (err) {
      console.error('[WhatsApp invoice]', err)
      setWaStatus(s => ({ ...s, [inv.id]: 'err' }))
    } finally {
      setWaSending(null)
      setTimeout(() => setWaStatus(s => { const n = { ...s }; delete n[inv.id]; return n }), 4000)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><div><h2>{t('title')}</h2></div></div>
        <div className="page-body"><p style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>Chargement…</p></div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header"><div><h2>{t('title')}</h2><p>{t('count', { count: invoices.length, total: (total || 0).toLocaleString('fr-MA') })}</p></div></div>
      <div className="page-body">
        <div className="card">
          <div className="card-body">
            {invoices.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('empty')}</p>}
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{inv.invoiceNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{inv.clientName} · {t('ref')} {inv.contractNumber}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>{(inv.totalTTC || 0).toLocaleString('fr-MA')} MAD</span>
                  <span className={`badge ${inv.status === 'paid' ? 'badge-green' : inv.status === 'pending' ? 'badge-orange' : 'badge-gray'}`}>
                    {inv.status === 'paid' ? t('status.paid') : inv.status === 'pending' ? t('status.pending') : inv.status || t('status.pending')}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Envoyer par WhatsApp"
                    disabled={waSending === inv.id}
                    onClick={() => sendInvoiceWhatsApp(inv)}
                    style={{ fontSize: 14, padding: '2px 6px' }}
                  >
                    {waSending === inv.id ? '…' : waStatus[inv.id] === 'ok' ? '✅' : waStatus[inv.id] === 'err' ? '❌' : '📱'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
