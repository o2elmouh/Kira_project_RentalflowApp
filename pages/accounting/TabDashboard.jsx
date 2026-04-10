import { useState, useEffect } from 'react'
import {
  getAccounts,
  getJournalEntries,
  getContracts,
  getFleet,
} from '../../lib/db'
import PnLView from './PnLView.jsx'
import UtilizationView from './UtilizationView.jsx'
import AgedReceivablesView from './AgedReceivablesView.jsx'

export default function TabDashboard() {
  const [view, setView]       = useState('pl')
  const [contracts, setContracts] = useState([])
  const [fleet, setFleet]     = useState([])
  const [entries, setEntries] = useState([])
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    async function load() {
      setContracts(await getContracts())
      setFleet(await getFleet())
      setEntries(await getJournalEntries())
      setAccounts(await getAccounts())
    }
    load()
  }, [])

  const VIEWS = [
    { id: 'pl',          label: 'Compte de résultat' },
    { id: 'utilization', label: 'Utilisation vs Revenu' },
    { id: 'receivables', label: 'Créances en souffrance' },
  ]

  return (
    <div>
      {/* View switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-secondary, #1e2130)', borderRadius: 8, padding: 4, width: 'fit-content', border: '1px solid var(--border)' }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: view === v.id ? 'var(--accent, #6366f1)' : 'transparent',
              color: view === v.id ? '#fff' : 'var(--text3)',
              transition: 'all 0.15s',
            }}
          >{v.label}</button>
        ))}
      </div>

      {view === 'pl'          && <PnLView contracts={contracts} entries={entries} accounts={accounts} />}
      {view === 'utilization' && <UtilizationView contracts={contracts} fleet={fleet} />}
      {view === 'receivables' && <AgedReceivablesView contracts={contracts} />}
    </div>
  )
}
