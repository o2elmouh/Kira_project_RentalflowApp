import { useTranslation } from 'react-i18next'

// Update before launch: agency-support WhatsApp number (also used on the landing page)
const SUPPORT_WHATSAPP = 'https://wa.me/212600000000'

export default function PendingActivation({ status = 'pending', onSignOut }) {
  const { t } = useTranslation('common')
  const blocked = status === 'blocked'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center', background: 'var(--bg)',
    }}>
      <div className="auth-logo">RF</div>
      <h1 style={{ color: 'var(--text1)', fontSize: 24, margin: 0 }}>
        {blocked ? t('pendingActivation.blockedTitle') : t('pendingActivation.title')}
      </h1>
      <p style={{ color: 'var(--text3)', fontSize: 14, maxWidth: 420, margin: 0 }}>
        {blocked ? t('pendingActivation.blockedMessage') : t('pendingActivation.message')}
      </p>
      <a
        href={SUPPORT_WHATSAPP}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary"
        style={{ textDecoration: 'none' }}
      >
        {t('pendingActivation.contact')}
      </a>
      <button className="btn btn-ghost" onClick={onSignOut}>
        {t('signOut')}
      </button>
    </div>
  )
}
