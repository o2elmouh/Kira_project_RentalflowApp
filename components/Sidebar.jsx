import { useTranslation } from 'react-i18next'
import { LayoutDashboard, PlusCircle, Car, Users, FileText, Receipt, Settings, LogOut, RotateCcw } from 'lucide-react'
import LanguageSelector from './LanguageSelector'

const NAV_IDS = [
  { id: 'dashboard',         key: 'dashboard',   icon: LayoutDashboard },
  { id: 'new-rental',        key: 'newRental',    icon: PlusCircle },
  { id: 'restitution-quick', key: 'restitution',  icon: RotateCcw },
  { id: 'fleet',             key: 'fleet',        icon: Car },
  { id: 'clients',           key: 'clients',      icon: Users },
  { id: 'contracts',         key: 'contracts',    icon: FileText },
  { id: 'invoices',          key: 'invoices',     icon: Receipt },
  { id: 'settings',          key: 'settings',     icon: Settings },
]

export default function Sidebar({ active, onNav, user, profile, onSignOut }) {
  const { t } = useTranslation('common')
  const displayName = profile?.full_name || user?.email || ''
  const agencyName  = profile?.agencies?.name || ''

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🚗</span>
        <span className="logo-text">RentaFlow</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_IDS.map(({ id, key, icon: Icon }) => {
          const isRestitution = id === 'restitution-quick'
          const navTarget = isRestitution ? 'restitution-picker' : id
          return (
            <button
              key={id}
              className={`nav-item${active === id ? ' active' : ''}`}
              onClick={() => onNav(navTarget)}
              style={isRestitution ? {
                background: active === id ? undefined : 'rgba(251, 191, 36, 0.10)',
                borderLeft: '2px solid rgba(251, 191, 36, 0.45)',
                color: 'var(--text2)',
              } : undefined}
            >
              <Icon size={16} />
              <span>{t(`nav.${key}`)}</span>
            </button>
          )
        })}
      </nav>

      {user && onSignOut && (
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 'auto' }}>
          {agencyName && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, paddingLeft: 8 }}>
              {agencyName}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text2)', paddingLeft: 8, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div style={{ marginBottom: 8 }}>
            <LanguageSelector />
          </div>
          <button
            className="nav-item"
            style={{ width: '100%', color: 'var(--text3)' }}
            onClick={onSignOut}
          >
            <LogOut size={14} />
            <span>{t('signOut')}</span>
          </button>
        </div>
      )}
    </aside>
  )
}
