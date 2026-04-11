import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AgenceTab from './settings/AgenceTab'
import GeneralConfigTab from './settings/GeneralConfigTab'
import FleetConfigTab from './settings/FleetConfigTab'
import TeamTab from './settings/TeamTab'
import TelematicsTab from './settings/TelematicsTab'
import IntegrationsTab from './settings/IntegrationsTab'

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const SETTINGS_TABS_KEYS = [
  { id: 'agence',      key: 'tabs.agency' },
  { id: 'parc',        key: 'tabs.fleetConfig' },
  { id: 'general',     key: 'tabs.general' },
  { id: 'equipe',      key: 'tabs.team' },
  { id: 'telematique',   key: 'tabs.telematique' },
  { id: 'integrations',  key: 'tabs.integrations' },
]

// ─────────────────────────────────────────────────────────
// SETTINGS (main export)
// ─────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation('settings')
  const [activeTab, setActiveTab] = useState('agence')

  return (
    <div>
      <div className="page-header"><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></div>
      <div className="page-body">
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {SETTINGS_TABS_KEYS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 20px', fontSize: 14, fontWeight: 600,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color .15s',
              }}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {activeTab === 'agence'      && <AgenceTab />}
        {activeTab === 'parc'        && <FleetConfigTab />}
        {activeTab === 'general'     && <GeneralConfigTab />}
        {activeTab === 'equipe'      && <TeamTab />}
        {activeTab === 'telematique'  && <TelematicsTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
      </div>
    </div>
  )
}
