import { LayoutDashboard, PlusCircle, Car, Users, FileText, Receipt, Settings, LogOut } from 'lucide-react'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'new-rental', label: 'New Rental',  icon: PlusCircle },
  { id: 'fleet',      label: 'Fleet',       icon: Car },
  { id: 'clients',    label: 'Clients',     icon: Users },
  { id: 'contracts',  label: 'Contracts',   icon: FileText },
  { id: 'invoices',   label: 'Invoices',    icon: Receipt },
  { id: 'settings',   label: 'Settings',    icon: Settings },
]

export default function Sidebar({ active, onNav, user, profile, onSignOut }) {
  const displayName = profile?.full_name || user?.email || ''
  const agencyName  = profile?.agencies?.name || ''

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🚗</span>
        <span className="logo-text">RentaFlow</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${active === id ? ' active' : ''}`}
            onClick={() => onNav(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {user && onSignOut && (
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          {agencyName && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, paddingLeft: 8 }}>
              {agencyName}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text2)', paddingLeft: 8, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <button
            className="nav-item"
            style={{ width: '100%', color: 'var(--text3)' }}
            onClick={onSignOut}
          >
            <LogOut size={14} />
            <span>Déconnexion</span>
          </button>
        </div>
      )}
    </aside>
  )
}
