import { useState, useEffect } from 'react'
import { getTransactions, getJournalEntries } from '../../lib/db'
import { card, tableStyle, th, td, inputStyle, fmt, fmtDate } from './accountingStyles.js'

export default function TabJournal() {
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfMonth)
  const [to,   setTo]   = useState(lastOfMonth)
  const [entries, setEntries] = useState([])
  const [txMap,   setTxMap]   = useState({})

  useEffect(() => {
    async function load() {
      const txs = await getTransactions()
      const map = {}
      txs.forEach(t => { map[t.id] = t })
      setTxMap(map)

      const all = await getJournalEntries()
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
    }
    load()
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
