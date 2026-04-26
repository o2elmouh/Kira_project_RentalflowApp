import { useTranslation } from 'react-i18next'
import { LayoutDashboard, PlusCircle, Car, Users, FileText, Receipt, Settings, LogOut, RotateCcw, Calculator, Inbox, Globe } from 'lucide-react'
import LanguageSelector from './LanguageSelector'

const NAV_IDS = [
  { id: 'dashboard',         key: 'dashboard',   icon: LayoutDashboard },
  { id: 'new-rental',        key: 'newRental',    icon: PlusCircle },
  { id: 'restitution-quick', key: 'restitution',  icon: RotateCcw },
  { id: 'fleet',             key: 'fleet',        icon: Car },
  { id: 'clients',           key: 'clients',      icon: Users },
  { id: 'contracts',         key: 'contracts',    icon: FileText },
  { id: 'invoices',          key: 'invoices',     icon: Receipt },
  { id: 'accounting',        key: 'accounting',   icon: Calculator },
  { id: 'basket',            key: 'basket',       icon: Inbox, premium: true },
  { id: 'network',           key: 'network',      icon: Globe },
  { id: 'settings',          key: 'settings',     icon: Settings },
]

// Pages restricted to admin role only
const ADMIN_ONLY_PAGES = ['accounting']

export default function Sidebar({ active, onNav, user, profile, isAdmin = true, onSignOut }) {
  const { t } = useTranslation('common')
  const displayName = profile?.full_name || user?.email || ''
  const agencyName  = profile?.agencies?.name || ''

  const visibleNav = NAV_IDS.filter(({ id }) => isAdmin || !ADMIN_ONLY_PAGES.includes(id))

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🚗</span>
        <span className="logo-text">RentaFlow</span>
      </div>
      <nav className="sidebar-nav">
        {visibleNav.map(({ id, key, icon: Icon, premium }) => {
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
              {premium && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 4px', lineHeight: 1.4, letterSpacing: 0.5 }}>
                  PRO
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer — always visible; sign-out section only when authenticated */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ marginBottom: user && onSignOut ? 8 : 0 }}>
          <LanguageSelector />
        </div>
      </div>

      {user && onSignOut && (
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          {agencyName && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingLeft: 8, paddingRight: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {agencyName}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', opacity: 0.6 }}>
                v1.2.4
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {displayName}
            </span>
            {profile?.role && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                background: profile.role === 'admin' ? '#ede7f6' : '#e8f5e9',
                color:      profile.role === 'admin' ? '#6a1b9a' : '#388e3c',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {profile.role}
              </span>
            )}
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
