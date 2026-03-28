import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import NewRental from './pages/NewRental'
import Fleet from './pages/Fleet'
import { Clients, Contracts, Invoices, Settings } from './pages/OtherPages'
import Restitution from './pages/Restitution'
import { seedDemoData } from './utils/storage'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [restitutionContract, setRestitutionContract] = useState(null)

  useEffect(() => { seedDemoData() }, [])

  const handleRestitution = (contract) => {
    setRestitutionContract(contract)
    setPage('restitution')
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':   return <Dashboard onNav={setPage} />
      case 'new-rental':  return <NewRental onDone={() => setPage('dashboard')} />
      case 'contracts':   return <Contracts onRestitution={handleRestitution} />
      case 'invoices':    return <Invoices />
      case 'clients':     return <Clients />
      case 'fleet':       return <Fleet />
      case 'settings':    return <Settings />
      case 'restitution':
        if (!restitutionContract) { setTimeout(() => setPage('contracts'), 0); return null }
        return <Restitution contract={restitutionContract} onDone={() => { setRestitutionContract(null); setPage('contracts') }} />
      default:            return <Dashboard onNav={setPage} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar active={page} onNav={setPage} />
      <main className="main">{renderPage()}</main>
    </div>
  )
}
