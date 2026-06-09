// Pure formatting helpers for the contracts feature.

export function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
}

export function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

export function statusBadgeClass(status) {
  if (status === 'active') return 'badge-green'
  if (status === 'cancelled') return 'badge-red'
  return 'badge-gray'
}

export function statusLabel(status, t) {
  if (status === 'active') return t ? t('status.active', { ns: 'common' }) : 'Actif'
  if (status === 'cancelled') return t ? t('status.cancelled', { ns: 'common' }) : 'Annulé'
  return t ? t('status.closed', { ns: 'common' }) : 'Clôturé'
}
