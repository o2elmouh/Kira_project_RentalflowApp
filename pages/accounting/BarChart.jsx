export default function BarChart({ data, height = 180, colorA = '#6366f1', colorB = '#f59e0b' }) {
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
