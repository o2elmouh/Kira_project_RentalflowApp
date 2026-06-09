import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import RentalOptionsSection from './RentalOptionsSection'
import SignatureSection from './SignatureSection'

export default function GeneralConfigTab() {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState('options')

  const sections = [
    { id: 'options',    label: t('generalConfig.optionsLabel') },
    { id: 'signature',  label: t('generalConfig.signatureLabel') },
    { id: 'params',     label: t('generalConfig.paramsLabel') },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: activeSection === s.id ? 700 : 400,
              color: activeSection === s.id ? 'var(--accent)' : 'var(--text2)',
              borderBottom: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              transition: 'color .15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'options' && <RentalOptionsSection />}
      {activeSection === 'signature' && <SignatureSection />}
      {activeSection === 'params' && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="card-header"><h3>{t('generalConfig.paramsTitle')}</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>
              {t('generalConfig.paramsPlaceholder')}
            </p>
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>
              <span>ℹ️</span>
              <span>{t('generalConfig.kmHint')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
