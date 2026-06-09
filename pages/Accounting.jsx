import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart2, BookOpen, List, Shield, Building2,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computeAgencyPayout, backfillJournalForClosedContracts } from '../utils/accounting.js'
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
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState(null)

  const compute = useCallback(async () => {
    const r = await computeAgencyPayout({ startDate: from, endDate: to })
    setResult(r)
  }, [from, to])

  useEffect(() => { compute() }, [compute])

  const handleBackfill = async () => {
    if (backfilling) return
    if (!window.confirm("Régénérer les écritures comptables pour tous les contrats clôturés sans écriture ?\n\nCette opération est idempotente — les contrats déjà comptabilisés sont ignorés.")) return
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const r = await backfillJournalForClosedContracts()
      const errSummary = r.errors.length > 0 ? ` — ${r.errors.length} erreur(s)` : ''
      setBackfillMsg(`✓ ${r.created} écriture(s) créée(s), ${r.skipped} ignorée(s)${errSummary}`)
      if (r.errors.length > 0) console.warn('[Backfill] errors:', r.errors)
      compute()
    } catch (err) {
      setBackfillMsg(`✗ ${err.message}`)
    } finally {
      setBackfilling(false)
    }
  }

  // v1.16.2: replaced the alert() with a proper one-page PDF report.
  // Same data as the on-screen Synthèse + breakdown by product account.
  const handleGenerate = () => {
    if (!result) return
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(16)
    doc.text("Bilan agence", 40, 50)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Période : ${from} → ${to}`, 40, 70)
    doc.setTextColor(0)

    autoTable(doc, {
      startY: 100,
      head: [['Synthèse', 'Montant (MAD)']],
      body: [
        ["Chiffre d'affaires",         fmt(result.totalRevenue)],
        ['Commission plateforme',       fmt(-result.platformFees)],
        ['Net agence',                  fmt(result.netPayout)],
        ['Charges opérationnelles',     fmt(-result.totalExpenses)],
        ['Résultat',                    fmt(result.netPayout - result.totalExpenses)],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      columnStyles: { 1: { halign: 'right' } },
    })

    const breakdownRows = Object.entries(result.breakdown.byAccount)
      .map(([code, data]) => [`${code} — ${data.name}`, fmt(data.amount)])

    if (breakdownRows.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 24,
        head: [['Détail par compte de produits', 'Montant (MAD)']],
        body: breakdownRows,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        columnStyles: { 1: { halign: 'right' } },
      })
    }

    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(
      `Généré le ${new Date().toLocaleString('fr-MA')}`,
      40,
      doc.internal.pageSize.getHeight() - 30
    )

    doc.save(`bilan-agence-${from}-${to}.pdf`)
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
        <button
          style={{ ...btnPrimary, background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' }}
          onClick={handleBackfill}
          disabled={backfilling}
          title="Crée les écritures comptables pour tous les contrats clôturés qui n'en ont pas encore"
        >
          {backfilling ? 'Régénération…' : 'Régénérer écritures'}
        </button>
      </div>

      {backfillMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: backfillMsg.startsWith('✓') ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
          color: backfillMsg.startsWith('✓') ? '#4ade80' : '#f87171',
          fontSize: 13,
        }}>
          {backfillMsg}
        </div>
      )}

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
  { id: 'dashboard', labelKey: 'pages.accounting.tabs.dashboard', icon: BarChart2 },
  { id: 'plan',      labelKey: 'pages.accounting.tabs.plan',      icon: BookOpen },
  { id: 'journal',   labelKey: 'pages.accounting.tabs.journal',   icon: List },
  { id: 'deposits',  labelKey: 'pages.accounting.tabs.deposits',  icon: Shield },
  { id: 'bilan',     labelKey: 'pages.accounting.tabs.bilan',     icon: Building2 },
]

export default function Accounting() {
  const { t } = useTranslation('common')
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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>{t('pages.accounting.title')}</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text3)', fontSize: 13 }}>
          {t('pages.accounting.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border, #2d3147)', paddingBottom: 0 }}>
        {TABS.map(tabItem => {
          const Icon = tabItem.icon
          const active = tab === tabItem.id
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
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
              {t(tabItem.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  )
}
