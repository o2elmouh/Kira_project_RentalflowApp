import { useState, useEffect } from 'react'
import { ChevronLeft, Edit2, Trash2, PlusCircle } from 'lucide-react'
import { getContracts, getRepairs, addRepair } from '../../lib/db'
import { getDefaultConfigForMake as getFleetConfigForMake } from '../../lib/fleetConfigDefaults'
import DeadlineBadge from './DeadlineBadge'
import { displayPlate, computeDeadlinesFromConfig } from './constants'

export default function VehicleDetail({ vehicle, onClose, onSave, onEdit, onDelete }) {
  const [showDeadlineEdit, setShowDeadlineEdit] = useState(false)
  const [deadlineForm, setDeadlineForm] = useState(() => computeDeadlinesFromConfig(vehicle))
  const [deadlineSaved, setDeadlineSaved] = useState(false)
  const [contracts, setContracts] = useState([])
  const [repairs, setRepairs] = useState([])
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [repairDraft, setRepairDraft] = useState({ label: '', date: new Date().toISOString().split('T')[0], cost: '' })

  useEffect(() => {
    let cancelled = false
    getContracts()
      .then(all => { if (!cancelled) setContracts(all.filter(c => c.vehicleId === vehicle.id)) })
      .catch(console.error)
    getRepairs(vehicle.id)
      .then(data => { if (!cancelled) setRepairs(data) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [vehicle.id])

  // Locations metrics
  const totalRevenue = contracts.reduce((s, c) => s + (c.totalTTC || 0), 0)
  const totalDays = contracts.reduce((s, c) => s + (c.days || 0), 0)
  const activeContract = contracts.find(c => c.status === 'active')

  // Repairs metrics
  const repairTotal = repairs.reduce((s, r) => s + (r.cost || 0), 0)
  const lastRepair = repairs.length > 0 ? repairs.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null

  // Amortissement metrics
  const price    = Number(vehicle.purchasePrice) || 0
  const lifespan = Number(vehicle.lifespan) || 5
  const residual = Number(vehicle.residualValue) || 0
  const boughtDate = (vehicle.purchaseDate && vehicle.purchaseDate !== '') ? vehicle.purchaseDate : (vehicle.year ? `${vehicle.year}-01-01` : null)
  const bought = boughtDate ? new Date(boughtDate) : null
  const yearsElapsed = (bought && !isNaN(bought.getTime())) ? (Date.now() - bought.getTime()) / (365.25 * 24 * 3600 * 1000) : 0
  const bookValue = price > 0 ? Math.max(residual, price - totalRevenue) : 0
  const amortPct = price > 0 ? Math.min(100, (totalRevenue / price) * 100) : 0

  // Deadlines metrics
  const nextOilKm   = vehicle.nextOilChangeMileage || ''
  const nextBeltKm  = vehicle.nextTimingBeltMileage || ''
  const ctDate = vehicle.nextControleTech || ''
  const assurDate = vehicle.insuranceEnd || ''

  const statusColor = vehicle.status === 'available' ? '#16a34a' : vehicle.status === 'rented' ? '#f59e0b' : '#6b7280'
  const statusLabel = vehicle.status === 'available' ? 'Disponible' : vehicle.status === 'rented' ? 'En location' : 'Maintenance'

  const saveDeadlines = () => {
    onSave({ ...vehicle, ...deadlineForm })
    setDeadlineSaved(true)
    setTimeout(() => setDeadlineSaved(false), 2000)
  }

  const config = getFleetConfigForMake(vehicle.make)
  const deadlineFields = [
    { label: 'Prochaine vidange',     mileageKey: 'nextOilChangeMileage',  configHint: config ? `Config : tous les ${config.vidangeKm.toLocaleString()} km` : null },
    { label: 'Changement courroie',   mileageKey: 'nextTimingBeltMileage', configHint: config ? `Config : à ${config.courroieKm.toLocaleString()} km` : null },
    { label: 'Contrôle technique',    dateKey: 'nextControleTech', configHint: config ? `Config : tous les ${config.controlTechYears} ans` : null },
    { label: 'Fin de garantie',       dateKey: 'warrantyEnd',      configHint: config ? `Config : ${config.warrantyGeneral}` : null },
    { label: 'Date de revente prévue',dateKey: 'plannedSaleDate',  configHint: null },
  ]

  return (
    <div className="vehicle-dashboard card mb-4">
      {/* ── Header ── */}
      <div className="vehicle-dashboard-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginTop: 2 }}><ChevronLeft size={14} /></button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text1)' }}>
              {vehicle.make} {vehicle.model} {vehicle.year}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', marginTop: 3 }}>
              {displayPlate(vehicle.plate)}
              {vehicle.category && <span style={{ marginLeft: 10 }}>{vehicle.category}</span>}
              {vehicle.mileage ? <span style={{ marginLeft: 10 }}>{Number(vehicle.mileage).toLocaleString()} km</span> : null}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ padding: '4px 10px', borderRadius: 20, background: statusColor + '20', color: statusColor, fontSize: 12, fontWeight: 600 }}>
            {statusLabel}
          </span>
          {onEdit && (
            <button className="btn btn-ghost btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          )}
          {onDelete && (
            <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={onDelete}><Trash2 size={13} /></button>
          )}
        </div>
      </div>

      {/* ── 2×2 grid ── */}
      <div className="vehicle-dashboard-grid">

        {/* Haut gauche — LOCATIONS */}
        <div className="dashboard-tile" style={{ borderLeftColor: '#2563eb' }}>
          <div className="dashboard-tile-label" style={{ color: '#2563eb' }}>
            LOCATIONS
            <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{contracts.length}</span>
          </div>
          <div className="dashboard-tile-value">{totalDays}<span>jours loués</span></div>
          <div className="dashboard-tile-meta">
            <div className="dashboard-tile-meta-row">
              <span>Revenus total</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{totalRevenue.toLocaleString()} MAD</span>
            </div>
            <div className="dashboard-tile-meta-row">
              <span>Statut actuel</span>
              <span style={{ fontWeight: 600, color: activeContract ? '#16a34a' : 'var(--text3)' }}>
                {activeContract ? 'En cours' : 'Libre'}
              </span>
            </div>
          </div>
        </div>

        {/* Haut droit — RÉPARATIONS */}
        <div className="dashboard-tile" style={{ borderLeftColor: '#dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="dashboard-tile-label" style={{ color: '#dc2626', marginBottom: 0 }}>
              RÉPARATIONS
              <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{repairs.length}</span>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setShowRepairModal(true)}>
              <PlusCircle size={13} /> Ajouter
            </button>
          </div>
          <div className="dashboard-tile-value">{repairTotal.toLocaleString()}<span>MAD total</span></div>
          <div className="dashboard-tile-meta">
            {lastRepair ? (
              <div className="dashboard-tile-meta-row">
                <span>Dernière</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>
                  {lastRepair.type}<br />
                  <span style={{ fontWeight: 400, fontSize: 11 }}>
                    {(() => {
                      const d = new Date(lastRepair.date)
                      return !isNaN(d.getTime()) ? d.toLocaleDateString('fr-MA') : '—'
                    })()}
                  </span>
                </span>
              </div>
            ) : (
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Aucune intervention</div>
            )}
            {vehicle.nextRepair ? (
              <div className="dashboard-tile-meta-row">
                <span>Prochaine</span>
                <DeadlineBadge date={vehicle.nextRepair} />
              </div>
            ) : (
              <div className="dashboard-tile-meta-row" style={{ color: 'var(--text3)', fontSize: 12 }}>
                <span>Prochaine</span>
                <span>—</span>
              </div>
            )}
          </div>
        </div>

        {/* Bas gauche — AMORTISSEMENT */}
        <div className="dashboard-tile" style={{ borderLeftColor: '#16a34a' }}>
          <div className="dashboard-tile-label" style={{ color: '#16a34a' }}>
            AMORTISSEMENT
            <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
              {price > 0 ? `${amortPct.toFixed(0)}%` : '—'}
            </span>
          </div>
          {price > 0 ? (
            <>
              <div className="dashboard-tile-value">{Math.round(bookValue).toLocaleString()}<span>MAD actuel</span></div>
              <div className="dashboard-tile-meta">
                <div className="dashboard-tile-meta-row">
                  <span>Valeur initiale</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{price.toLocaleString()} MAD</span>
                </div>
                <div className="dashboard-tile-meta-row">
                  <span>Durée de vie</span>
                  <span>{lifespan} ans</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              Ajoutez le prix d'achat (bouton Modifier) pour activer.
            </div>
          )}
        </div>

        {/* Bas droit — ÉCHÉANCES */}
        <div className="dashboard-tile" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="dashboard-tile-label" style={{ color: '#f59e0b' }}>
            ÉCHÉANCES
            <span style={{ background: '#fffbeb', color: '#f59e0b', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
              {[ctDate, assurDate, nextOilKm].filter(Boolean).length}
            </span>
          </div>
          <div className="dashboard-tile-value">
            {nextOilKm ? (
              <>
                {Number(nextOilKm).toLocaleString()}<span>km vidange</span>
                {vehicle.mileage != null && (Number(nextOilKm) - Number(vehicle.mileage)) >= 0 && (Number(nextOilKm) - Number(vehicle.mileage)) <= 200 && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#fff7ed', color: '#c2410c', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>⚠️ &lt;200 km</span>
                )}
              </>
            ) : <span style={{ fontSize: 14, fontWeight: 500 }}>—</span>}
            {nextBeltKm ? (
              <>
                <br />{Number(nextBeltKm).toLocaleString()}<span>km courroie</span>
                {vehicle.mileage != null && (Number(nextBeltKm) - Number(vehicle.mileage)) >= 0 && (Number(nextBeltKm) - Number(vehicle.mileage)) <= 200 && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#fff7ed', color: '#c2410c', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>⚠️ &lt;200 km</span>
                )}
              </>
            ) : null}
          </div>
          <div className="dashboard-tile-meta">
            <div className="dashboard-tile-meta-row">
              <span>CT</span>
              {ctDate ? <DeadlineBadge date={ctDate} /> : <span style={{ color: 'var(--text3)' }}>—</span>}
            </div>
            <div className="dashboard-tile-meta-row">
              <span>Assurance</span>
              {assurDate ? <DeadlineBadge date={assurDate} /> : <span style={{ color: 'var(--text3)' }}>—</span>}
            </div>
            <div style={{ marginTop: 6 }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setShowDeadlineEdit(true)}
              >
                <Edit2 size={13} /> Modifier
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Repair add modal */}
      {showRepairModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowRepairModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, maxWidth: '92vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Ajouter une réparation</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRepairModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Libellé</label>
                <input className="form-input" value={repairDraft.label} placeholder="Ex: Vidange, Freins…"
                  onChange={e => setRepairDraft(p => ({ ...p, label: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={repairDraft.date}
                  onChange={e => setRepairDraft(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Montant (MAD)</label>
                <input className="form-input text-mono" type="number" value={repairDraft.cost} placeholder="0"
                  onChange={e => setRepairDraft(p => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!repairDraft.label} onClick={async () => {
                try {
                  await addRepair(vehicle.id, repairDraft)
                  setRepairs(await getRepairs(vehicle.id).catch(() => repairs))
                  setRepairDraft({ label: '', date: new Date().toISOString().split('T')[0], cost: '' })
                  setShowRepairModal(false)
                } catch (err) {
                  console.error('[VehicleDetail] addRepair', err)
                  alert('Erreur lors de l\'enregistrement de la réparation.')
                }
              }}>Enregistrer</button>
              <button className="btn btn-ghost" onClick={() => setShowRepairModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Échéances modal */}
      {showDeadlineEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowDeadlineEdit(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Modifier les échéances</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDeadlineEdit(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {deadlineFields.map(({ label, dateKey, mileageKey, configHint }) => (
                <div key={dateKey || mileageKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                    {label}
                    {configHint && <span style={{ fontSize: 11, color: '#a5b4fc', marginLeft: 4 }}>({configHint})</span>}
                  </label>
                  {dateKey && (
                    <input className="form-input" type="date" value={deadlineForm[dateKey] || ''}
                      onChange={e => setDeadlineForm(p => ({ ...p, [dateKey]: e.target.value }))} />
                  )}
                  {mileageKey && (
                    <input className="form-input text-mono" type="number" placeholder="Kilométrage cible"
                      value={deadlineForm[mileageKey] || ''}
                      onChange={e => setDeadlineForm(p => ({ ...p, [mileageKey]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => { saveDeadlines(); setShowDeadlineEdit(false) }}>Enregistrer</button>
              <button className="btn btn-ghost" onClick={() => setShowDeadlineEdit(false)}>Annuler</button>
              {deadlineSaved && <span className="badge badge-green">Enregistré ✓</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
