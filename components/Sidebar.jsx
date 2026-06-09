import { useTranslation } from 'react-i18next'
import { LayoutDashboard, PlusCircle, Car, Users, FolderOpen, CalendarDays, Settings, LogOut, RotateCcw, Inbox, Globe, Shield, ClipboardList, BookOpen } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import LanguageSelector from './LanguageSelector'
import { useSidebarCounts } from '../src/hooks/useSidebarCounts'
import { api } from '../lib/api.js'
import { getFleet, getContracts } from '../lib/db'

const PREFETCH = {
  clients:   { key: ['clients'],          fn: api.getClients,                stale: 60_000 },
  fleet:     { key: ['fleet'],            fn: getFleet,                      stale: 60_000 },
  contracts: { key: ['contracts'],        fn: getContracts,                  stale: 30_000 },
  basket:    { key: ['leads', 'pending'], fn: () => api.getLeads('pending'), stale: 15_000 },
}

const NAV_IDS = [
  { id: 'dashboard',         key: 'dashboard',  icon: LayoutDashboard },
  { id: 'new-rental',        key: 'newRental',   icon: PlusCircle },
  { id: 'restitution-quick', key: 'restitution', icon: RotateCcw },
  { id: 'fleet',             key: 'fleet',       icon: Car },
  { id: 'clients',           key: 'clients',     icon: Users },
  { id: 'documents',         key: 'documents',   icon: FolderOpen },
  { id: 'calendar',          key: 'calendar',    icon: CalendarDays },
  { id: 'reservations',      key: 'reservations', icon: ClipboardList },
  { id: 'accounting',        key: 'accounting',  icon: BookOpen },
  { id: 'basket',            key: 'basket',      icon: Inbox },
  { id: 'network',           key: 'network',     icon: Globe },
  { id: 'settings',          key: 'settings',    icon: Settings },
]

const ADMIN_ONLY_PAGES = ['settings', 'accounting']

export default function Sidebar({ active, onNav, user, profile, isAdmin = true, onSignOut }) {
  const { t } = useTranslation('common')
  const displayName = profile?.full_name || user?.email || ''
  const agencyName  = profile?.agencies?.name || ''

  const visibleNav = NAV_IDS.filter(({ id }) => isAdmin || !ADMIN_ONLY_PAGES.includes(id))

  // â”€â”€ Unread Basket count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TanStack Query with 10s staleTime + refetchInterval replaces the old
  // setInterval(1s) which generated ~3600 req/hr/session. 10× reduction.
  // Mutations elsewhere call queryClient.invalidateQueries(['leads'|'alerts'])
  // which surfaces here immediately.
  const { total: basketUnread } = useSidebarCounts()

  // -- Hover-to-prefetch --------------------------------------------------
  // Warms the TanStack Query cache on nav-link hover so the page render
  // feels instant. Only the 4 data-heavy pages are in PREFETCH; others
  // are intentional no-ops (cfg is undefined -> early return).
  const qc = useQueryClient()
  const prefetch = (page) => {
    const cfg = PREFETCH[page]
    if (!cfg) return
    qc.prefetchQuery({ queryKey: cfg.key, queryFn: cfg.fn, staleTime: cfg.stale })
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="logo-icon">ðŸš—</span>
        <span className="logo-text">RentaFlow</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {visibleNav.map(({ id, key, icon: Icon }) => {
          const navTarget = id === 'restitution-quick' ? 'restitution-picker' : id
          const isActive  = active === id
          return (
            <button
              key={id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => onNav(navTarget)}
              onMouseEnter={() => prefetch(id)}
            >
              <Icon size={15} />
              <span>{t(`nav.${key}`)}</span>
              {/* Live unread-count badge â€” only on Basket, only when > 0.
                  Pushed to the trailing edge with marginLeft:auto so it
                  sits next to (or replaces) the static PRO badge. */}
              {id === 'basket' && basketUnread > 0 && (
                <span
                  title={`${basketUnread} demande(s) en attente`}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    fontWeight: 700,
                    background: '#CF4500',
                    color: '#F3F0EE',
                    borderRadius: 999,
                    padding: '2px 7px',
                    minWidth: 18,
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}
                >
                  {basketUnread > 99 ? '99+' : basketUnread}
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
        <button
          className="nav-item"
          style={{
            width: '100%',
            color: 'var(--text-secondary)',
            fontSize: 12,
            marginTop: 8,
          }}
          onClick={() => onNav('privacy-policy')}
        >
          <Shield size={13} />
          <span>{t('privacy.linkLabel')}</span>
        </button>
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
                v1.16.2
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
