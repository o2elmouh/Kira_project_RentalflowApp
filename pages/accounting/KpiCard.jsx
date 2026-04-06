import { card } from './accountingStyles.js'

export default function KpiCard({ label, value, color }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: 'var(--text3, #8892a4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text1, #e2e8f0)' }}>{value}</div>
    </div>
  )
}
