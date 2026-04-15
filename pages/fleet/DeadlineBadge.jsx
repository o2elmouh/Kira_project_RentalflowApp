export default function DeadlineBadge({ date }) {
  if (!date) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
  const d = new Date(date)
  if (isNaN(d.getTime())) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
  const days = Math.ceil((d - new Date()) / 86400000)
  if (days < 0)  return <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>En retard de {Math.abs(days)} j</span>
  if (days <= 30) return <span style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12 }}>Dans {days} j</span>
  return <span style={{ color: 'var(--green)', fontSize: 12 }}>Dans {days} j ({d.toLocaleDateString('fr-MA')})</span>
}
