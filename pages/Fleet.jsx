import { useState, useEffect, lazy, Suspense } from 'react'
import { PlusCircle, Trash2, Edit2, AlertTriangle, Map, Radio } from 'lucide-react'
import { getFleet, saveVehicle, deleteVehicle, getFleetConfigForMake } from '../lib/db'

import { CAR_CATALOGUE, displayPlate } from './fleet/constants'
import VehicleDetail from './fleet/VehicleDetail'
import VehicleEditForm from './fleet/VehicleEditForm'

// Lazy-load FleetMap — keeps leaflet out of main bundle
const FleetMap = lazy(() => import('./FleetMap.jsx'))

const EMPTY = {
  make: '', model: '', year: new Date().getFullYear(),
  plate: '', category: 'Economy', dailyRate: 300,
  status: 'available', mileage: 0, color: '', fuelType: 'Essence',
  purchasePrice: '', purchaseDate: '', residualValue: '', lifespan: 5,
  trackedDevice: null,   // null = no GPS; string deviceId = tracked
}

// ── Auto-fill maintenance from Fleet_Config ───────────────
function autoFillMaintenance(form) {
  const config = getFleetConfigForMake(form.make)
  if (!config) return form

  const mileage = Number(form.mileage) || 0
  const purchaseDate = form.purchaseDate || (form.year ? `${form.year}-01-01` : null)

  const patch = {}

  if (!form.nextOilChangeMileage) {
    patch.nextOilChangeMileage = mileage + config.vidangeKm
  }

  if (!form.nextTimingBeltMileage) {
    patch.nextTimingBeltMileage = mileage + config.courroieKm
  }

  if (!form.warrantyEnd && purchaseDate && config.warrantyYears) {
    const d = new Date(purchaseDate)
    d.setFullYear(d.getFullYear() + config.warrantyYears)
    patch.warrantyEnd = d.toISOString().split('T')[0]
  }

  if (!form.nextControleTech && purchaseDate && config.controlTechYears) {
    const d = new Date(purchaseDate)
    d.setFullYear(d.getFullYear() + config.controlTechYears)
    patch.nextControleTech = d.toISOString().split('T')[0]
  }

  return { ...form, ...patch }
}

