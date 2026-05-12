import { Clock, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function AwaitingSignatureBanner({ channel, sentAt, onResend, resending }) {
  const { t } = useTranslation('contracts')
  const minutesAgo = sentAt
    ? Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000))
    : null

  const channelLabel = channel === 'email'
    ? t('review.awaiting.channelEmail')
    : channel === 'whatsapp'
      ? t('review.awaiting.channelWhatsApp')
      : ''

  const ago = (minutesAgo !== null && minutesAgo > 0)
    ? t('review.awaiting.ago', { minutes: minutesAgo })
    : ''

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px', borderRadius: 16,
      background: '#FEF3C7', border: '1px solid #F59E0B',
      marginBottom: 16,
      fontFamily: "'Sofia Sans', 'Inter', sans-serif",
    }}>
      <Clock size={20} color="#92400E" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#92400E' }}>
          {t('review.awaiting.title')}
        </div>
        <div style={{ fontSize: 12, color: '#92400E', opacity: 0.85, marginTop: 2 }}>
          {t('review.awaiting.subtitle', { channel: channelLabel, ago })}
        </div>
      </div>
      {onResend && (
        <button
          onClick={onResend}
          disabled={resending}
          className="btn-outline-ink"
          style={{
            fontSize: 12, padding: '6px 12px',
            borderColor: '#92400E', color: '#92400E',
            whiteSpace: 'nowrap',
          }}
        >
          <RefreshCw size={12} /> {resending ? t('review.sending') : t('review.awaiting.resend')}
        </button>
      )}
    </div>
  )
}
