import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { getAccounts, saveAccount } from '../../storage.js'
import Modal from './Modal.jsx'
import { card, tableStyle, th, td, inputStyle, selectStyle, btnPrimary, btnSecondary, badge } from './accountingStyles.js'

export default function TabPlanComptable() {
  const [accounts, setAccounts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', type: 'asset', category: 'Actifs', normalBalance: 'debit' })
  const [error, setError] = useState('')

  const load = useCallback(() => setAccounts(getAccounts()), [])
  useEffect(() => { load() }, [load])

  const categories = [...new Set(accounts.map(a => a.category))]

  const handleSave = () => {
    setError('')
    if (!form.code.trim() || !form.name.trim()) { setError('Code et nom requis.'); return }
    if (accounts.find(a => a.code === form.code.trim() && !a.id)) { setError('Code déjà utilisé.'); return }
    saveAccount({ ...form, code: form.code.trim(), name: form.name.trim() })
    setShowForm(false)
    setForm({ code: '', name: '', type: 'asset', category: 'Actifs', normalBalance: 'debit' })
    load()
  }

  const TYPE_LABELS = { asset: 'Actif', liability: 'Passif', revenue: 'Produit', expense: 'Charge' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={btnPrimary} onClick={() => setShowForm(true)}><Plus size={14} /> Nouveau compte</button>
      </div>

      {categories.map(cat => (
        <div key={cat} style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>{cat}</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Code', 'Compte', 'Type', 'Solde normal'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {accounts.filter(a => a.category === cat).map(a => (
                <tr key={a.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', width: 80 }}>{a.code}</td>
                  <td style={td}>{a.name}{a.isSystem ? '' : <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(personnalisé)</span>}</td>
                  <td style={td}><span style={badge({ background: '#1e2842', color: '#93c5fd' })}>{TYPE_LABELS[a.type] || a.type}</span></td>
                  <td style={td}><span style={badge(a.normalBalance === 'debit' ? { background: '#2d1e3e', color: '#c084fc' } : { background: '#1e3a2a', color: '#86efac' })}>{a.normalBalance === 'debit' ? 'Débit' : 'Crédit'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showForm && (
        <Modal title="Nouveau compte" onClose={() => setShowForm(false)}>
          {error && <div style={{ background: '#3b1a1a', color: '#f87171', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Code</label>
              <input style={inputStyle} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="ex: 5000" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Nom du compte</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Petite caisse" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Type</label>
              <select style={selectStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="asset">Actif</option>
                <option value="liability">Passif</option>
                <option value="revenue">Produit</option>
                <option value="expense">Charge</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <input style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="ex: Actifs" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Solde normal</label>
              <select style={selectStyle} value={form.normalBalance} onChange={e => setForm(f => ({ ...f, normalBalance: e.target.value }))}>
                <option value="debit">Débit</option>
                <option value="credit">Crédit</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button style={btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
              <button style={btnPrimary} onClick={handleSave}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
