import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Download, X } from 'lucide-react'
import {
  getClients,
  getContracts, updateContract,
  getInvoices, saveInvoice, updateInvoice,
  getFleet,
  getAgency,
} from '../lib/db'
import { generateContract } from '../utils/pdf'

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

function statusBadgeClass(status) {
  if (status === 'active') return 'badge-green'
  if (status === 'cancelled') return 'badge-red'
  return 'badge-gray'
}

function statusLabel(status, t) {
  if (status === 'active') return t ? t('status.active', { ns: 'common' }) : 'Actif'
  if (status === 'cancelled') return t ? t('status.cancelled', { ns: 'common' }) : 'Annulé'
  return t ? t('status.closed', { ns: 'common' }) : 'Clôturé'
}

function SectionBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, isBold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontWeight: isBold ? 700 : 400 }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// CONTRACTS
// ─────────────────────────────────────────────────────────

export default function Contracts({ onRestitution }) {
  const { t } = useTranslation('contracts')
  const [contracts, setContracts] = useState([])
  const [clients, setClients] = useState([])
  const [fleet, setFleet] = useState([])
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showProlonger, setShowProlonger] = useState(false)
  const [prolongForm, setProlongForm] = useState({ newEndDate: '', newDailyRate: '' })
  const [prolongMsg, setProlongMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getContracts(), getClients(), getFleet(), getAgency()]).then(([ct, cl, fl, ag]) => {
      if (cancelled) return
      setContracts(ct)
      setClients(cl)
      setFleet(fl)
      setAgency(ag)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const getClient = (id) => clients.find(c => c.id === id) || {}
  const getVehicle = (id) => fleet.find(v => v.id === id) || {}

  const downloadPDF = (contract) => {
    const client = getClient(contract.clientId)
    const vehicle = getVehicle(contract.vehicleId)
    generateContract(contract, client, vehicle, agency)
  }

  const openProlonger = (contract) => {
    const vehicle = getVehicle(contract.vehicleId)
    setProlongForm({
      newEndDate: '',
      newDailyRate: contract.dailyRate || vehicle.dailyRate || '',
    })
    setProlongMsg(null)
    setShowProlonger(true)
  }

  const confirmProlongation = async (contract) => {
    const { newEndDate, newDailyRate } = prolongForm
    if (!newEndDate) return
    const extraDays = daysBetween(contract.endDate, newEndDate)
    if (extraDays <= 0) return
    const rate = Number(newDailyRate)
    const extraAmount = extraDays * rate
    const newTotalTTC = (Number(contract.totalTTC) || 0) + extraAmount
    const newTotalHT = newTotalTTC / 1.20
    const newTva = newTotalTTC - newTotalHT
    await updateContract({
      ...contract,
      endDate: newEndDate,
      days: (contract.days || daysBetween(contract.startDate, contract.endDate)) + extraDays,
      totalTTC: Math.round(newTotalTTC * 100) / 100,
      totalHT: Math.round(newTotalHT * 100) / 100,
      tva: Math.round(newTva * 100) / 100,
    })
    const originalRate = Number(contract.dailyRate) || 0
    const rateChanged = rate !== originalRate && originalRate > 0
    if (rateChanged) {
      await saveInvoice({
        clientId: contract.clientId,
        clientName: contract.clientName,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        vehicleName: contract.vehicleName,
        items: [{ label: `Prolongation ${extraDays} jour(s)`, qty: extraDays, unitPrice: rate }],
        totalHT: Math.round((extraAmount / 1.20) * 100) / 100,
        tva: Math.round((extraAmount - extraAmount / 1.20) * 100) / 100,
        totalTTC: Math.round(extraAmount * 100) / 100,
        notes: 'Facture de prolongation',
      })
      setProlongMsg(t('panel.extendSuccess'))
    } else {
      const invoices = await getInvoices()
      const existing = invoices.find(i => i.contractId === contract.id)
      if (existing) {
        await updateInvoice({
          ...existing,
          totalTTC: Math.round(((existing.totalTTC || 0) + extraAmount) * 100) / 100,
          totalHT: Math.round(((existing.totalHT || 0) + extraAmount / 1.20) * 100) / 100,
          tva: Math.round(((existing.tva || 0) + extraAmount - extraAmount / 1.20) * 100) / 100,
        })
      }
      setProlongMsg(t('panel.extendSuccessUpdated'))
    }
    const refreshed = await getContracts()
    setContracts(refreshed)
    setShowProlonger(false)
  }

  const panelContract = selected ? contracts.find(c => c.id === selected) : null
  const panelClient = panelContract ? getClient(panelContract.clientId) : {}
  const panelVehicle = panelContract ? getVehicle(panelContract.vehicleId) : {}

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
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('count', { count: contracts.length })}</p>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            {contracts.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>{t('empty')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    {[t('headers.number'), t('headers.client'), t('headers.vehicle'), t('headers.startDate'), t('headers.endDate'), t('headers.duration'), t('headers.totalTTC'), t('headers.status'), t('headers.pdf')].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => {
                    const cl = getClient(c.clientId)
                    const ve = getVehicle(c.vehicleId)
                    const days = c.days || daysBetween(c.startDate, c.endDate)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => { setSelected(c.id); setShowProlonger(false); setProlongMsg(null) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0 }}
                          >
                            {c.contractNumber}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {cl.firstName ? `${cl.firstName} ${cl.lastName}` : (c.clientName || '—')}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {ve.make ? `${ve.make} ${ve.model}` : (c.vehicleName || '—')}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(c.startDate)}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(c.endDate)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{days} {t('daysSuffix')}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600 }}>{(c.totalTTC || 0).toLocaleString('fr-MA')} MAD</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge ${statusBadgeClass(c.status)}`}>{statusLabel(c.status, t)}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                            onClick={() => downloadPDF(c)}
                            title={t('downloadPdf')}
                          >
                            <FileText size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Side panel overlay */}
      {panelContract && (
        <>
          <div
            onClick={() => { setSelected(null); setShowProlonger(false); setProlongMsg(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999 }}
          />
          <div style={{
            position: 'fixed', right: 0, top: 0, height: '100vh', width: 420,
            background: 'white', zIndex: 1000, boxShadow: '-4px 0 24px rgba(0,0,0,.15)',
            overflowY: 'auto', padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{panelContract.contractNumber}</div>
                <span className={`badge ${statusBadgeClass(panelContract.status)}`} style={{ marginTop: 4 }}>{statusLabel(panelContract.status, t)}</span>
              </div>
              <button onClick={() => { setSelected(null); setShowProlonger(false); setProlongMsg(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <SectionBlock title={t('panel.client')}>
              <InfoRow label={t('panel.client')} value={`${panelClient.firstName || ''} ${panelClient.lastName || ''}`.trim() || panelContract.clientName || '—'} />
              <InfoRow label={t('panel.cin')} value={panelClient.cinNumber || '—'} />
              <InfoRow label={t('panel.phone')} value={panelClient.phone || '—'} />
              <InfoRow label={t('panel.email')} value={panelClient.email || '—'} />
            </SectionBlock>

            <SectionBlock title={t('panel.vehicle')}>
              <InfoRow label={t('panel.model')} value={panelVehicle.make ? `${panelVehicle.make} ${panelVehicle.model} (${panelVehicle.year})` : (panelContract.vehicleName || '—')} />
              <InfoRow label={t('panel.plate')} value={panelVehicle.plate || '—'} />
            </SectionBlock>

            <SectionBlock title={t('panel.dates')}>
              <InfoRow label={t('panel.start')} value={`${fmtDate(panelContract.startDate)}${panelContract.startTime ? ' ' + panelContract.startTime : ''}`} />
              <InfoRow label={t('panel.end')} value={`${fmtDate(panelContract.endDate)}${panelContract.endTime ? ' ' + panelContract.endTime : ''}`} />
              <InfoRow label={t('panel.duration')} value={`${panelContract.days || daysBetween(panelContract.startDate, panelContract.endDate)} ${t('panel.days')}`} />
            </SectionBlock>

            <SectionBlock title={t('panel.financial')}>
              <InfoRow label={t('panel.dailyRate')} value={`${panelVehicle.dailyRate || '—'} MAD`} />
              <InfoRow label={t('panel.numDays')} value={panelContract.days || daysBetween(panelContract.startDate, panelContract.endDate)} />
              <InfoRow label={t('panel.totalHT')} value={`${panelContract.totalHT || '—'} MAD`} />
              <InfoRow label={t('panel.vat')} value={`${panelContract.tva || '—'} MAD`} />
              <InfoRow label={t('panel.totalTTC')} value={`${panelContract.totalTTC || '—'} MAD`} isBold />
            </SectionBlock>

            <SectionBlock title={t('panel.details')}>
              <InfoRow label={t('panel.fuelLevel')} value={panelContract.fuelLevel || '—'} />
              <InfoRow label={t('panel.departureKm')} value={panelContract.mileageOut ? `${panelContract.mileageOut} km` : '—'} />
              <InfoRow label={t('panel.paymentMethod')} value={panelContract.paymentMethod || '—'} />
            </SectionBlock>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {panelContract.status === 'active' && !showProlonger && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => openProlonger(panelContract)}
                >
                  {t('panel.extend')}
                </button>
              )}
              {prolongMsg && (
                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                  {prolongMsg}
                </div>
              )}
              {showProlonger && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg2)', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t('extend.title')}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                    {t('extend.currentEnd')} <strong>{fmtDate(panelContract.endDate)}</strong>
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>{t('extend.newEnd')}</label>
                    <input
                      className="form-input"
                      type="date"
                      min={(() => {
                        const d = new Date(panelContract.endDate)
                        d.setDate(d.getDate() + 1)
                        return d.toISOString().slice(0, 10)
                      })()}
                      value={prolongForm.newEndDate}
                      onChange={e => setProlongForm(p => ({ ...p, newEndDate: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Tarif journalier</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        value={prolongForm.newDailyRate}
                        onChange={e => setProlongForm(p => ({ ...p, newDailyRate: e.target.value }))}
                        style={{ width: 100 }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}>MAD/jour</span>
                    </div>
                  </div>
                  {prolongForm.newEndDate && (() => {
                    const extra = daysBetween(panelContract.endDate, prolongForm.newEndDate)
                    const amount = extra * Number(prolongForm.newDailyRate)
                    return extra > 0 ? (
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>
                        Prolongation : {extra} jour{extra > 1 ? 's' : ''} · +{amount} MAD
                      </div>
                    ) : null
                  })()}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => { setShowProlonger(false); setProlongMsg(null) }}
                    >
                      Annuler
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                      onClick={() => confirmProlongation(panelContract)}
                      disabled={!prolongForm.newEndDate || daysBetween(panelContract.endDate, prolongForm.newEndDate) <= 0}
                    >
                      Confirmer la prolongation
                    </button>
                  </div>
                </div>
              )}
              {panelContract.status === 'active' && onRestitution && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#ea580c', borderColor: '#ea580c' }}
                  onClick={() => { setSelected(null); onRestitution(panelContract) }}
                >
                  {t('panel.restitute')}
                </button>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => downloadPDF(panelContract)}
              >
                <Download size={15} /> {t('panel.downloadPdf')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
