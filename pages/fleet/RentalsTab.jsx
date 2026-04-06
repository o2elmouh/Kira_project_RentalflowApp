import { useState, useEffect } from 'react'
import { getContracts } from '../../lib/db'

export default function RentalsTab({ vehicle }) {
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    let cancelled = false
    getContracts()
      .then(all => { if (!cancelled) setContracts(all.filter(c => c.vehicleId === vehicle.id)) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [vehicle.id])

  const total     = contracts.reduce((s, c) => s + (c.totalTTC || 0), 0)
  const days      = contracts.reduce((s, c) => s + (c.days || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { label: 'Locations',   value: contracts.length },
          { label: 'Jours loués', value: days },
          { label: 'CA total',    value: `${total.toLocaleString()} MAD` },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ flex: 1, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {contracts.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune location pour ce véhicule.</p>}

      {contracts.map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{c.contractNumber}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
              {c.clientName} · {c.startDate} → {c.endDate} ({c.days} j)
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--accent)' }}>{(c.totalTTC || 0).toLocaleString()} MAD</div>
            <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{c.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
