import { useState, useEffect } from 'react'
import { PlusCircle, CheckCircle, Trash2 } from 'lucide-react'
import { getRepairs, saveRepair, deleteRepair } from '../../lib/db'
import { REPAIR_TYPES, EMPTY_INLINE_REPAIR } from './constants'

export default function InlineRepairsSection({ vehicleId }) {
  const [repairs, setRepairs]   = useState([])
  const [tco, setTco]           = useState(null)
  const [form, setForm]         = useState(null)
  const fp = (patch) => setForm(p => ({ ...p, ...patch }))

  const refresh = async () => {
    try {
      const list = await getRepairs(vehicleId)
      setRepairs(list)
      // Compute TCO locally from fetched list (avoids extra async call)
      const totalExpense   = list.reduce((s, r) => s + (Number(r.cost) || 0), 0)
      const totalInsurance = list.reduce((s, r) => s + (Number(r.insuranceReimbursement) || 0), 0)
      const totalFranchise = list.reduce((s, r) => s + (Number(r.clientFranchise) || 0), 0)
      setTco({ totalExpense, totalInsurance, totalFranchise, netTCO: totalExpense - totalInsurance - totalFranchise })
    } catch (e) { console.error(e) }
  }

  useEffect(() => { if (vehicleId && vehicleId !== 'new') refresh() }, [vehicleId])

  const save = async () => {
    try {
      const type = form.type === 'Autre' && form.label ? form.label : form.type
      await saveRepair({
        ...form, vehicleId, type,
        cost:                    Number(form.cost) || 0,
        mileage:                 Number(form.mileage) || 0,
        insuranceReimbursement:  Number(form.insuranceReimbursement) || 0,
        clientFranchise:         Number(form.clientFranchise) || 0,
        isSinistre:              !!form.isSinistre,
      })
      setForm(null)
      await refresh()
    } catch (e) { console.error(e) }
  }

  const remove = async (id) => {
    if (confirm('Supprimer cette réparation ?')) {
      try { await deleteRepair(id); await refresh() } catch (e) { console.error(e) }
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔧</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>Réparations & maintenance</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY_INLINE_REPAIR })}>
          <PlusCircle size={13} /> Ajouter
        </button>
      </div>

      {/* TCO summary */}
      {tco && tco.totalExpense > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--text3)' }}>Charges <strong style={{ color: '#dc2626', fontFamily: 'DM Mono, monospace' }}>{tco.totalExpense.toLocaleString()} MAD</strong></span>
          {tco.totalInsurance > 0 && <span style={{ color: 'var(--text3)' }}>Remb. assurance <strong style={{ color: '#16a34a', fontFamily: 'DM Mono, monospace' }}>−{tco.totalInsurance.toLocaleString()} MAD</strong></span>}
          {tco.totalFranchise > 0 && <span style={{ color: 'var(--text3)' }}>Franchise client <strong style={{ color: '#16a34a', fontFamily: 'DM Mono, monospace' }}>−{tco.totalFranchise.toLocaleString()} MAD</strong></span>}
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: tco.netTCO > 0 ? '#dc2626' : '#16a34a' }}>
            TCO net : {tco.netTCO.toLocaleString()} MAD
          </span>
        </div>
      )}

      {/* Form */}
      {form && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Base fields */}
          <div className="form-row cols-3">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.date} onChange={e => fp({ date: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Type de réparation</label>
              <select className="form-select" value={form.type} onChange={e => fp({ type: e.target.value, label: '' })}>
                {REPAIR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Coût facture (MAD)</label>
              <input className="form-input text-mono" type="number" min="0" value={form.cost} onChange={e => fp({ cost: e.target.value })} placeholder="0" />
            </div>
          </div>

          {/* Custom label if "Autre" */}
          {form.type === 'Autre' && (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: 12 }}>Libellé <span style={{ color: 'var(--text3)' }}>(optionnel)</span></label>
              <input className="form-input" value={form.label || ''} placeholder="Ex: Remplacement vitre, Nettoyage injecteurs…" onChange={e => fp({ label: e.target.value })} />
            </div>
          )}

          <div className="form-row cols-2">
            <div className="form-group">
              <label className="form-label">Garage / Prestataire</label>
              <input className="form-input" value={form.garage} placeholder="Ex: Garage Atlas" onChange={e => fp({ garage: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Kilométrage</label>
              <input className="form-input text-mono" type="number" min="0" value={form.mileage} onChange={e => fp({ mileage: e.target.value })} placeholder="0" />
            </div>
          </div>

          {/* Sinistre toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', padding: '8px 10px', background: form.isSinistre ? 'rgba(220,38,38,.07)' : 'transparent', border: '1px solid var(--border)', borderRadius: 8 }}>
            <input type="checkbox" checked={!!form.isSinistre} onChange={e => fp({ isSinistre: e.target.checked })} style={{ accentColor: '#dc2626' }} />
            <span style={{ fontWeight: 600 }}>🚗 Réparation liée à un sinistre / accident</span>
          </label>

          {/* Sinistre fields */}
          {form.isSinistre && (
            <div style={{ background: 'rgba(220,38,38,.04)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Sinistre</div>

              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Référence sinistre <span style={{ color: 'var(--text3)' }}>(optionnel)</span></label>
                  <input className="form-input" value={form.sinistreId} placeholder="Ex: SIN-2024-001" onChange={e => fp({ sinistreId: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Réf. dossier assurance <span style={{ color: 'var(--text3)' }}>(optionnel)</span></label>
                  <input className="form-input" value={form.insuranceRef} placeholder="Ex: ASS-00123" onChange={e => fp({ insuranceRef: e.target.value })} />
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                Flux financiers (laissez vide si non encore perçu)
              </div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Remboursement assurance (MAD) <span style={{ color: '#16a34a', fontSize: 11 }}>← Crédit 758</span></label>
                  <input className="form-input text-mono" type="number" min="0" value={form.insuranceReimbursement} placeholder="0" onChange={e => fp({ insuranceReimbursement: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Franchise client (MAD) <span style={{ color: '#16a34a', fontSize: 11 }}>← Crédit 411</span></label>
                  <input className="form-input text-mono" type="number" min="0" value={form.clientFranchise} placeholder="0" onChange={e => fp({ clientFranchise: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: 12 }}>N° contrat associé <span style={{ color: 'var(--text3)' }}>(optionnel)</span></label>
                <input className="form-input" value={form.contractId} placeholder="Ex: CTR-2024-042" onChange={e => fp({ contractId: e.target.value })} />
              </div>

              {/* Real-time net cost preview */}
              {(Number(form.cost) > 0) && (
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, fontFamily: 'DM Mono, monospace' }}>
                  Coût net = {(Number(form.cost) || 0).toLocaleString()}
                  {Number(form.insuranceReimbursement) > 0 && <> − {Number(form.insuranceReimbursement).toLocaleString()} (assurance)</>}
                  {Number(form.clientFranchise) > 0 && <> − {Number(form.clientFranchise).toLocaleString()} (franchise)</>}
                  {' = '}
                  <strong style={{ color: (Number(form.cost) - Number(form.insuranceReimbursement || 0) - Number(form.clientFranchise || 0)) > 0 ? '#dc2626' : '#16a34a' }}>
                    {(Number(form.cost) - Number(form.insuranceReimbursement || 0) - Number(form.clientFranchise || 0)).toLocaleString()} MAD
                  </strong>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!form.date || !form.cost}>
              <CheckCircle size={13} /> Enregistrer
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </div>
      )}

      {repairs.length === 0 && !form && (
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Aucune réparation enregistrée.</p>
      )}

      {/* Repairs list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {repairs.map(r => {
          const net = (Number(r.cost) || 0) - (Number(r.insuranceReimbursement) || 0) - (Number(r.clientFranchise) || 0)
          return (
            <div key={r.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: `1px solid ${r.isSinistre ? 'rgba(220,38,38,.3)' : 'var(--border)'}`, borderRadius: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, marginTop: 2 }}>{r.isSinistre ? '🚗' : '🔧'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.type}</span>
                    {r.isSinistre && <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid rgba(220,38,38,.3)', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>SINISTRE</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: '#dc2626' }}>{(r.cost || 0).toLocaleString()} MAD</span>
                    {(Number(r.insuranceReimbursement) > 0 || Number(r.clientFranchise) > 0) && (
                      <div style={{ fontSize: 11, color: '#16a34a', fontFamily: 'DM Mono, monospace' }}>net : {net.toLocaleString()} MAD</div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {new Date(r.date).toLocaleDateString('fr-MA')}
                  {r.garage ? ` · ${r.garage}` : ''}
                  {r.mileage ? ` · ${Number(r.mileage).toLocaleString()} km` : ''}
                  {r.sinistreId ? ` · Réf: ${r.sinistreId}` : ''}
                </div>
                {(Number(r.insuranceReimbursement) > 0 || Number(r.clientFranchise) > 0) && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {Number(r.insuranceReimbursement) > 0 && <span>Assurance: {Number(r.insuranceReimbursement).toLocaleString()} MAD  </span>}
                    {Number(r.clientFranchise) > 0 && <span>Franchise: {Number(r.clientFranchise).toLocaleString()} MAD</span>}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 2 }} onClick={() => remove(r.id)}><Trash2 size={12} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