// ── Main component ────────────────────────────────────────
export default function Fleet() {
  const [fleet,        setFleet]       = useState([])
  const [loading,      setLoading]     = useState(true)
  const [editing,      setEditing]     = useState(null)
  const [detail,       setDetail]      = useState(null)  // vehicle being viewed
  const [form,         setForm]        = useState(EMPTY)
  const [configBanner, setConfigBanner] = useState(null)
  const [editingHadPurchaseDate, setEditingHadPurchaseDate] = useState(false)
  const [fleetView,    setFleetView]   = useState('grid')  // 'grid' | 'map'

  const refresh = async (currentDetail) => {
    try {
      const f = await getFleet()
      setFleet(f)
      const d = currentDetail !== undefined ? currentDetail : detail
      if (d) setDetail(f.find(v => v.id === d.id) || null)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const openAdd  = () => { setForm(EMPTY); setEditing('new'); setDetail(null); setConfigBanner(null); setEditingHadPurchaseDate(false) }
  const openEdit = (v) => {
    setConfigBanner(null)
    setEditingHadPurchaseDate(!!v.purchaseDate)
    const purchaseDate = v.purchaseDate || (v.year ? `${v.year}-01-01` : '')
    setForm({ ...EMPTY, ...v, purchaseDate })
    setEditing(v.id)
    setDetail(null)
  }
  const set      = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleMakeChange = (make) => {
    setForm(p => ({ ...p, make, model: CAR_CATALOGUE[make]?.[0] || '' }))
    if (editing === 'new') {
      const config = getFleetConfigForMake(make)
      setConfigBanner(config && make ? make : null)
    }
  }

  const save = async () => {
    if (!form.make || !form.model || !form.plate) return
    let toSave = { ...form, purchasePrice: Number(form.purchasePrice) || 0, residualValue: Number(form.residualValue) || 0 }
    if (editing === 'new') toSave = autoFillMaintenance(toSave)
    try {
      await saveVehicle(toSave)
      setEditing(null)
      setConfigBanner(null)
      await refresh()
    } catch (e) { console.error(e) }
  }

  const remove = async (id) => {
    if (confirm('Supprimer ce véhicule ?')) {
      try {
        await deleteVehicle(id)
        setDetail(null)
        await refresh(null)
      } catch (e) { console.error(e) }
    }
  }

  const saveDeadlines = async (updated) => {
    try {
      await saveVehicle(updated)
      await refresh()
    } catch (e) { console.error(e) }
  }

  if (loading) return <div className="page-body"><p style={{ color: 'var(--text3)' }}>Chargement…</p></div>

  // DTC alerts from vehicles flagged automatically by telematics
  const dtcAlerts = fleet.filter(v => v.dtcCodes?.length > 0 && v.status === 'maintenance')

  return (
    <div>
      <div className="page-header">
        <div><h2>Parc automobile</h2><p>Gérez votre flotte de véhicules</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View switcher */}
          {!detail && !editing && (
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 7, padding: 3, gap: 2 }}>
              <button
                onClick={() => setFleetView('grid')}
                style={{ padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: fleetView === 'grid' ? 'var(--accent)' : 'transparent',
                  color: fleetView === 'grid' ? '#fff' : 'var(--text3)' }}
              >Grille</button>
              <button
                onClick={() => setFleetView('map')}
                style={{ padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: fleetView === 'map' ? 'var(--accent)' : 'transparent',
                  color: fleetView === 'map' ? '#fff' : 'var(--text3)' }}
              ><Map size={12} />Carte GPS</button>
            </div>
          )}
          {!detail && !editing && (
            <button className="btn btn-primary" onClick={openAdd}><PlusCircle size={15} /> Ajouter</button>
          )}
        </div>
      </div>

      <div className="page-body">

        {/* DTC / Engine-light alerts banner */}
        {dtcAlerts.length > 0 && !detail && !editing && (
          <div style={{ background: '#3b1215', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#f87171', fontSize: 13 }}>
              <Radio size={14} />
              Alertes moteur détectées par télématique ({dtcAlerts.length} véhicule{dtcAlerts.length > 1 ? 's' : ''})
            </div>
            {dtcAlerts.map(v => (
              <div key={v.id} style={{ fontSize: 12, color: '#fca5a5', display: 'flex', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{v.make} {v.model} — {v.plate}</span>
                <span>Codes DTC: <b>{v.dtcCodes.join(', ')}</b></span>
                {v.dtcDetectedAt && <span style={{ color: '#9ca3af' }}>{new Date(v.dtcDetectedAt).toLocaleDateString('fr-MA')}</span>}
              </div>
            ))}
          </div>
        )}

        {/* GPS Map view */}
        {fleetView === 'map' && !editing && !detail && (
          <Suspense fallback={<p style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement de la carte…</p>}>
            <FleetMap height={560} />
          </Suspense>
        )}

        {/* Add / Edit form */}
        {fleetView === 'grid' && editing && (
          <VehicleEditForm
            form={form}
            set={set}
            isNew={editing === 'new'}
            configBanner={configBanner}
            editing={editing}
            editingHadPurchaseDate={editingHadPurchaseDate}
            onSave={save}
            onCancel={() => setEditing(null)}
            onMakeChange={handleMakeChange}
          />
        )}

        {/* Vehicle detail */}
        {detail && !editing && (
          <VehicleDetail
            vehicle={detail}
            onClose={() => setDetail(null)}
            onSave={saveDeadlines}
            onEdit={() => openEdit(detail)}
            onDelete={() => remove(detail.id)}
          />
        )}

        {/* Fleet grid */}
        {!detail && fleetView === 'grid' && !editing && (
          <div className="fleet-grid">
            {fleet.map(v => {
              const urgentCount = [v.nextOilChange, v.nextTimingBelt, v.nextControleTech, v.nextRepair, v.warrantyEnd]
                .filter(d => d && Math.ceil((new Date(d) - new Date()) / 86400000) <= 30).length

              const vConfig = getFleetConfigForMake(v.make)
              const currentKm = v.mileage || 0
              const targetOilKm = v.nextOilChangeMileage || (vConfig ? currentKm + vConfig.vidangeKm : null)
              const targetBeltKm = v.nextTimingBeltMileage || (vConfig ? currentKm + vConfig.courroieKm : null)

              return (
                <div key={v.id} className="vehicle-card" style={{ cursor: 'pointer' }}
                  onClick={() => { setDetail(v); setEditing(null) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="vehicle-plate" style={{ direction: 'rtl', fontSize: 13, letterSpacing: 2 }}>{displayPlate(v.plate)}</div>
                    {urgentCount > 0 && (
                      <span title={`${urgentCount} échéance(s) urgente(s)`} style={{ color: 'var(--orange)' }}>
                        <AlertTriangle size={14} />
                      </span>
                    )}
                  </div>
                  <div className="vehicle-name">{v.make} {v.model} {v.year}</div>
                  <div className="vehicle-meta">{v.category} · {v.color} · {v.fuelType}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div className="vehicle-meta">{v.mileage?.toLocaleString()} km</div>
                    {vConfig && (targetOilKm || targetBeltKm) && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {targetOilKm && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: currentKm > targetOilKm ? '#dc2626' : '#111827' }}>
                              🛢️ {Number(targetOilKm).toLocaleString()} km
                            </span>
                            <span style={{ fontSize: 10, color: '#2563eb' }}>{currentKm.toLocaleString()} km</span>
                          </div>
                        )}
                        {targetBeltKm && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: currentKm > targetBeltKm ? '#dc2626' : '#111827' }}>
                              ⚙️ {Number(targetBeltKm).toLocaleString()} km
                            </span>
                            <span style={{ fontSize: 10, color: '#2563eb' }}>{currentKm.toLocaleString()} km</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="vehicle-status">
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--accent)' }}>{v.dailyRate} MAD/j</span>
                    <span className={`badge ${v.status === 'available' ? 'badge-green' : v.status === 'rented' ? 'badge-orange' : 'badge-gray'}`}>{v.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openEdit(v) }}><Edit2 size={12} /></button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={e => { e.stopPropagation(); remove(v.id) }}><Trash2 size={12} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {fleet.length === 0 && (
          <p style={{ color: 'var(--text3)', textAlign: 'center', marginTop: 40 }}>Aucun véhicule. Ajoutez-en un ci-dessus.</p>
        )}
      </div>
    </div>
  )
}
