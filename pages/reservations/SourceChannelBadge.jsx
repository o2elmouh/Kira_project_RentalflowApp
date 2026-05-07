import { Mail, MessageCircle, Globe, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Channel-specific colored badge for the Source column.
 * Each channel gets a Lucide icon + a distinct hue.
 */
const CONFIG = {
  EMAIL:     { Icon: Mail,          color: '#2563EB', bg: 'rgba(37, 99, 235, 0.10)'   },
  WHATSAPP:  { Icon: MessageCircle, color: '#22C55E', bg: 'rgba(34, 197, 94, 0.12)'   },
  WEBSITE:   { Icon: Globe,         color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.10)'  },
  IN_PERSON: { Icon: User,          color: '#6B7280', bg: 'rgba(107, 114, 128, 0.12)' },
}

export default function SourceChannelBadge({ source }) {
  const { t } = useTranslation('reservations')
  const cfg = CONFIG[source] || CONFIG.IN_PERSON
  const { Icon, color, bg } = cfg

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      <Icon size={13} />
      {t(`source.${source}`, source)}
    </span>
  )
}
