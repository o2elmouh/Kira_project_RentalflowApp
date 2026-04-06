import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { card, fmt } from './accountingStyles.js'

export default function PnLView({ contracts, entries, accounts }) {
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
