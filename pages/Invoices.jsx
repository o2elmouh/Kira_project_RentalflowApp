import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getInvoices } from '../lib/db'

// ─────────────────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────────────────

export default function Invoices() {
  const { t } = useTranslation('invoices')
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getInvoices().then(data => {
      if (cancelled) return
      setInvoices(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const total = invoices.reduce((s, i) => s + (i.totalTTC || 0), 0)

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
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
