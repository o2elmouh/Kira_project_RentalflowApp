import { useMemo } from 'react'
import { Clock, AlertCircle } from 'lucide-react'
import { card, tableStyle, th, td, badge, fmt, fmtDate } from './accountingStyles.js'

// v1.16.2: rewritten. Previous version read non-existent fields
// (c.totalExtraFees, c.clientName, c.vehicleName, c.returnDate) so the
// view always rendered "Aucune créance en souffrance" even when extras
// were owed. We now derive the receivable from total_amount - amount_paid
// (covers both unpaid base rental AND unpaid extras) and resolve names
// from the `clients` and `fleet` props the parent passes in.
export default function AgedReceivablesView({ contracts, clients = [], fleet = [] }) {
  const today = new Date()

  const clientMap  = useMemo(() => Object.fromEntries((clients || []).map(c => [c.id, c])), [clients])
  const vehicleMap = useMemo(() => Object.fromEntries((fleet   || []).map(v => [v.id, v])), [fleet])

  const receivables = useMemo(() => {
    return contracts
      .filter(c => c.status === 'closed')
      .map(c => {
        const totalTTC = Number(c.totalTTC ?? c.total_amount) || 0
        const paid     = Number(c.amountPaid ?? c.amount_paid) || 0
        const amount   = Math.max(0, totalTTC - paid)
        if (amount <= 0) return null

        const closedRaw = c.actualReturnDate || c.endDate || c.returnDate
        const closedDate = closedRaw ? new Date(closedRaw) : today
        const ageDays    = Math.max(0, Math.floor((today - closedDate) / 86400000))
        const bucket     = ageDays <= 30 ? '0–30 j' : ageDays <= 60 ? '31–60 j' : ageDays <= 90 ? '61–90 j' : '+90 j'

        const client  = clientMap[c.clientId]
        const vehicle = vehicleMap[c.vehicleId]
        const clientName  = client
          ? `${client.firstName || client.first_name || ''} ${client.lastName || client.last_name || ''}`.trim() || '—'
          : '—'
        const vehicleName = vehicle
          ? `${vehicle.make || vehicle.brand || ''} ${vehicle.model || ''}`.trim() || '—'
          : '—'

        return {
          contractNumber: c.contractNumber,
          clientName,
          vehicleName,
          closedDate: closedRaw,
          ageDays,
          bucket,
          amount,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.ageDays - a.ageDays)
  }, [contracts, clientMap, vehicleMap, today])

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
          Aucune créance en souffrance. Tous les contrats clôturés sont réglés.
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
