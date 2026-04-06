import { useTranslation } from 'react-i18next'

export default function AmortissementTab({ vehicle, contracts, repairs: repairsProp }) {
  const { t } = useTranslation('fleet')
  const price    = Number(vehicle.purchasePrice) || 0
  const lifespan = Number(vehicle.lifespan)  || 5
  const residual = Number(vehicle.residualValue) || 0

  // Use purchaseDate if set, otherwise estimate from vehicle year (Jan 1)
  const boughtDate = vehicle.purchaseDate
    ? vehicle.purchaseDate
    : vehicle.year ? `${vehicle.year}-01-01` : null
  const bought = boughtDate ? new Date(boughtDate) : null

  const yearsElapsed = bought ? (Date.now() - bought.getTime()) / (365.25 * 24 * 3600 * 1000) : 0
  const depreciable  = Math.max(0, price - residual)
  const residualWarning = residual > price
  const bookValue    = Math.max(residual, price - (depreciable / lifespan) * yearsElapsed)
  const pct          = price > 0 ? Math.min(100, (yearsElapsed / lifespan) * 100) : 0

  const vehicleContracts = contracts.filter(c => c.vehicleId === vehicle.id)
  const revenue = vehicleContracts.reduce((s, c) => s + (c.totalTTC || 0), 0)
  const repairCosts = (repairsProp || []).reduce((s, r) => s + (r.cost || 0), 0)
  const roi   = price > 0 ? ((revenue - repairCosts) / price * 100).toFixed(1) : 0
  const toRecover = Math.max(0, price - revenue + repairCosts)

  if (!price) return (
    <div className="alert alert-info" style={{ fontSize: 13 }}>
      {t('detail.tiles.noPrice')}
    </div>
  )

  const usingEstimatedDate = !vehicle.purchaseDate && vehicle.year

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {residualWarning && (
        <div style={{ fontSize: 12, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          {t('amortissement.residualWarning')}
        </div>
      )}
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          <span>{t('detail.tiles.amortissement')} · {t('detail.tiles.lifespanValue', { n: lifespan })}</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--bg2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 10, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: t('form.purchasePrice'),        value: `${price.toLocaleString()} MAD`,          color: 'var(--text1)' },
          { label: t('detail.tiles.currentValue'), value: `${Math.round(bookValue).toLocaleString()} MAD`, color: 'var(--accent)' },
          { label: t('form.residualValue'),        value: `${residual.toLocaleString()} MAD`,        color: 'var(--text3)' },
          { label: t('rentals.totalRevenue'),      value: `${revenue.toLocaleString()} MAD`,         color: 'var(--green)' },
          { label: t('detail.tiles.repairs'),      value: `${repairCosts.toLocaleString()} MAD`,     color: '#dc2626' },
          { label: t('amortissement.roi'),                      value: `${roi}%`,                                 color: +roi >= 0 ? 'var(--green)' : '#dc2626' },
          { label: t('amortissement.toRecover'),            value: `${toRecover.toLocaleString()} MAD`,       color: toRecover > 0 ? 'var(--orange)' : 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color }}>{value}</div>
          </div>
        ))}
      </div>

      {bought && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {usingEstimatedDate
            ? <span style={{ color: 'var(--orange)' }}>{t('amortissement.estimatedDate', { year: vehicle.year })} </span>
            : t('amortissement.boughtOn', { date: bought.toLocaleDateString('fr-MA') })
          }
          {t('amortissement.yearsOwned', { n: yearsElapsed.toFixed(1) })}
          {pct >= 100 && <span style={{ color: 'var(--green)', fontWeight: 600 }}> · {t('amortissement.fullyAmortised')}</span>}
        </div>
      )}
    </div>
  )
}
