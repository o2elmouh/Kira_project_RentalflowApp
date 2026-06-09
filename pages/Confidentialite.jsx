import { useTranslation } from 'react-i18next'

export default function Confidentialite() {
  const { t } = useTranslation('confidentialite')

  const collected = t('collected', { returnObjects: true })
  const rights    = t('rights',    { returnObjects: true })

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '48px 24px',
      color: 'var(--text-primary)',
      lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 26, marginBottom: 24 }}>{t('title')}</h1>
      <p style={{ marginBottom: 24 }}>{t('intro')}</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('collectedTitle')}</h2>
      <ul>
        {Array.isArray(collected) && collected.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('purposeTitle')}</h2>
      <p>{t('purpose')}</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('rightsTitle')}</h2>
      <ul>
        {Array.isArray(rights) && rights.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('contactTitle')}</h2>
      <p>{t('contact')}</p>

      <hr style={{ margin: '40px 0', border: 0, borderTop: '1px solid var(--border)' }} />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('footer')}</p>
    </div>
  )
}
