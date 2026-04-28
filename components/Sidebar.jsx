import { useTranslation } from 'react-i18next'
import { LayoutDashboard, PlusCircle, Car, Users, FolderOpen, CalendarDays, Settings, LogOut, RotateCcw, Inbox, Globe } from 'lucide-react'
import LanguageSelector from './LanguageSelector'

const NAV_IDS = [
  { id: 'dashboard',         key: 'dashboard',  icon: LayoutDashboard },
  { id: 'new-rental',        key: 'newRental',   icon: PlusCircle },
  { id: 'restitution-quick', key: 'restitution', icon: RotateCcw },
  { id: 'fleet',             key: 'fleet',       icon: Car },
  { id: 'clients',           key: 'clients',     icon: Users },
  { id: 'documents',         key: 'documents',   icon: FolderOpen },
  { id: 'calendar',          key: 'calendar',    icon: CalendarDays },
  { id: 'basket',            key: 'basket',      icon: Inbox,  premium: true },
  { id: 'network',           key: 'network',     icon: Globe },
  { id: 'settings',          key: 'settings',    icon: Settings },
]

const ADMIN_ONLY_PAGES = []

export default function Sidebar({ active, onNav, user, profile, isAdmin = true, onSignOut }) {
  const { t } = useTranslation('common')
  const displayName = profile?.full_name || user?.email || ''
  const agencyName  = profile?.agencies?.name || ''

  const visibleNav = NAV_IDS.filter(({ id }) => isAdmin || !ADMIN_ONLY_PAGES.includes(id))

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="logo-icon">🚗</span>
        <span className="logo-text">RentaFlow</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {visibleNav.map(({ id, key, icon: Icon, premium }) => {
          const navTarget = id === 'restitution-quick' ? 'restitution-picker' : id
          const isActive  = active === id
          return (
            <button
              key={id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => onNav(navTarget)}
            >
              <Icon size={15} />
              <span>{t(`nav.${key}`)}</span>
              {premium && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 9,
                  fontWeight: 700,
                  background: '#141413',
                  color: '#F3F0EE',
                  borderRadius: 999,
                  padding: '1px 6px',
                  lineHeight: 1.6,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}>
                  PRO
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--border)',
        padding: '12px 12px 8px',
      }}>
        <LanguageSelector />
      </div>

      {user && onSignOut && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 12px 16px',
        }}>
          {agencyName && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 8,
              paddingRight: 4,
              marginBottom: 6,
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {agencyName}
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontFamily: 'DM Mono, monospace',
              }}>
                v1.3.1
              </span>
            </div>
          )}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 8,
            marginBottom: 8,
          }}>
            <span style={{
              fontSize: 12,
              color: 'var(--ink)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {displayName}
            </span>
            {profile?.role && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                flexShrink: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                background: profile.role === 'admin' ? '#141413' : '#EAF4EE',
                color:      profile.role === 'admin' ? '#F3F0EE' : '#2D7A47',
              }}>
                {profile.role}
              </span>
            )}
          </div>

          <button
            className="nav-item"
            style={{ width: '100%', color: 'var(--text-secondary)' }}
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
