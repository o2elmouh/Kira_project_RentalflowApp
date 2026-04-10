import { useState, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import {
  getDeposits,
  getContracts,
} from '../../lib/db'
import { holdDeposit, releaseDeposit } from '../../utils/accounting.js'
import Modal from './Modal'
import {
  card, tableStyle, th, td, inputStyle, selectStyle,
  btnPrimary, btnSecondary, badge, fmt, fmtDate,
  DEPOSIT_STATUS_LABELS, DEPOSIT_STATUS_COLORS,
} from './accountingStyles'

// ══════════════════════════════════════════════════════════
// TAB 4: Dépôts de garantie
// ══════════════════════════════════════════════════════════
export default function TabDeposits() {
  const [deposits, setDeposits]   = useState([])
  const [showHold, setShowHold]   = useState(false)
  const [showRelease, setShowRelease] = useState(null) // deposit object
  const [contracts, setContracts] = useState([])
  const [error, setError] = useState('')

  const [holdForm, setHoldForm] = useState({
    clientName: '', vehicleName: '', amount: '', contractId: '', date: new Date().toISOString().slice(0, 10),
  })

  const [deductions, setDeductions] = useState([{ reason: '', amount: '', accountCode: '3020' }])

  const load = useCallback(async () => {
    setDeposits(await getDeposits())
    setContracts((await getContracts()).filter(c => c.status === 'active'))
  }, [])

  useEffect(() => { load() }, [load])

  const handleHold = async () => {
    setError('')
    if (!holdForm.clientName.trim() || !holdForm.amount || Number(holdForm.amount) <= 0) {
      setError('Nom du client et montant requis.')
      return
    }
    try {
      await holdDeposit({
        contractId:  holdForm.contractId || null,
        clientName:  holdForm.clientName.trim(),
        vehicleName: holdForm.vehicleName.trim(),
        amount:      Number(holdForm.amount),
        date:        holdForm.date,
      })
      setShowHold(false)
      setHoldForm({ clientName: '', vehicleName: '', amount: '', contractId: '', date: new Date().toISOString().slice(0, 10) })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRelease = async () => {
    setError('')
    const validDeds = deductions.filter(d => d.reason.trim() && Number(d.amount) > 0)
    const totalDed  = validDeds.reduce((s, d) => s + Number(d.amount), 0)
    if (totalDed > showRelease.amount) {
      setError('Les retenues dépassent le montant du dépôt.')
      return
    }
    try {
      await releaseDeposit({ depositId: showRelease.id, deductions: validDeds.map(d => ({ ...d, amount: Number(d.amount) })) })
      setShowRelease(null)
      setDeductions([{ reason: '', amount: '', accountCode: '3020' }])
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const DEDUCTION_REASONS = ['Carburant', 'Nettoyage', 'Dommage', 'Kilométrage', 'Autre']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={btnPrimary} onClick={() => { setShowHold(true); setError('') }}><Plus size={14} /> Enregistrer dépôt</button>
      </div>

      <div style={card}>
        {deposits.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucun dépôt enregistré.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Client', 'Véhicule', 'Montant', 'Statut', 'Date', 'Action'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id}>
                  <td style={td}>{d.clientName}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{d.vehicleName || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(d.amount)} MAD</td>
                  <td style={td}>
                    <span style={badge(DEPOSIT_STATUS_COLORS[d.status] || DEPOSIT_STATUS_COLORS.held)}>
                      {DEPOSIT_STATUS_LABELS[d.status] || d.status}
                    </span>
                  </td>
                  <td style={td}>{fmtDate(d.heldAt)}</td>
                  <td style={td}>
                    {d.status === 'held' && (
                      <button
                        style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}
                        onClick={() => { setShowRelease(d); setDeductions([{ reason: '', amount: '', accountCode: '3020' }]); setError('') }}
                      >
                        Libérer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hold deposit modal */}
      {showHold && (
        <Modal title="Enregistrer un dépôt de garantie" onClose={() => setShowHold(false)}>
          {error && <div style={{ background: '#3b1a1a', color: '#f87171', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Client</label>
              <input style={inputStyle} value={holdForm.clientName} onChange={e => setHoldForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Nom du client" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Véhicule</label>
              <input style={inputStyle} value={holdForm.vehicleName} onChange={e => setHoldForm(f => ({ ...f, vehicleName: e.target.value }))} placeholder="Marque Modèle Année" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Montant (MAD)</label>
              <input type="number" style={inputStyle} value={holdForm.amount} onChange={e => setHoldForm(f => ({ ...f, amount: e.target.value }))} placeholder="3000" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Contrat lié (optionnel)</label>
              <select style={selectStyle} value={holdForm.contractId} onChange={e => setHoldForm(f => ({ ...f, contractId: e.target.value }))}>
                <option value="">— Aucun —</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>{c.contractNumber} — {c.clientName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" style={inputStyle} value={holdForm.date} onChange={e => setHoldForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={() => setShowHold(false)}>Annuler</button>
              <button style={btnPrimary} onClick={handleHold}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Release deposit modal */}
      {showRelease && (
        <Modal title={`Libérer dépôt — ${showRelease.clientName}`} onClose={() => setShowRelease(null)}>
          {error && <div style={{ background: '#3b1a1a', color: '#f87171', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Montant du dépôt: </span>
            <span style={{ fontWeight: 700, color: '#fbbf24' }}>{fmt(showRelease.amount)} MAD</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Retenues</div>
          {deductions.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                style={{ ...selectStyle, flex: 1 }}
                value={d.reason}
                onChange={e => {
                  const next = [...deductions]
                  next[i] = { ...next[i], reason: e.target.value }
                  setDeductions(next)
                }}
              >
                <option value="">— Motif —</option>
                {DEDUCTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input
                type="number"
                placeholder="Montant"
                style={{ ...inputStyle, width: 110 }}
                value={d.amount}
                onChange={e => {
                  const next = [...deductions]
                  next[i] = { ...next[i], amount: e.target.value }
                  setDeductions(next)
                }}
              />
              <select
                style={{ ...selectStyle, width: 90 }}
                value={d.accountCode}
                onChange={e => {
                  const next = [...deductions]
                  next[i] = { ...next[i], accountCode: e.target.value }
                  setDeductions(next)
                }}
              >
                <option value="3020">3020</option>
                <option value="3010">3010</option>
                <option value="4000">4000</option>
              </select>
              {deductions.length > 1 && (
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}
                  onClick={() => setDeductions(deductions.filter((_, j) => j !== i))}
                ><X size={14} /></button>
              )}
            </div>
          ))}
          <button
            style={{ ...btnSecondary, fontSize: 12, marginBottom: 16 }}
            onClick={() => setDeductions([...deductions, { reason: '', amount: '', accountCode: '3020' }])}
          >
            + Ajouter retenue
          </button>

          {(() => {
            const totalDed = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
            const refund   = showRelease.amount - totalDed
            return (
              <div style={{ background: 'var(--bg-tertiary, #252a3a)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>Total retenues:</span>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>{fmt(totalDed)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: 'var(--text2)' }}>Remboursement client:</span>
                  <span style={{ color: refund >= 0 ? '#4ade80' : '#f87171' }}>{fmt(refund)} MAD</span>
                </div>
              </div>
            )
          })()}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={btnSecondary} onClick={() => setShowRelease(null)}>Annuler</button>
            <button style={btnPrimary} onClick={handleRelease}>Confirmer libération</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
