import { useMemo } from 'react'
import { Car } from 'lucide-react'
import { card, tableStyle, th, td, fmt } from './accountingStyles.js'
import BarChart from './BarChart.jsx'

export default function UtilizationView({ contracts, fleet }) {
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
