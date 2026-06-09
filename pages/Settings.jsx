import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AgenceTab from './settings/AgenceTab'
import GeneralConfigTab from './settings/GeneralConfigTab'
import FleetConfigTab from './settings/FleetConfigTab'
import TeamTab from './settings/TeamTab'
import TelematicsTab from './settings/TelematicsTab'
import IntegrationsTab from './settings/IntegrationsTab'
import PrivacyTab from './settings/PrivacyTab'
import LanguageSelector from '../components/LanguageSelector'
import { useUser } from '../lib/UserContext'

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

// The 3 former "configuration" tabs (agence/parc/general) are merged
// into one scrollable "Configuration générale" section that exposes the
// language selector at the top. Other tabs remain independent.
//
// `requiresAdmin` flags admin/manager-only tabs. Staff users see only
// the Privacy tab; everything else is gated.
const SETTINGS_TABS_KEYS = [
  { id: 'configuration',  key: 'tabs.configuration', requiresAdmin: true  },
  { id: 'equipe',         key: 'tabs.team',          requiresAdmin: true  },
  { id: 'telematique',    key: 'tabs.telematique',   requiresAdmin: true  },
  { id: 'integrations',   key: 'tabs.integrations',  requiresAdmin: true  },
  { id: 'privacy',        key: 'tabs.privacy',       requiresAdmin: false },
]

// ─────────────────────────────────────────────────────────
// Section header for the merged Configuration tab
// ─────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      paddingBottom: 8,
      marginBottom: 16,
      marginTop: 8,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0 0' }}>{subtitle}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Merged Configuration view — Language + Agency + Fleet + General
// ─────────────────────────────────────────────────────────

function ConfigurationView({ t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 40 }}>
      {/* Language selector — top of configuration */}
      <div>
        <SectionHeader
          title={t('sections.language', 'Langue')}
          subtitle={t('sections.languageHint', 'Choisissez la langue d\'affichage de l\'application.')}
        />
        <div style={{ maxWidth: 320 }}>
          <LanguageSelector />
        </div>
      </div>

      {/* Agency info */}
      <div>
        <SectionHeader
          title={t('sections.agency', 'Informations de l\'agence')}
          subtitle={t('sections.agencyHint', 'Nom, ville, identifiants légaux (ICE, RC).')}
        />
        <AgenceTab />
      </div>

      {/* Fleet config */}
      <div>
        <SectionHeader
          title={t('sections.fleet', 'Configuration du parc')}
          subtitle={t('sections.fleetHint', 'Marques et modèles disponibles dans votre flotte.')}
        />
        <FleetConfigTab />
      </div>

      {/* General config */}
      <div>
        <SectionHeader
          title={t('sections.general', 'Paramètres généraux')}
          subtitle={t('sections.generalHint', 'Options de location, signature et préférences générales.')}
        />
        <GeneralConfigTab />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SETTINGS (main export)
// ─────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation('settings')
  const { isAdmin } = useUser()

  // Filter the tab list by role. Staff (non-admin) only ever sees the
  // Privacy tab; admin/manager users see the full set.
  const visibleTabs = SETTINGS_TABS_KEYS.filter(
    tab => isAdmin || !tab.requiresAdmin
  )

  // Default to the first visible tab — for admins this is "configuration",
  // for staff it collapses to "privacy".
  const initialTab = visibleTabs[0]?.id || 'privacy'
  const [activeTab, setActiveTab] = useState(initialTab)

  // If the user's role flips while this page is open (e.g. they're
  // demoted via TeamTab), re-clamp the active tab to a visible one
  // instead of rendering a tab the user no longer has access to.
  useEffect(() => {
    if (!visibleTabs.find(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'privacy')
    }
  }, [isAdmin, activeTab, visibleTabs])

  return (
    <div>
      <div className="page-header"><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></div>
      <div className="page-body">
        {/* Tab bar — only visible tabs are rendered */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {visibleTabs.map(tab => (
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

        {/* Render only if the active tab is in the visible list — extra
            defence in case an out-of-band setActiveTab lands here. */}
        {activeTab === 'configuration' && isAdmin && <ConfigurationView t={t} />}
        {activeTab === 'equipe'        && isAdmin && <TeamTab />}
        {activeTab === 'telematique'   && isAdmin && <TelematicsTab />}
        {activeTab === 'integrations'  && isAdmin && <IntegrationsTab />}
        {activeTab === 'privacy'                  && <PrivacyTab />}
      </div>
    </div>
  )
}
