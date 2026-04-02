import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart2, BookOpen, List, Shield, Building2, Plus, X, ChevronDown, AlertCircle,
  TrendingUp, TrendingDown, Car, Clock,
} from 'lucide-react'
import {
  getAccounts,
  saveAccount,
  getTransactions,
  getJournalEntries,
  getDeposits,
  saveDeposit,
  getContracts,
  getFleet,
} from '../storage.js'
import { holdDeposit, releaseDeposit, computeAgencyPayout } from '../utils/accounting.js'

// ── Formatters ────────────────────────────────────────────
const fmt = (n) =>
  typeof n === 'number' ? n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

// ── Shared styles ─────────────────────────────────────────
const card = {
  background: 'var(--bg-secondary, #1e2130)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 10,
  padding: '20px 24px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const th = {
  padding: '10px 12px',
  textAlign: 'left',
  color: 'var(--text3, #8892a4)',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid var(--border, #2d3147)',
  background: 'var(--bg-tertiary, #252a3a)',
}

const td = {
  padding: '10px 12px',
  color: 'var(--text1, #e2e8f0)',
  borderBottom: '1px solid var(--border, #2d3147)',
  verticalAlign: 'middle',
}

const inputStyle = {
  background: 'var(--bg-tertiary, #252a3a)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 6,
  color: 'var(--text1, #e2e8f0)',
  padding: '7px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
}

const selectStyle = { ...inputStyle }

const btnPrimary = {
  background: 'var(--accent, #6366f1)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const btnSecondary = {
  background: 'transparent',
  color: 'var(--text2, #a0aec0)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: 13,
  cursor: 'pointer',
}

const badge = (color) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  ...color,
})

const DEPOSIT_STATUS_LABELS = {
  held:               'En attente',
  partially_released: 'Libéré partiel',
  released:           'Libéré',
  retained:           'Retenu',
}

const DEPOSIT_STATUS_COLORS = {
  held:               { background: '#7c3a00', color: '#fbbf24' },
  partially_released: { background: '#1e3a5f', color: '#60a5fa' },
  released:           { background: '#14532d', color: '#4ade80' },
  retained:           { background: '#4a1942', color: '#e879f9' },
}

// ── Modal wrapper ─────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1e2130)',
        border: '1px solid var(--border, #2d3147)',
        borderRadius: 12,
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border, #2d3147)' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text1, #e2e8f0)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────
function KpiCard({ label, value, color }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: 'var(--text3, #8892a4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text1, #e2e8f0)' }}>{value}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 1: Dashboard — three owner views
// ══════════════════════════════════════════════════════════

// ── SVG Bar Chart (no library) ────────────────────────────
function BarChart({ data, height = 180, colorA = '#6366f1', colorB = '#f59e0b' }) {
  if (!data.length) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune donnée.</p>

  const maxVal = Math.max(...data.flatMap(d => [d.a, d.b]), 1)
  const barW   = 18
  const gap    = 8
  const groupW = barW * 2 + gap + 16
  const svgW   = data.length * groupW + 40
  const padB   = 36

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgW} height={height + padB} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const x    = 20 + i * groupW
          const hA   = Math.round((d.a / maxVal) * height)
          const hB   = Math.round((d.b / maxVal) * height)
          const yA   = height - hA
          const yB   = height - hB
          return (
            <g key={i}>
              {/* bar A */}
              <rect x={x} y={yA} width={barW} height={hA} rx={3} fill={colorA} opacity={0.9}>
                <title>{d.labelA}: {d.a}</title>
              </rect>
              {/* bar B */}
              <rect x={x + barW + gap} y={yB} width={barW} height={hB} rx={3} fill={colorB} opacity={0.9}>
                <title>{d.labelB}: {d.b}</title>
              </rect>
              {/* x label */}
              <text
                x={x + barW + gap / 2}
                y={height + padB - 6}
                textAnchor="middle"
                fontSize={10}
                fill="#8892a4"
              >{d.label}</text>
            </g>
          )
        })}
        {/* baseline */}
        <line x1={16} y1={height} x2={svgW - 4} y2={height} stroke="#2d3147" strokeWidth={1} />
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colorA, marginRight: 4 }} />Utilisation (jours)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colorB, marginRight: 4 }} />Revenu (×100 MAD)</span>
      </div>
    </div>
  )
}

