import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Contracts from './Contracts'
import Invoices from './Invoices'

const TABS = [
  { id: 'contracts',  key: 'nav.documentsContracts' },
  { id: 'invoices',   key: 'nav.documentsInvoices' },
]

export default function Documents({ onRestitution, initialTab = 'contracts' }) {
  const { t } = useTranslation('common')
  const [active, setActive] = useState(initialTab)
  const tabs = TABS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActive(tab.id)} style={{
            padding: '8px 20px', borderRadius: '8px 8px 0 0',
            border: '1px solid var(--border)',
            borderBottom: active === tab.id ? '1px solid var(--bg-secondary)' : '1px solid var(--border)',
            marginBottom: active === tab.id ? -1 : 0,
            background: active === tab.id ? 'var(--bg-secondary)' : 'transparent',
            color: active === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: active === tab.id ? 600 : 400,
            fontSize: 13, cursor: 'pointer',
          }}>{t(tab.key)}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {active === 'contracts'  && <Contracts onRestitution={onRestitution} />}
        {active === 'invoices'   && <Invoices />}
      </div>
    </div>
  )
}
