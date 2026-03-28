import { LayoutDashboard, PlusCircle, Car, Users, FileText, Receipt, Settings } from 'lucide-react'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'new-rental', label: 'New Rental',  icon: PlusCircle },
  { id: 'fleet',      label: 'Fleet',       icon: Car },
  { id: 'clients',    label: 'Clients',     icon: Users },
  { id: 'contracts',  label: 'Contracts',   icon: FileText },
  { id: 'invoices',   label: 'Invoices',    icon: Receipt },
  { id: 'settings',   label: 'Settings',    icon: Settings },
]

export default function Sidebar({ active, onNav }) {
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
    </aside>
  )
}
