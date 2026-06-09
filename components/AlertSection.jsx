import AlertCard from './AlertCard.jsx'

export default function AlertSection({ alerts, loading, onEscalate, onIgnore }) {
  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement…</div>
  )
  if (!alerts.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
      Aucune alerte en attente
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {alerts.map(alert => (
        <AlertCard key={alert.id} alert={alert}
          onEscalate={() => onEscalate(alert.id)}
          onIgnore={() => onIgnore(alert.id)} />
      ))}
    </div>
  )
}
