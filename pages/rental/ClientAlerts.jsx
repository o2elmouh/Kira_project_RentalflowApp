export default function ClientAlerts({ client }) {
  const today = new Date()
  const alerts = []

  if (client.cinExpiry) {
    const exp = new Date(client.cinExpiry)
    if (exp < today) alerts.push({ type: 'error', msg: `CIN expiré depuis le ${exp.toLocaleDateString('fr-MA')}` })
    else if ((exp - today) / 86400000 < 30) alerts.push({ type: 'warn', msg: `CIN expire dans moins de 30 jours (${exp.toLocaleDateString('fr-MA')})` })
  }

  if (client.licenseExpiry) {
    const exp = new Date(client.licenseExpiry)
    if (exp < today) alerts.push({ type: 'error', msg: `Permis de conduire expiré depuis le ${exp.toLocaleDateString('fr-MA')}` })
    else if ((exp - today) / 86400000 < 30) alerts.push({ type: 'warn', msg: `Permis expire dans moins de 30 jours` })
  }

  if (client.dateOfBirth) {
    const age = Math.floor((today - new Date(client.dateOfBirth)) / (365.25 * 86400000))
    if (age < 21) alerts.push({ type: 'error', msg: `Client mineur ou trop jeune — âge minimum 21 ans (âge actuel : ${age} ans)` })
  }

  if (!alerts.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {alerts.map((a, i) => (
        <div key={i} className={`alert alert-${a.type === 'error' ? 'danger' : 'warn'}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          <span>{a.type === 'error' ? '🚫' : '⚠️'}</span>
          <span>{a.msg}</span>
        </div>
      ))}
    </div>
  )
}