// ── P&L View ──────────────────────────────────────────────
function PnLView({ contracts, entries, accounts }) {
  const pl = useMemo(() => {
    // Revenue from closed contracts (totalHT)
    const rentalIncome = contracts
      .filter(c => c.status === 'closed')
      .reduce((s, c) => s + (Number(c.totalHT) || 0), 0)

    // Expenses from journal entries
    let maintenance = 0, insurance = 0, salaries = 0, other = 0
    entries.forEach(e => {
      const acc = accounts.find(a => a.code === e.accountCode)
      if (!acc || acc.type !== 'expense') return
      const amt = Number(e.debit) - Number(e.credit)
      if (acc.code === '4000') maintenance += amt
      else if (acc.code === '4020') insurance += amt
      else if (acc.code === '4050') salaries += amt  // may not exist yet
      else other += amt
    })

    const totalExpenses = maintenance + insurance + salaries + other
    return { rentalIncome, maintenance, insurance, salaries, other, totalExpenses, net: rentalIncome - totalExpenses }
  }, [contracts, entries, accounts])

  const row = (label, value, color, bold = false) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid var(--border, #2d3147)',
    }}>
      <span style={{ fontSize: 13, color: bold ? 'var(--text1)' : 'var(--text2)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 600, color: color || 'var(--text1)' }}>{fmt(value)} MAD</span>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Income */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={16} color="#4ade80" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Produits</span>
        </div>
        {row('Revenus de location', pl.rentalIncome, '#4ade80', true)}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>Basé sur {contracts.filter(c => c.status === 'closed').length} contrat(s) clôturé(s)</div>
      </div>

      {/* Expenses */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingDown size={16} color="#f87171" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Charges</span>
        </div>
        {row('Entretien & réparations', pl.maintenance, '#f87171')}
        {row('Assurances véhicules',   pl.insurance,    '#f87171')}
        {row('Salaires',               pl.salaries,     '#f87171')}
        {row('Autres charges',         pl.other,        '#f87171')}
        {row('Total charges',          pl.totalExpenses,'#f87171', true)}
      </div>

      {/* Net result — full width */}
      <div style={{ ...card, gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text1)' }}>Résultat net</span>
        <span style={{ fontWeight: 800, fontSize: 22, color: pl.net >= 0 ? '#4ade80' : '#f87171' }}>
          {pl.net >= 0 ? '+' : ''}{fmt(pl.net)} MAD
        </span>
      </div>
    </div>
  )
}

// ── Utilization vs Revenue chart ──────────────────────────
function UtilizationView({ contracts, fleet }) {
  const data = useMemo(() => {
    return fleet.map(v => {
      const closed = contracts.filter(c => c.vehicleId === v.id && c.status === 'closed')
      const days   = closed.reduce((s, c) => s + (Number(c.days) || 0), 0)
      const rev    = closed.reduce((s, c) => s + (Number(c.totalHT) || 0), 0)
      return {
        label:  `${v.make} ${v.model}`.substring(0, 10),
        plate:  v.plate,
        a:      days,
        b:      Math.round(rev / 100),   // scaled for bar comparison
        revRaw: rev,
        days,
        labelA: 'Jours loués',
        labelB: 'Revenu',
      }
    }).sort((a, b) => b.revRaw - a.revRaw).slice(0, 10)
  }, [contracts, fleet])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Car size={16} color="var(--accent, #6366f1)" />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Utilisation vs Revenu — par véhicule</span>
      </div>

      {data.length === 0 ? (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucun contrat clôturé trouvé.</p>
      ) : (
        <>
          <BarChart data={data} height={160} />
          <table style={{ ...tableStyle, marginTop: 20 }}>
            <thead>
              <tr>
                {['Véhicule', 'Jours loués', 'Revenu HT', 'Taux utilisation', 'Rev / jour'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td style={td}>{d.label}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{d.days}j</td>
                  <td style={{ ...td, fontWeight: 600, color: '#4ade80' }}>{fmt(d.revRaw)} MAD</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }}>
                        <div style={{ width: `${Math.min((d.days / 30) * 100, 100)}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 30 }}>{Math.round((d.days / 30) * 100)}%</span>
                    </div>
                  </td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{d.days > 0 ? fmt(d.revRaw / d.days) : '—'} MAD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── Aged Receivables ──────────────────────────────────────
function AgedReceivablesView({ contracts }) {
  const today = new Date()

  const receivables = useMemo(() => {
    return contracts
      .filter(c => c.status === 'closed' && (Number(c.totalExtraFees) || 0) > 0)
      .map(c => {
        const closedDate = c.returnDate ? new Date(c.returnDate) : new Date(c.endDate)
        const ageDays    = Math.floor((today - closedDate) / 86400000)
        const bucket     = ageDays <= 30 ? '0–30 j' : ageDays <= 60 ? '31–60 j' : ageDays <= 90 ? '61–90 j' : '+90 j'
        return {
          contractNumber: c.contractNumber,
          clientName:     c.clientName,
          vehicleName:    c.vehicleName,
          closedDate:     c.returnDate || c.endDate,
          ageDays,
          bucket,
          amount: Number(c.totalExtraFees) || 0,
        }
      })
      .sort((a, b) => b.ageDays - a.ageDays)
  }, [contracts])

  const bucketColor = (b) => {
    if (b === '0–30 j')  return { background: '#14532d', color: '#4ade80' }
    if (b === '31–60 j') return { background: '#713f12', color: '#fbbf24' }
    if (b === '61–90 j') return { background: '#7c2d12', color: '#fb923c' }
    return                       { background: '#450a0a', color: '#f87171' }
  }

  const total = receivables.reduce((s, r) => s + r.amount, 0)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color="#f87171" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Créances en souffrance</span>
        </div>
        {total > 0 && (
          <span style={{ fontWeight: 700, color: '#f87171', fontSize: 14 }}>{fmt(total)} MAD total dû</span>
        )}
      </div>

      {receivables.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontSize: 13 }}>
          <AlertCircle size={14} />
          Aucune créance en souffrance. Tous les frais ont été réglés.
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Contrat', 'Client', 'Véhicule', 'Clôturé le', 'Ancienneté', 'Montant dû'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {receivables.map((r, i) => (
              <tr key={i}>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{r.contractNumber}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.clientName}</td>
                <td style={td}>{r.vehicleName}</td>
                <td style={{ ...td, color: 'var(--text2)' }}>{fmtDate(r.closedDate)}</td>
                <td style={td}>
                  <span style={badge(bucketColor(r.bucket))}>{r.bucket} — {r.ageDays}j</span>
                </td>
                <td style={{ ...td, fontWeight: 700, color: '#f87171', textAlign: 'right' }}>{fmt(r.amount)} MAD</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...td, fontWeight: 700, color: 'var(--text2)', borderTop: '2px solid var(--border)' }}>Total</td>
              <td style={{ ...td, fontWeight: 800, color: '#f87171', textAlign: 'right', borderTop: '2px solid var(--border)' }}>{fmt(total)} MAD</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

// ── Main Dashboard Tab ────────────────────────────────────
function TabDashboard() {
  const [view, setView]       = useState('pl')
  const [contracts, setContracts] = useState([])
  const [fleet, setFleet]     = useState([])
  const [entries, setEntries] = useState([])
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    setContracts(getContracts())
    setFleet(getFleet())
    setEntries(getJournalEntries())
    setAccounts(getAccounts())
  }, [])

  const VIEWS = [
    { id: 'pl',          label: 'Compte de résultat' },
    { id: 'utilization', label: 'Utilisation vs Revenu' },
    { id: 'receivables', label: 'Créances en souffrance' },
  ]

  return (
    <div>
      {/* View switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-secondary, #1e2130)', borderRadius: 8, padding: 4, width: 'fit-content', border: '1px solid var(--border)' }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: view === v.id ? 'var(--accent, #6366f1)' : 'transparent',
              color: view === v.id ? '#fff' : 'var(--text3)',
              transition: 'all 0.15s',
            }}
          >{v.label}</button>
        ))}
      </div>

      {view === 'pl'          && <PnLView contracts={contracts} entries={entries} accounts={accounts} />}
      {view === 'utilization' && <UtilizationView contracts={contracts} fleet={fleet} />}
      {view === 'receivables' && <AgedReceivablesView contracts={contracts} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 2: Plan comptable
// ══════════════════════════════════════════════════════════
function TabPlanComptable() {
  const [accounts, setAccounts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', type: 'asset', category: 'Actifs', normalBalance: 'debit' })
  const [error, setError] = useState('')

  const load = useCallback(() => setAccounts(getAccounts()), [])
  useEffect(() => { load() }, [load])

  const categories = [...new Set(accounts.map(a => a.category))]

  const handleSave = () => {
    setError('')
    if (!form.code.trim() || !form.name.trim()) { setError('Code et nom requis.'); return }
    if (accounts.find(a => a.code === form.code.trim() && !a.id)) { setError('Code déjà utilisé.'); return }
    saveAccount({ ...form, code: form.code.trim(), name: form.name.trim() })
    setShowForm(false)
    setForm({ code: '', name: '', type: 'asset', category: 'Actifs', normalBalance: 'debit' })
    load()
  }

  const TYPE_LABELS = { asset: 'Actif', liability: 'Passif', revenue: 'Produit', expense: 'Charge' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={btnPrimary} onClick={() => setShowForm(true)}><Plus size={14} /> Nouveau compte</button>
      </div>

      {categories.map(cat => (
        <div key={cat} style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>{cat}</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Code', 'Compte', 'Type', 'Solde normal'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {accounts.filter(a => a.category === cat).map(a => (
                <tr key={a.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', width: 80 }}>{a.code}</td>
                  <td style={td}>{a.name}{a.isSystem ? '' : <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(personnalisé)</span>}</td>
                  <td style={td}><span style={badge({ background: '#1e2842', color: '#93c5fd' })}>{TYPE_LABELS[a.type] || a.type}</span></td>
                  <td style={td}><span style={badge(a.normalBalance === 'debit' ? { background: '#2d1e3e', color: '#c084fc' } : { background: '#1e3a2a', color: '#86efac' })}>{a.normalBalance === 'debit' ? 'Débit' : 'Crédit'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showForm && (
        <Modal title="Nouveau compte" onClose={() => setShowForm(false)}>
          {error && <div style={{ background: '#3b1a1a', color: '#f87171', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Code</label>
              <input style={inputStyle} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="ex: 5000" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Nom du compte</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Petite caisse" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Type</label>
              <select style={selectStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="asset">Actif</option>
                <option value="liability">Passif</option>
                <option value="revenue">Produit</option>
                <option value="expense">Charge</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <input style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="ex: Actifs" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Solde normal</label>
              <select style={selectStyle} value={form.normalBalance} onChange={e => setForm(f => ({ ...f, normalBalance: e.target.value }))}>
                <option value="debit">Débit</option>
                <option value="credit">Crédit</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button style={btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
              <button style={btnPrimary} onClick={handleSave}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 3: Journal des écritures
// ══════════════════════════════════════════════════════════
function TabJournal() {
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfMonth)
  const [to,   setTo]   = useState(lastOfMonth)
  const [entries, setEntries] = useState([])
  const [txMap,   setTxMap]   = useState({})

  useEffect(() => {
    const txs = getTransactions()
    const map = {}
    txs.forEach(t => { map[t.id] = t })
    setTxMap(map)

    const all = getJournalEntries()
    const filtered = all.filter(e => {
      if (from && e.date < from) return false
      if (to   && e.date > to)   return false
      return true
    })
    // Sort by date desc, then group by transactionId
    filtered.sort((a, b) => {
      const dateComp = b.date?.localeCompare(a.date || '') || 0
      if (dateComp !== 0) return dateComp
      return a.transactionId?.localeCompare(b.transactionId || '') || 0
    })
    setEntries(filtered)
  }, [from, to])

  const totalDebit  = entries.reduce((s, e) => s + (Number(e.debit)  || 0), 0)
  const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0)

  // Group entries by transaction for alternate row coloring
  const txOrder = []
  const txIndexMap = {}
  entries.forEach(e => {
    if (txIndexMap[e.transactionId] === undefined) {
      txIndexMap[e.transactionId] = txOrder.length
      txOrder.push(e.transactionId)
    }
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Du</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Au</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div style={{ color: 'var(--text3)', fontSize: 13, paddingBottom: 2 }}>{entries.length} écritures</div>
      </div>

      <div style={card}>
        {entries.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune écriture sur cette période.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Date', 'Référence', 'Compte', 'Libellé', 'Débit', 'Crédit'].map(h => (
                  <th key={h} style={{ ...th, textAlign: h === 'Débit' || h === 'Crédit' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const txIdx = txIndexMap[e.transactionId]
                const rowBg = txIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.025)'
                return (
                  <tr key={`${e.transactionId}-${i}`} style={{ background: rowBg }}>
                    <td style={{ ...td, width: 100 }}>{fmtDate(e.date)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', width: 130 }}>{e.transactionRef}</td>
                    <td style={{ ...td, width: 80 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{e.accountCode}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{e.accountName}</span>
                    </td>
                    <td style={td}>{e.description}</td>
                    <td style={{ ...td, textAlign: 'right', color: Number(e.debit) > 0 ? '#c084fc' : 'var(--text3)' }}>
                      {Number(e.debit) > 0 ? fmt(e.debit) : ''}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: Number(e.credit) > 0 ? '#86efac' : 'var(--text3)' }}>
                      {Number(e.credit) > 0 ? fmt(e.credit) : ''}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--bg-tertiary, #252a3a)', fontWeight: 700 }}>
                <td colSpan={4} style={{ ...td, textAlign: 'right', color: 'var(--text3)' }}>TOTAUX</td>
                <td style={{ ...td, textAlign: 'right', color: '#c084fc' }}>{fmt(totalDebit)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#86efac' }}>{fmt(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 4: Dépôts de garantie
// ══════════════════════════════════════════════════════════
function TabDeposits() {
  const [deposits, setDeposits]   = useState([])
  const [showHold, setShowHold]   = useState(false)
  const [showRelease, setShowRelease] = useState(null) // deposit object
  const [contracts, setContracts] = useState([])
  const [error, setError] = useState('')

  const [holdForm, setHoldForm] = useState({
    clientName: '', vehicleName: '', amount: '', contractId: '', date: new Date().toISOString().slice(0, 10),
  })

  const [deductions, setDeductions] = useState([{ reason: '', amount: '', accountCode: '3020' }])

  const load = useCallback(() => {
    setDeposits(getDeposits())
    setContracts(getContracts().filter(c => c.status === 'active'))
  }, [])

  useEffect(() => { load() }, [load])

  const handleHold = () => {
    setError('')
    if (!holdForm.clientName.trim() || !holdForm.amount || Number(holdForm.amount) <= 0) {
      setError('Nom du client et montant requis.')
      return
    }
    try {
      holdDeposit({
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

  const handleRelease = () => {
    setError('')
    const validDeds = deductions.filter(d => d.reason.trim() && Number(d.amount) > 0)
    const totalDed  = validDeds.reduce((s, d) => s + Number(d.amount), 0)
    if (totalDed > showRelease.amount) {
      setError('Les retenues dépassent le montant du dépôt.')
      return
    }
    try {
      releaseDeposit({ depositId: showRelease.id, deductions: validDeds.map(d => ({ ...d, amount: Number(d.amount) })) })
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

// ══════════════════════════════════════════════════════════
// TAB 5: Bilan agence
// ══════════════════════════════════════════════════════════
function TabBilan() {
  const today = new Date()
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`)
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10))
  const [result, setResult] = useState(null)

  const compute = useCallback(() => {
    const r = computeAgencyPayout({ startDate: from, endDate: to })
    setResult(r)
  }, [from, to])

  useEffect(() => { compute() }, [compute])

  const handleGenerate = () => {
    if (!result) return
    alert(
      `Bilan agence du ${from} au ${to}\n\n` +
      `Chiffre d'affaires:    ${fmt(result.totalRevenue)} MAD\n` +
      `Commission plateforme: ${fmt(result.platformFees)} MAD\n` +
      `Net agence:            ${fmt(result.netPayout)} MAD\n` +
      `Charges opérationnelles: ${fmt(result.totalExpenses)} MAD\n` +
      `Résultat:              ${fmt(result.netPayout - result.totalExpenses)} MAD`
    )
  }

  const summaryRows = result ? [
    { label: "Chiffre d'affaires",         value: result.totalRevenue,                        color: '#4ade80' },
    { label: 'Commission plateforme',       value: -result.platformFees,                       color: '#f87171' },
    { label: 'Net agence',                  value: result.netPayout,                           color: 'var(--accent)' },
    { label: 'Charges opérationnelles',     value: -result.totalExpenses,                      color: '#f87171' },
    { label: 'Résultat',                    value: result.netPayout - result.totalExpenses,     color: result.netPayout - result.totalExpenses >= 0 ? '#4ade80' : '#f87171', bold: true },
  ] : []

  const breakdown = result ? Object.entries(result.breakdown.byAccount) : []

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Du</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Au</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button style={btnPrimary} onClick={handleGenerate}>Générer rapport</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 14, color: 'var(--text1)' }}>Synthèse</div>
          <table style={tableStyle}>
            <tbody>
              {summaryRows.map(row => (
                <tr key={row.label}>
                  <td style={{ ...td, color: 'var(--text2)', fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: row.bold ? 700 : 600, color: row.color }}>
                    {fmt(Math.abs(row.value))} MAD
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 14, color: 'var(--text1)' }}>Détail par compte de produits</div>
          {breakdown.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune donnée.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Compte</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map(([code, data]) => (
                  <tr key={code}>
                    <td style={td}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', marginRight: 8 }}>{code}</span>
                      {data.name}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{fmt(data.amount)} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Main Accounting page
// ══════════════════════════════════════════════════════════
const TABS = [
  { id: 'dashboard',    label: 'Tableau de bord', icon: BarChart2 },
  { id: 'plan',         label: 'Plan comptable',   icon: BookOpen },
  { id: 'journal',      label: 'Journal',          icon: List },
  { id: 'deposits',     label: 'Dépôts',           icon: Shield },
  { id: 'bilan',        label: 'Bilan agence',     icon: Building2 },
]

export default function Accounting() {
  const [tab, setTab] = useState('dashboard')

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <TabDashboard />
      case 'plan':      return <TabPlanComptable />
      case 'journal':   return <TabJournal />
      case 'deposits':  return <TabDeposits />
      case 'bilan':     return <TabBilan />
      default:          return <TabDashboard />
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>Comptabilité</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text3)', fontSize: 13 }}>
          Plan comptable marocain — double entrée — données locales
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border, #2d3147)', paddingBottom: 0 }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
                color: active ? 'var(--accent, #6366f1)' : 'var(--text3, #8892a4)',
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.15s',
                marginBottom: -1,
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  )
}
