import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { Download, Edit2 } from 'lucide-react'
import {
  getClients, saveClient,
  getContracts,
  getAgency,
} from '../lib/db'

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
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

export default function Clients() {
  const { t } = useTranslation('clients')
  const [clients, setClients] = useState([])
  const [contracts, setContracts] = useState([])
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [flagId, setFlagId] = useState(null)
  const [flagData, setFlagData] = useState({ category: 'Impayé', note: '' })
  const flagRef = useRef(null)

  // Load data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getClients(), getContracts(), getAgency()]).then(([c, ct, ag]) => {
      if (cancelled) return
      setClients(c)
      setContracts(ct)
      setAgency(ag)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Close flag dropdown on outside click
  useEffect(() => {
    if (!flagId) return
    const handler = (e) => {
      if (flagRef.current && !flagRef.current.contains(e.target)) setFlagId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [flagId])

  const reload = async () => {
    const [c, ct] = await Promise.all([getClients(), getContracts()])
    setClients(c)
    setContracts(ct)
  }

  const startEdit = (c) => {
    setEditId(c.id)
    setEditData({ phone: c.phone || '', email: c.email || '' })
    setFlagId(null)
  }

  const saveEdit = async (c) => {
    await saveClient({ ...c, phone: editData.phone, email: editData.email })
    setEditId(null)
    reload()
  }

  const openFlag = (c) => {
    setFlagId(c.id)
    setFlagData(c.flag ? { category: c.flag.category, note: c.flag.note || '' } : { category: 'Impayé', note: '' })
    setEditId(null)
  }

  const saveFlag = async (c) => {
    await saveClient({ ...c, flag: { category: flagData.category, note: flagData.note } })
    setFlagId(null)
    reload()
  }

  const removeFlag = async (c) => {
    await saveClient({ ...c, flag: null })
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
