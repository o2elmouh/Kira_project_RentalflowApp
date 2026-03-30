import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { FileText, Download, X, Edit2, Flag, Eye } from 'lucide-react'
import {
  getClients, saveClient,
  getContracts, updateContract,
  getInvoices, saveInvoice, updateInvoice,
  getFleet,
  getAgency, saveAgency,
  getFleetConfig, saveFleetConfig, resetFleetConfig,
  getGeneralConfig, saveGeneralConfig,
} from '../storage'
import { generateContract } from '../pdf'
import { api } from '../lib/api'
import { useIsAdmin } from '../lib/UserContext'

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

const FLAG_CATEGORIES = ['Impayé', 'Dommage non remboursé', 'Litige', 'Blacklist', 'Autre']

function flagBadgeStyle(category) {
  const map = {
    Blacklist: { background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
    Impayé: { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' },
    Litige: { background: '#f5f3ff', color: '#7c3aed', borderColor: '#c4b5fd' },
    'Dommage non remboursé': { background: '#fefce8', color: '#a16207', borderColor: '#fde047' },
    Autre: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' },
  }
  return map[category] || map['Autre']
}

// ─────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────

export function Clients() {
  const { t } = useTranslation('clients')
  const [clients, setClients] = useState(() => getClients())
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [flagId, setFlagId] = useState(null)
  const [flagData, setFlagData] = useState({ category: 'Impayé', note: '' })
  const flagRef = useRef(null)
  const [contracts, setContracts] = useState(() => getContracts())
  const agency = getAgency()

  // Close flag dropdown on outside click
  useEffect(() => {
    if (!flagId) return
    const handler = (e) => {
      if (flagRef.current && !flagRef.current.contains(e.target)) setFlagId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [flagId])

  const reload = () => { setClients(getClients()); setContracts(getContracts()) }

  const startEdit = (c) => {
    setEditId(c.id)
    setEditData({ phone: c.phone || '', email: c.email || '' })
    setFlagId(null)
  }

  const saveEdit = (c) => {
    saveClient({ ...c, phone: editData.phone, email: editData.email })
    setEditId(null)
    reload()
  }

  const openFlag = (c) => {
    setFlagId(c.id)
    setFlagData(c.flag ? { category: c.flag.category, note: c.flag.note || '' } : { category: 'Impayé', note: '' })
    setEditId(null)
  }

  const saveFlag = (c) => {
    saveClient({ ...c, flag: { category: flagData.category, note: flagData.note } })
    setFlagId(null)
    reload()
  }

  const removeFlag = (c) => {
    saveClient({ ...c, flag: null })
    setFlagId(null)
    reload()
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(agency.name || 'Car Rental Agency', 14, 14)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(t('pdfTitle'), 14, 21)

    const rows = clients.map(c => {
      const cContracts = contracts.filter(ct => ct.clientId === c.id)
      const totalPaye = cContracts.reduce((s, ct) => s + (Number(ct.totalTTC) || 0), 0)
      return [
        `${c.firstName} ${c.lastName}`,
        c.cinNumber || '—',
        c.phone || '—',
        c.email || '—',
        c.nationality || '—',
        cContracts.length,
        `${totalPaye.toFixed(0)} MAD`,
        c.flag ? c.flag.category : '—',
      ]
    })

    doc.autoTable({
      startY: 26,
      head: [[t('headers.fullName'), t('headers.cin'), t('headers.phone'), t('headers.email'), t('headers.nationality'), t('headers.contractCount'), t('headers.totalPaid'), t('headers.flag')]],
      body: rows,
      headStyles: { fillColor: [28, 26, 22], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 249, 246] },
    })

    const today = new Date().toISOString().slice(0, 10)
    doc.save(`clients-export-${today}.pdf`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('count', { count: clients.length })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={15} /> {t('exportPdf')}
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            {clients.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>{t('empty')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    {[
                      t('headers.fullName'), t('headers.cin'), t('headers.phone'), t('headers.email'),
                      t('headers.nationality'), t('headers.contractCount'), t('headers.totalDays'),
                      t('headers.totalPaid'), t('headers.flag'), t('headers.actions')
                    ].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => {
                    const cContracts = contracts.filter(ct => ct.clientId === c.id)
                    const totalDays = cContracts.reduce((s, ct) => s + (Number(ct.days) || daysBetween(ct.startDate, ct.endDate)), 0)
                    const totalPaye = cContracts.reduce((s, ct) => s + (Number(ct.totalTTC) || 0), 0)
                    const isEditing = editId === c.id
                    const isFlagging = flagId === c.id

                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg2)' : undefined }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.firstName} {c.lastName}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{c.cinNumber || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {isEditing ? (
                            <input className="form-input" style={{ padding: '4px 8px', fontSize: 12, width: 130 }} value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
                          ) : c.phone || '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {isEditing ? (
                            <input className="form-input" style={{ padding: '4px 8px', fontSize: 12, width: 160 }} value={editData.email} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} />
                          ) : c.email || '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{c.nationality || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cContracts.length}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{totalDays} j</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600 }}>{totalPaye.toFixed(0)} MAD</td>
                        <td style={{ padding: '10px 12px', position: 'relative' }}>
                          {c.flag ? (
                            <span
                              style={{ ...flagBadgeStyle(c.flag.category), padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: '1px solid', cursor: 'pointer', display: 'inline-block' }}
                              onClick={() => openFlag(c)}
                              title={c.flag.note || c.flag.category}
                            >
                              {c.flag.category}
                            </span>
                          ) : (
                            <button
                              onClick={() => openFlag(c)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, opacity: 0.4, transition: 'opacity .15s' }}
                              onMouseEnter={e => e.currentTarget.style.opacity = 1}
                              onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                              title={t('actions.addFlag')}
                            >
                              🚩
                            </button>
                          )}
                          {isFlagging && (
                            <div
                              ref={flagRef}
                              style={{ position: 'absolute', zIndex: 200, top: 36, left: 0, background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: 12, width: 240, boxShadow: '0 4px 20px rgba(0,0,0,.13)' }}
                            >
                              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12 }}>{t('actions.setFlag')}</div>
                              <select
                                className="form-input"
                                style={{ fontSize: 12, padding: '4px 6px', marginBottom: 8, width: '100%' }}
                                value={flagData.category}
                                onChange={e => setFlagData(p => ({ ...p, category: e.target.value }))}
                              >
                                {FLAG_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                              <textarea
                                className="form-input"
                                style={{ fontSize: 12, padding: '4px 6px', width: '100%', resize: 'vertical', minHeight: 48, marginBottom: 8 }}
                                placeholder={t('actions.notePlaceholder')}
                                value={flagData.note}
                                onChange={e => setFlagData(p => ({ ...p, note: e.target.value }))}
                              />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '5px 0' }} onClick={() => saveFlag(c)}>{t('actions.saveFlag')}</button>
                                {c.flag && <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 8px' }} onClick={() => removeFlag(c)}>{t('actions.removeFlag')}</button>}
                                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 8px' }} onClick={() => setFlagId(null)}>{t('actions.cancel')}</button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveEdit(c)}>{t('actions.save')}</button>
                              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditId(null)}>{t('actions.cancel')}</button>
                            </div>
                          ) : (
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => startEdit(c)}>
                              <Edit2 size={13} /> {t('actions.edit')}
                            </button>
                          )}
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// CONTRACTS
// ─────────────────────────────────────────────────────────

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

export function Contracts({ onRestitution }) {
  const { t } = useTranslation('contracts')
  const [contracts, setContracts] = useState(() => getContracts())
  const [selected, setSelected] = useState(null)
  const [showProlonger, setShowProlonger] = useState(false)
  const [prolongForm, setProlongForm] = useState({ newEndDate: '', newDailyRate: '' })
  const [prolongMsg, setProlongMsg] = useState(null)
  const clients = getClients()
  const fleet = getFleet()
  const agency = getAgency()

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

  const confirmProlongation = (contract) => {
    const { newEndDate, newDailyRate } = prolongForm
    if (!newEndDate) return
    const extraDays = daysBetween(contract.endDate, newEndDate)
    if (extraDays <= 0) return
    const rate = Number(newDailyRate)
    const extraAmount = extraDays * rate
    const newTotalTTC = (Number(contract.totalTTC) || 0) + extraAmount
    const newTotalHT = newTotalTTC / 1.20
    const newTva = newTotalTTC - newTotalHT
    updateContract(contract.id, {
      endDate: newEndDate,
      days: (contract.days || daysBetween(contract.startDate, contract.endDate)) + extraDays,
      totalTTC: Math.round(newTotalTTC * 100) / 100,
      totalHT: Math.round(newTotalHT * 100) / 100,
      tva: Math.round(newTva * 100) / 100,
    })
    const originalRate = Number(contract.dailyRate) || 0
    const rateChanged = rate !== originalRate && originalRate > 0
    if (rateChanged) {
      saveInvoice({
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
      const invoices = getInvoices()
      const existing = invoices.find(i => i.contractId === contract.id)
      if (existing) {
        updateInvoice(existing.id, {
          totalTTC: Math.round(((existing.totalTTC || 0) + extraAmount) * 100) / 100,
          totalHT: Math.round(((existing.totalHT || 0) + extraAmount / 1.20) * 100) / 100,
          tva: Math.round(((existing.tva || 0) + extraAmount - extraAmount / 1.20) * 100) / 100,
        })
      }
      setProlongMsg(t('panel.extendSuccessUpdated'))
    }
    const refreshed = getContracts()
    setContracts(refreshed)
    setShowProlonger(false)
  }

  const panelContract = selected ? contracts.find(c => c.id === selected) : null
  const panelClient = panelContract ? getClient(panelContract.clientId) : {}
  const panelVehicle = panelContract ? getVehicle(panelContract.vehicleId) : {}

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
// INVOICES (unchanged)
// ─────────────────────────────────────────────────────────

export function Invoices() {
  const { t } = useTranslation('invoices')
  const [invoices, setInvoices] = useState(() => getInvoices())
  const total = invoices.reduce((s, i) => s + (i.totalTTC || 0), 0)
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

// ─────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────

const SETTINGS_TABS_KEYS = [
  { id: 'agence',  key: 'tabs.agency' },
  { id: 'parc',    key: 'tabs.fleetConfig' },
  { id: 'general', key: 'tabs.general' },
  { id: 'equipe',  key: 'tabs.team' },
]

export function Settings() {
  const { t } = useTranslation('settings')
  const [activeTab, setActiveTab] = useState('agence')

  return (
    <div>
      <div className="page-header"><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></div>
      <div className="page-body">
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {SETTINGS_TABS_KEYS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 20px', fontSize: 14, fontWeight: 600,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color .15s',
              }}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {activeTab === 'agence' && <AgenceTab />}
        {activeTab === 'parc' && <FleetConfigTab />}
        {activeTab === 'general' && <GeneralConfigTab />}
        {activeTab === 'equipe' && <TeamTab />}
      </div>
    </div>
  )
}

function AgenceTab() {
  const [agency, setAgency] = useState(getAgency)
  const [saved, setSaved] = useState(false)

  const save = () => { saveAgency(agency); setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const field = (label, key, placeholder = '') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        value={agency[key] || ''}
        placeholder={placeholder}
        onChange={e => setAgency(p => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <>
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-header">
          <h3>Informations générales</h3>
          {saved && <span className="badge badge-green">Enregistré</span>}
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field('Nom de l\'agence', 'name', 'Ex: Location Auto Maroc')}
            {field('Ville', 'city', 'Ex: Casablanca')}
          </div>
          <div className="form-row cols-2">
            {field('Adresse', 'address', 'Ex: 12 Rue des Fleurs, Casablanca')}
            {field('Téléphone', 'phone', 'Ex: +212 6XX XXX XXX')}
          </div>
          <div className="form-row cols-1">
            {field('Email de l\'agence', 'email', 'Ex: contact@agence.ma')}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: 16 }}>
        <div className="card-header">
          <h3>Identifiants fiscaux &amp; légaux</h3>
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field('ICE', 'ice', 'Identifiant Commun de l\'Entreprise')}
            {field('RC', 'rc', 'Registre de Commerce')}
          </div>
          <div className="form-row cols-2">
            {field('IF — Identifiant Fiscal', 'if_number', 'Ex: 12345678')}
            {field('Patente', 'patente', 'Numéro de patente')}
          </div>
          <div className="form-row cols-1">
            {field('N° Police d\'assurance', 'insurance_policy', 'Ex: ASS-2024-00123')}
          </div>
          <button className="btn btn-primary mt-2" onClick={save}>Enregistrer les paramètres</button>
        </div>
      </div>
    </>
  )
}

const DEFAULT_OPTIONS = [
  { id: 'cdw', name: 'CDW — Collision Damage Waiver', pricingType: 'per_day', price: 80, enabled: true },
  { id: 'pai', name: 'PAI — Protection Accident Individuel', pricingType: 'per_day', price: 40, enabled: true },
]

function RentalOptionsSection() {
  const loadOptions = () => {
    const cfg = getGeneralConfig()
    return cfg.rentalOptions && cfg.rentalOptions.length > 0 ? cfg.rentalOptions : DEFAULT_OPTIONS
  }
  const [options, setOptions] = useState(loadOptions)
  const [saved, setSaved] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const update = (id, field, value) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o))
    setSaved(false)
  }

  const addOption = () => {
    const newId = 'opt_' + Date.now()
    setOptions(prev => [...prev, { id: newId, name: '', pricingType: 'per_day', price: 0, enabled: true }])
  }

  const removeOption = (id) => {
    setOptions(prev => prev.filter(o => o.id !== id))
  }

  const save = () => {
    const cfg = getGeneralConfig()
    saveGeneralConfig({ ...cfg, rentalOptions: options })
    setSaved(true)
    setEditMode(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const PROTECTED = ['cdw', 'pai']

  return (
    <div className="card" style={{ maxWidth: 780 }}>
      <div className="card-header">
        <h3>Options de location</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span className="badge badge-green">Enregistré</span>}
          {!editMode && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Modifier</button>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map(opt => (
            <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: `36px 1fr 130px 90px${editMode && !PROTECTED.includes(opt.id) ? ' 36px' : ''}`, gap: 8, alignItems: 'center', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              <input
                type="checkbox"
                checked={opt.enabled}
                onChange={e => update(opt.id, 'enabled', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <input
                className="form-input"
                style={{ fontSize: 13, padding: '5px 8px', minWidth: 0 }}
                value={opt.name}
                placeholder="Nom de l'option"
                readOnly={!editMode}
                onChange={e => update(opt.id, 'name', e.target.value)}
              />
              <select
                className="form-select"
                style={{ fontSize: 12, padding: '5px 8px' }}
                value={opt.pricingType}
                disabled={!editMode}
                onChange={e => update(opt.id, 'pricingType', e.target.value)}
              >
                <option value="per_day">Par jour</option>
                <option value="fixed">Fixe</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <input
                  className="form-input text-mono"
                  style={{ fontSize: 13, padding: '5px 8px', width: 0, flex: 1, minWidth: 0 }}
                  type="number"
                  min="0"
                  readOnly={!editMode}
                  value={opt.price}
                  onChange={e => update(opt.id, 'price', Number(e.target.value))}
                />
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>MAD</span>
              </div>
              {editMode && !PROTECTED.includes(opt.id) && (
                <button
                  onClick={() => removeOption(opt.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#ef4444', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Supprimer"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
        {editMode && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={addOption}>
              + Ajouter une option
            </button>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>
              Enregistrer
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => { setOptions(loadOptions()); setEditMode(false) }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureSection() {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [savedSig, setSavedSig] = useState(() => getGeneralConfig().defaultSignature || null)
  const [editMode, setEditMode] = useState(!getGeneralConfig().defaultSignature)
  const [saveFeedback, setSaveFeedback] = useState(false)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setDrawing(true)
  }

  const draw = (e) => {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c1a16'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const stopDraw = () => setDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const saveSig = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const cfg = getGeneralConfig()
    saveGeneralConfig({ ...cfg, defaultSignature: dataUrl })
    setSavedSig(dataUrl)
    setEditMode(false)
    setSaveFeedback(true)
    setTimeout(() => setSaveFeedback(false), 2000)
  }

  const startEdit = () => {
    setEditMode(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }, 50)
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-header">
        <h3>Signature par défaut</h3>
        {saveFeedback && <span className="badge badge-green">Enregistrée</span>}
      </div>
      <div className="card-body">
        {!editMode && savedSig ? (
          <div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'inline-block', marginBottom: 12 }}>
              <img src={savedSig} alt="Signature enregistrée" style={{ display: 'block', maxWidth: 400 }} />
            </div>
            <div>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={startEdit}>
                Modifier la signature
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              Dessinez votre signature ci-dessous :
            </div>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={clearCanvas}>
                Effacer
              </button>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveSig}>
                Enregistrer la signature
              </button>
              {savedSig && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditMode(false)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GeneralConfigTab() {
  const [activeSection, setActiveSection] = useState('options')

  const sections = [
    { id: 'options',    label: 'Options de location' },
    { id: 'signature',  label: 'Signature par défaut' },
    { id: 'params',     label: 'Paramètres' },
  ]

  return (
    <div>
      {/* Tabs horizontaux */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: activeSection === s.id ? 700 : 400,
              color: activeSection === s.id ? 'var(--accent)' : 'var(--text2)',
              borderBottom: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              transition: 'color .15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'options' && <RentalOptionsSection />}
      {activeSection === 'signature' && <SignatureSection />}
      {activeSection === 'params' && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="card-header"><h3>Paramètres généraux</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>
              D'autres paramètres généraux seront ajoutés ici prochainement.
            </p>
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>
              <span>ℹ️</span>
              <span>La limite kilométrique est désormais configurable par véhicule dans la fiche de chaque voiture (onglet Flotte).</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const FLEET_CONFIG_COLS = [
  { key: 'make',             label: 'Marque',                     type: 'text' },
  { key: 'warrantyGeneral',  label: 'Garantie générale',          type: 'text' },
  { key: 'warrantyYears',    label: 'Durée (ans)',                type: 'number' },
  { key: 'warrantyBattery',  label: 'Garantie batterie',          type: 'text' },
  { key: 'controlTechYears', label: 'Contrôle technique (ans)',   type: 'number' },
  { key: 'vidangeKm',        label: 'Vidange (km)',               type: 'number' },
  { key: 'courroieKm',       label: 'Courroie distribution (km)', type: 'number' },
  { key: 'extension',        label: 'Extension possible',         type: 'text' },
]

function FleetConfigTab() {
  const [config, setConfig] = useState(() => getFleetConfig())
  const [editRow, setEditRow] = useState(null)
  const [editData, setEditData] = useState({})
  const [savedRow, setSavedRow] = useState(null)

  const startEditRow = (i) => {
    setEditRow(i)
    setEditData({ ...config[i] })
  }

  const saveRow = (i) => {
    const updated = config.map((r, idx) => idx === i ? { ...editData } : r)
    setConfig(updated)
    saveFleetConfig(updated)
    setEditRow(null)
    setSavedRow(i)
    setTimeout(() => setSavedRow(null), 1500)
  }

  const handleReset = () => {
    if (!window.confirm('Réinitialiser la configuration parc aux valeurs par défaut ?')) return
    const defaults = resetFleetConfig()
    setConfig(defaults)
    setEditRow(null)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Configuration parc</h3>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleReset}>
          Réinitialiser les valeurs par défaut
        </button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              {FLEET_CONFIG_COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
              <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.map((row, i) => {
              const isEditing = editRow === i
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg2)' : undefined }}>
                  {FLEET_CONFIG_COLS.map(col => (
                    <td key={col.key} style={{ padding: '8px 12px' }}>
                      {isEditing ? (
                        col.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!editData[col.key]}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: e.target.checked }))}
                          />
                        ) : (
                          <input
                            className="form-input"
                            type={col.type === 'number' ? 'number' : 'text'}
                            style={{ padding: '4px 8px', fontSize: 12, width: col.type === 'number' ? 80 : 140 }}
                            value={editData[col.key] ?? ''}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: col.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          />
                        )
                      ) : (
                        col.type === 'boolean'
                          ? (row[col.key] ? '✓' : '✗')
                          : (row[col.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRow(i)}>Sauvegarder</button>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditRow(null)}>Annuler</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => startEditRow(i)}>
                          <Edit2 size={13} /> Modifier
                        </button>
                        {savedRow === i && <span className="badge badge-green" style={{ fontSize: 11 }}>Enregistré</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Team Tab
// ─────────────────────────────────────────────────────────
function TeamTab() {
  const isAdmin = useIsAdmin()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('agent')
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error', msg }

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getTeam()
      setMembers(data)
    } catch {
      // no-op if not connected to backend
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setFeedback(null)
    try {
      await api.inviteMember({ email: inviteEmail, role: inviteRole })
      setFeedback({ type: 'success', msg: `Invitation envoyée à ${inviteEmail}` })
      setInviteEmail('')
      load()
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (id, role) => {
    try {
      await api.updateMemberRole(id, role)
      setMembers(m => m.map(x => x.id === id ? { ...x, role } : x))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Retirer ${name} de l'agence ?`)) return
    try {
      await api.removeMember(id)
      setMembers(m => m.filter(x => x.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const roleBadge = (role) => (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: role === 'admin' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.15)',
      color:      role === 'admin' ? '#a5b4fc' : '#86efac',
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>{role}</span>
  )

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Invite form — admin only */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Inviter un membre</h3>
          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: feedback.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color:      feedback.type === 'success' ? '#86efac' : '#fca5a5',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>{feedback.msg}</div>
          )}
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email" required placeholder="email@exemple.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: 200 }}
            />
            <select
              value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="form-input" style={{ width: 120 }}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary" disabled={inviting}>
              {inviting ? 'Envoi…' : 'Inviter'}
            </button>
          </form>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            L'invité recevra un lien par email pour créer son compte.
          </p>
        </div>
      )}

      {/* Members list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
          Membres ({members.length})
        </div>
        {loading ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Aucun membre trouvé. Configurez votre backend Railway pour afficher l'équipe.</div>
        ) : members.map((m, i) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--text2)',
            }}>
              {(m.full_name || m.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.full_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.email}</div>
            </div>
            {isAdmin ? (
              <select
                value={m.role || 'agent'}
                onChange={e => handleRoleChange(m.id, e.target.value)}
                className="form-input" style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            ) : roleBadge(m.role)}
            {isAdmin && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => handleRemove(m.id, m.full_name || m.email)}
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
