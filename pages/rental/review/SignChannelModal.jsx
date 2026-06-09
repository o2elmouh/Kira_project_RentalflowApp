import { Mail, MessageCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SignChannelModal({
  open,
  onClose,
  onPick,
  hasEmail,
  hasPhone,
  sendingChannel,
}) {
  const { t } = useTranslation('contracts')
  if (!open) return null

  const disabled = (ch) => sendingChannel && sendingChannel !== ch
  const loadingThis = (ch) => sendingChannel === ch

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.45)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => !sendingChannel && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FCFBFA', borderRadius: 32,
          padding: '32px 36px', width: '90%', maxWidth: 440,
          boxShadow: 'rgba(0,0,0,0.08) 0px 24px 48px 0px',
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="mc-eyebrow" style={{ marginBottom: 8 }}>
              <span style={{ color: '#F37338' }}>•</span>
              {t('review.modal.eyebrow')}
            </div>
            <h3 style={{
              fontSize: 22, fontWeight: 500, color: '#141413',
              letterSpacing: '-0.44px', lineHeight: '28px', margin: 0,
            }}>
              {t('review.modal.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={Boolean(sendingChannel)}
            aria-label="Fermer"
            style={{
              border: 'none', background: 'transparent',
              cursor: sendingChannel ? 'not-allowed' : 'pointer',
              opacity: sendingChannel ? 0.4 : 1, padding: 4,
            }}
          >
            <X size={20} color="#141413" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#696969', lineHeight: '20px', marginBottom: 24 }}>
          {t('review.modal.subtitle')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            disabled={!hasEmail || disabled('email')}
            onClick={() => onPick('email')}
            title={!hasEmail ? t('review.modal.emailMissing') : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 20px', borderRadius: 16,
              border: '1px solid #E8E5E1', background: hasEmail ? '#FCFBFA' : '#F3F0EE',
              cursor: hasEmail && !disabled('email') ? 'pointer' : 'not-allowed',
              opacity: hasEmail ? 1 : 0.5, textAlign: 'left',
              transition: 'border-color .15s, background .15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (hasEmail && !disabled('email')) e.currentTarget.style.borderColor = '#141413' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E5E1' }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#141413', color: '#FCFBFA',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Mail size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#141413' }}>
                {loadingThis('email') ? t('review.sending') : t('review.modal.byEmail')}
              </div>
              <div style={{ fontSize: 12, color: '#696969', marginTop: 2 }}>
                {hasEmail ? t('review.modal.emailHint') : t('review.modal.emailMissing')}
              </div>
            </div>
          </button>

          <button
            disabled={!hasPhone || disabled('whatsapp')}
            onClick={() => onPick('whatsapp')}
            title={!hasPhone ? t('review.modal.whatsappMissing') : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 20px', borderRadius: 16,
              border: '1px solid #E8E5E1', background: hasPhone ? '#FCFBFA' : '#F3F0EE',
              cursor: hasPhone && !disabled('whatsapp') ? 'pointer' : 'not-allowed',
              opacity: hasPhone ? 1 : 0.5, textAlign: 'left',
              transition: 'border-color .15s, background .15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (hasPhone && !disabled('whatsapp')) e.currentTarget.style.borderColor = '#141413' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E5E1' }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#22C55E', color: '#FCFBFA',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <MessageCircle size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#141413' }}>
                {loadingThis('whatsapp') ? t('review.sending') : t('review.modal.byWhatsApp')}
              </div>
              <div style={{ fontSize: 12, color: '#696969', marginTop: 2 }}>
                {hasPhone ? t('review.modal.whatsappHint') : t('review.modal.whatsappMissing')}
              </div>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={onClose}
            disabled={Boolean(sendingChannel)}
            className="btn-outline-ink"
            style={{ fontSize: 14 }}
          >
            {t('review.modal.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
