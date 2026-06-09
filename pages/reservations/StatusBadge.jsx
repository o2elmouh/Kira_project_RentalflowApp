import { useTranslation } from 'react-i18next'

/**
 * Colored pill for the Status column.
 * Colors chosen to be readable in both light and dark contexts.
 */
const CONFIG = {
  PENDING:   { color: '#92400E', bg: '#FEF3C7' }, // amber
  CONFIRMED: { color: '#065F46', bg: '#D1FAE5' }, // green
  CANCELLED: { color: '#991B1B', bg: '#FEE2E2' }, // red
  COMPLETED: { color: '#1E40AF', bg: '#DBEAFE' }, // blue
}

export default function StatusBadge({ status }) {
  const { t } = useTranslation('reservations')
  const cfg = CONFIG[status] || CONFIG.PENDING

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {t(`status.${status}`, status)}
    </span>
  )
}
