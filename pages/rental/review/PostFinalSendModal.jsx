import { useState } from 'react'
import { Mail, MessageCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function PostFinalSendModal({
  open,
  onClose,
  onSend,
  defaultEmail,
  defaultPhone,
}) {
  const { t } = useTranslation('contracts')
  const [channel, setChannel] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  if (!open) return null

  const reset = () => { setChannel(null); setRecipient(''); setError(null) }
  const handleClose = () => { if (!sending) { reset(); onClose() } }

  const pickChannel = (ch) => {
    setChannel(ch)
    setRecipient(ch === 'email' ? (defaultEmail || '') : (defaultPhone || ''))
    setError(null)
  }

  const handleSend = async () => {
    if (!recipient.trim()) { setError(t('review.sendModal.recipientRequired')); return }
    setSending(true)
    setError(null)
    try {
      await onSend({ channel, recipient: recipient.trim() })
      reset()
      onClose()
    } catch (err) {
      setError(err.message || t('review.sendModal.sendError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.45)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={handleClose}
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
              {t('review.sendModal.eyebrow')}
            </div>
            <h3 style={{
              fontSize: 22, fontWeight: 500, color: '#141413',
              letterSpacing: '-0.44px', lineHeight: '28px', margin: 0,
            }}>
              {channel ? t('review.sendModal.confirmSend') : t('review.sendModal.pickChannel')}
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={sending}
            aria-label={t('review.modal.cancel')}
            style={{ border: 'none', background: 'transparent', cursor: sending ? 'not-allowed' : 'pointer', padding: 4 }}
          >
            <X size={20} color="#141413" />
          </button>
        </div>

        {!channel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => pickChannel('email')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 20px', borderRadius: 16,
                border: '1px solid #E8E5E1', background: '#FCFBFA',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: '#141413', color: '#FCFBFA',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Mail size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#141413' }}>{t('review.sendModal.byEmail')}</div>
                <div style={{ fontSize: 12, color: '#696969', marginTop: 2 }}>
                  {t('review.sendModal.byEmailHint')}
                </div>
              </div>
            </button>

            <button
              onClick={() => pickChannel('whatsapp')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 20px', borderRadius: 16,
                border: '1px solid #E8E5E1', background: '#FCFBFA',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: '#22C55E', color: '#FCFBFA',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <MessageCircle size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#141413' }}>{t('review.sendModal.byWhatsApp')}</div>
                <div style={{ fontSize: 12, color: '#696969', marginTop: 2 }}>
                  {t('review.sendModal.byWhatsAppHint')}
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#141413', marginBottom: 8 }}>
              {channel === 'email' ? t('review.sendModal.emailLabel') : t('review.sendModal.phoneLabel')}
            </label>
            <input
              type={channel === 'email' ? 'email' : 'tel'}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === 'email' ? t('review.sendModal.emailPlaceholder') : t('review.sendModal.phonePlaceholder')}
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: '1px solid #E8E5E1', fontSize: 14, fontFamily: 'inherit',
                background: '#FCFBFA',
              }}
            />
            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#CF4500' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { setChannel(null); setError(null) }}
                disabled={sending}
                className="btn-outline-ink"
                style={{ fontSize: 14 }}
              >
                {t('review.sendModal.back')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !recipient.trim()}
                className="btn-ink"
                style={{ flex: 1, justifyContent: 'center', fontSize: 14 }}
              >
                {sending ? t('review.sending') : t('review.sendModal.send')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
