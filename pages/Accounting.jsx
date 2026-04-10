import { useState, useEffect, useCallback } from 'react'
import {
  BarChart2, BookOpen, List, Shield, Building2,
} from 'lucide-react'
import { computeAgencyPayout } from '../utils/accounting.js'
import {
  card, tableStyle, th, td, inputStyle,
  btnPrimary, fmt, fmtDate,
} from './accounting/accountingStyles'
import TabDashboard from './accounting/TabDashboard'
import TabPlanComptable from './accounting/TabPlanComptable'
import TabJournal from './accounting/TabJournal'
import TabDeposits from './accounting/TabDeposits'

// ══════════════════════════════════════════════════════════
// TAB 5: Bilan agence
// ══════════════════════════════════════════════════════════
function TabBilan() {
  const today = new Date()
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`)
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10))
  const [result, setResult] = useState(null)

  const compute = useCallback(async () => {
    const r = await computeAgencyPayout({ startDate: from, endDate: to })
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
  { id: 'dashboard', label: 'Tableau de bord', icon: BarChart2 },
  { id: 'plan',      label: 'Plan comptable',  icon: BookOpen },
  { id: 'journal',   label: 'Journal',         icon: List },
  { id: 'deposits',  label: 'Dépôts',          icon: Shield },
  { id: 'bilan',     label: 'Bilan agence',    icon: Building2 },
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
