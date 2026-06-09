import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPolicy({ onBack }) {
  const { t, i18n } = useTranslation('common')
  const isRtl = i18n.language === 'ar'

  return (
    <div style={{
      maxWidth: 820,
      margin: '0 auto',
      padding: '40px 32px 64px',
      direction: isRtl ? 'rtl' : 'ltr',
    }}>
      {onBack && (
        <button
          className="btn-outline-ink"
          style={{ marginBottom: 24, fontSize: 13 }}
          onClick={onBack}
        >
          <ArrowLeft size={14} />
          <span>{t('back')}</span>
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Shield size={28} style={{ color: 'var(--accent)' }} />
        <h1 style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 500,
          color: '#141413',
          letterSpacing: '-0.64px',
          lineHeight: '40px',
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}>
          {t('privacy.title')}
        </h1>
      </div>

      <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 32 }}>
        {t('privacy.subtitle')}
      </p>

      <Section title={t('privacy.controller.title')} body={t('privacy.controller.body')} />
      <Section title={t('privacy.collected.title')} body={t('privacy.collected.body')} />
      <Section title={t('privacy.purpose.title')}    body={t('privacy.purpose.body')} />
      <Section title={t('privacy.legal.title')}      body={t('privacy.legal.body')} />
      <Section title={t('privacy.retention.title')}  body={t('privacy.retention.body')} />
      <Section title={t('privacy.rights.title')}     body={t('privacy.rights.body')} />
      <Section title={t('privacy.security.title')}   body={t('privacy.security.body')} />
      <Section title={t('privacy.contact.title')}    body={t('privacy.contact.body')} />

      <div style={{
        marginTop: 32,
        padding: 16,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--text3)',
      }}>
        {t('privacy.footer')}
      </div>
    </div>
  )
}

function Section({ title, body }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 18,
        fontWeight: 600,
        color: '#141413',
        marginBottom: 8,
        fontFamily: "'Sofia Sans', 'Inter', sans-serif",
      }}>
        {title}
      </h2>
      <p style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text2)',
        whiteSpace: 'pre-wrap',
        margin: 0,
      }}>
        {body}
      </p>
    </section>
  )
}
