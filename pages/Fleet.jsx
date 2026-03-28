import { useState } from 'react'
import { PlusCircle, Trash2, Edit2, ChevronLeft, AlertTriangle, Clock, Wrench, TrendingDown, History } from 'lucide-react'
import { getFleet, saveVehicle, deleteVehicle, getContracts, getRepairs, saveRepair, deleteRepair, getFleetConfigForMake } from '../utils/storage'

// ── Car catalogue ─────────────────────────────────────────
const CAR_CATALOGUE = {
  'Dacia':         ['Logan', 'Sandero', 'Duster', 'Dokker', 'Lodgy', 'Spring'],
  'Renault':       ['Clio', 'Megane', 'Symbol', 'Kadjar', 'Captur', 'Koleos', 'Talisman', 'Scenic'],
  'Peugeot':       ['208', '301', '308', '2008', '3008', '5008', 'Partner', 'Expert'],
  'Citroën':       ['C3', 'C4', 'C5 Aircross', 'Berlingo', 'Jumpy'],
  'Volkswagen':    ['Polo', 'Golf', 'Passat', 'Tiguan', 'T-Roc', 'Touareg', 'Caddy', 'Transporter'],
  'Toyota':        ['Yaris', 'Corolla', 'Camry', 'C-HR', 'RAV4', 'Hilux', 'Land Cruiser', 'Prado'],
  'Hyundai':       ['i10', 'i20', 'i30', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Creta'],
  'Kia':           ['Picanto', 'Rio', 'Cerato', 'Sportage', 'Sorento', 'Stonic', 'Niro'],
  'Ford':          ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'EcoSport', 'Ranger', 'Transit'],
  'Fiat':          ['500', 'Punto', 'Tipo', 'Bravo', 'Doblo', 'Ducato'],
  'Seat':          ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco'],
  'Skoda':         ['Fabia', 'Octavia', 'Superb', 'Karoq', 'Kodiaq'],
  'Opel':          ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Grandland'],
  'Nissan':        ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Navara', 'Patrol'],
  'Mitsubishi':    ['Colt', 'Lancer', 'Outlander', 'Eclipse Cross', 'L200', 'Pajero'],
  'Suzuki':        ['Alto', 'Swift', 'Vitara', 'S-Cross', 'Jimny'],
  'Honda':         ['Jazz', 'Civic', 'Accord', 'CR-V', 'HR-V'],
  'Mazda':         ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-30'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'Classe E', 'Classe S', 'GLA', 'GLC', 'GLE', 'Sprinter', 'Vito'],
  'BMW':           ['Série 1', 'Série 3', 'Série 5', 'X1', 'X3', 'X5', 'X6'],
  'Audi':          ['A1', 'A3', 'A4', 'A6', 'Q2', 'Q3', 'Q5', 'Q7'],
  'Land Rover':    ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque'],
  'Jeep':          ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'],
  'Chevrolet':     ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Trax'],
  'Chery':         ['Tiggo 4', 'Tiggo 7', 'Arrizo 5'],
  'BYD':           ['Atto 3', 'Han', 'Tang', 'Seal'],
  'MG':            ['MG3', 'MG5', 'MG6', 'ZS', 'HS', 'EHS'],
}
const MAKES = Object.keys(CAR_CATALOGUE).sort()
const YEARS = Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i)
const AR_LETTERS = ['أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي']

function parsePlate(plate = '') {
  const parts = plate.split('|')
  return { serial: parts[0] || '', letter: parts[1] || 'أ', region: parts[2] || '01' }
}
function buildPlate(s, l, r) { return `${s}|${l}|${r}` }
function displayPlate(plate = '') {
  const { serial, letter, region } = parsePlate(plate)
  if (!serial) return plate
  return `${region} ${letter} ${serial}`
}

// ── Plate input ───────────────────────────────────────────
function PlateInput({ value, onChange }) {
  const { serial, letter, region } = parsePlate(value)
  const set = (s, l, r) => onChange(buildPlate(s, l, r))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input className="form-input text-mono" style={{ width: 90, textAlign: 'center', letterSpacing: 2 }}
        placeholder="12345" maxLength={5} value={serial}
        onChange={e => set(e.target.value.replace(/\D/g, ''), letter, region)} />
      <span style={{ color: 'var(--text3)', fontSize: 16, fontWeight: 700 }}>|</span>
      <select className="form-select text-mono" style={{ width: 64, textAlign: 'center', fontSize: 16, direction: 'rtl' }}
        value={letter} onChange={e => set(serial, e.target.value, region)}>
        {AR_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <span style={{ color: 'var(--text3)', fontSize: 16, fontWeight: 700 }}>|</span>
      <input className="form-input text-mono" style={{ width: 60, textAlign: 'center', letterSpacing: 2 }}
        placeholder="01" maxLength={2} value={region}
        onChange={e => set(serial, letter, e.target.value.replace(/\D/g, ''))} />
      {serial && (
        <div style={{ marginLeft: 8, padding: '4px 12px', background: '#1c1a16', color: '#fff', borderRadius: 4, fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: 2, direction: 'rtl' }}>
          {region} {letter} {serial}
        </div>
      )}
    </div>
  )
}

// ── Deadline badge ────────────────────────────────────────
function DeadlineBadge({ date }) {
  if (!date) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
  const days = Math.ceil((new Date(date) - new Date()) / 86400000)
  if (days < 0)  return <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>En retard de {Math.abs(days)} j</span>
  if (days <= 30) return <span style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12 }}>Dans {days} j</span>
  return <span style={{ color: 'var(--green)', fontSize: 12 }}>Dans {days} j ({new Date(date).toLocaleDateString('fr-MA')})</span>
}

// ── Amortissement ─────────────────────────────────────────
function AmortissementTab({ vehicle, contracts }) {
  const price    = Number(vehicle.purchasePrice) || 0
  const lifespan = Number(vehicle.lifespan)  || 5
  const residual = Number(vehicle.residualValue) || 0

  // Use purchaseDate if set, otherwise estimate from vehicle year (Jan 1)
  const boughtDate = vehicle.purchaseDate
    ? vehicle.purchaseDate
    : vehicle.year ? `${vehicle.year}-01-01` : null
  const bought = boughtDate ? new Date(boughtDate) : null

  const yearsElapsed = bought ? (Date.now() - bought.getTime()) / (365.25 * 24 * 3600 * 1000) : 0
  const depreciable  = Math.max(0, price - residual)
  const residualWarning = residual > price
  const bookValue    = Math.max(residual, price - (depreciable / lifespan) * yearsElapsed)
  const pct          = price > 0 ? Math.min(100, (yearsElapsed / lifespan) * 100) : 0

  const vehicleContracts = contracts.filter(c => c.vehicleId === vehicle.id)
  const revenue = vehicleContracts.reduce((s, c) => s + (c.totalTTC || 0), 0)
  const repairCosts = getRepairs(vehicle.id).reduce((s, r) => s + (r.cost || 0), 0)
  const roi   = price > 0 ? ((revenue - repairCosts) / price * 100).toFixed(1) : 0
  const toRecover = Math.max(0, price - revenue + repairCosts)

  if (!price) return (
    <div className="alert alert-info" style={{ fontSize: 13 }}>
      Ajoutez le <strong>prix d'achat</strong> dans la fiche véhicule (bouton Modifier) pour activer l'amortissement.
    </div>
  )

  const usingEstimatedDate = !vehicle.purchaseDate && vehicle.year

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {residualWarning && (
        <div style={{ fontSize: 12, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          ⚠️ La valeur résiduelle dépasse le prix d'achat — vérifiez les données.
        </div>
      )}
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          <span>Amortissement linéaire sur {lifespan} ans</span>
          <span>{pct.toFixed(1)}% amorti</span>
        </div>
        <div style={{ height: 10, background: 'var(--bg2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 10, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Prix d\'achat',     value: `${price.toLocaleString()} MAD`,          color: 'var(--text1)' },
          { label: 'Valeur actuelle',   value: `${Math.round(bookValue).toLocaleString()} MAD`, color: 'var(--accent)' },
          { label: 'Valeur résiduelle', value: `${residual.toLocaleString()} MAD`,        color: 'var(--text3)' },
          { label: 'CA généré',         value: `${revenue.toLocaleString()} MAD`,         color: 'var(--green)' },
          { label: 'Coûts réparations', value: `${repairCosts.toLocaleString()} MAD`,     color: '#dc2626' },
          { label: 'ROI net',           value: `${roi}%`,                                 color: +roi >= 0 ? 'var(--green)' : '#dc2626' },
          { label: 'Reste à récupérer', value: `${toRecover.toLocaleString()} MAD`,       color: toRecover > 0 ? 'var(--orange)' : 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color }}>{value}</div>
          </div>
        ))}
      </div>

      {bought && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {usingEstimatedDate
            ? <span style={{ color: 'var(--orange)' }}>⚠️ Date estimée au 01/01/{vehicle.year} (ajoutez la date d'achat réelle pour plus de précision) · </span>
            : `Acheté le ${bought.toLocaleDateString('fr-MA')} · `
          }
          {yearsElapsed.toFixed(1)} an(s) de possession
          {pct >= 100 && <span style={{ color: 'var(--green)', fontWeight: 600 }}> · Totalement amorti</span>}
        </div>
      )}
    </div>
  )
}

// ── Deadlines tab ─────────────────────────────────────────
function computeDeadlinesFromConfig(vehicle) {
  const config   = getFleetConfigForMake(vehicle.make)
  const mileage  = Number(vehicle.mileage) || 0
  const purchase = vehicle.purchaseDate || (vehicle.year ? `${vehicle.year}-01-01` : null)

  const addYears = (dateStr, n) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + n)
    return d.toISOString().split('T')[0]
  }

  return {
    // mileage-based (stored as km targets, not dates)
    nextOilChangeMileage:  vehicle.nextOilChangeMileage  || (mileage + 5000),
    nextTimingBeltMileage: vehicle.nextTimingBeltMileage || (config ? mileage + config.courroieKm : ''),
    // date-based — use vehicle value if set, otherwise compute from config
    warrantyEnd:    vehicle.warrantyEnd    || (config && purchase ? addYears(purchase, config.warrantyYears)        : ''),
    nextControleTech: vehicle.nextControleTech || (config && purchase ? addYears(purchase, config.controlTechYears) : ''),
    nextOilChange:  vehicle.nextOilChange  || '',
    nextTimingBelt: vehicle.nextTimingBelt || '',
    nextRepair:     vehicle.nextRepair     || '',
    plannedSaleDate: vehicle.plannedSaleDate || '',
  }
}

function DeadlinesTab({ vehicle, onSave }) {
  const config = getFleetConfigForMake(vehicle.make)

  const [form, setForm] = useState(() => computeDeadlinesFromConfig(vehicle))
  const [saved, setSaved] = useState(false)

  const save = () => {
    onSave({ ...vehicle, ...form, nextControleTech: form.nextControleTech })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const recalc = () => {
    setForm(computeDeadlinesFromConfig({ ...vehicle, nextOilChangeMileage: '', nextTimingBeltMileage: '', warrantyEnd: '', nextControleTech: '' }))
  }

  const deadlines = [
    { label: 'Prochaine vidange',        dateKey: 'nextOilChange',   mileageKey: 'nextOilChangeMileage',  icon: '🛢️', configHint: config ? `Config : tous les ${config.vidangeKm.toLocaleString()} km` : null },
    { label: 'Changement courroie',       dateKey: 'nextTimingBelt',  mileageKey: 'nextTimingBeltMileage', icon: '⚙️', configHint: config ? `Config : à ${config.courroieKm.toLocaleString()} km` : null },
    { label: 'Contrôle technique',        dateKey: 'nextControleTech', icon: '📋', configHint: config ? `Config : tous les ${config.controlTechYears} ans` : null },
    { label: 'Prochaine réparation',      dateKey: 'nextRepair',      icon: '🔧', configHint: null },
    { label: 'Fin de garantie',           dateKey: 'warrantyEnd',     icon: '🛡️', configHint: config ? `Config : ${config.warrantyGeneral}` : null },
    { label: 'Date de revente prévue',    dateKey: 'plannedSaleDate', icon: '💰', configHint: null },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Config banner */}
      {config && (
        <div style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px' }}>
          ⚙️ Données calculées selon la <strong>Fleet_Config — {vehicle.make}</strong> : garantie {config.warrantyGeneral} · CT tous les {config.controlTechYears} ans · vidange tous les {config.vidangeKm.toLocaleString()} km · courroie à {config.courroieKm.toLocaleString()} km
        </div>
      )}

      {/* Status overview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {deadlines.map(({ label, dateKey, mileageKey, icon, configHint }) => {
          const date = form[dateKey]
          const days = date ? Math.ceil((new Date(date) - new Date()) / 86400000) : null
          const urgent = days !== null && days <= 30
          const overdue = days !== null && days < 0
          const isComputed = !vehicle[dateKey] && !!form[dateKey]
          return (
            <div key={dateKey} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 8,
              background: overdue ? '#fef2f2' : urgent ? '#fff7ed' : 'var(--bg2)',
              border: `1px solid ${overdue ? '#fecaca' : urgent ? '#fed7aa' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {label}
                  {isComputed && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 6, fontWeight: 400 }}>calculé</span>}
                </div>
                {mileageKey && form[mileageKey] && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>à {Number(form[mileageKey]).toLocaleString()} km</div>
                )}
                {configHint && (
                  <div style={{ fontSize: 10, color: '#a5b4fc' }}>{configHint}</div>
                )}
              </div>
              <DeadlineBadge date={date} />
            </div>
          )
        })}
      </div>

      {/* Edit form */}
      <div className="card">
        <div className="card-header">
          <h3>Modifier les échéances</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {config && (
              <button className="btn btn-ghost btn-sm" onClick={recalc} title="Recalculer depuis la Fleet_Config">
                ↺ Recalculer
              </button>
            )}
            {saved && <span className="badge badge-green">Enregistré</span>}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {deadlines.map(({ label, dateKey, mileageKey, configHint }) => (
              <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label">
                  {label}
                  {configHint && <span style={{ fontSize: 10, color: '#a5b4fc', marginLeft: 4 }}>({configHint})</span>}
                </label>
                <input className="form-input" type="date" value={form[dateKey] || ''}
                  onChange={e => setForm(p => ({ ...p, [dateKey]: e.target.value }))} />
                {mileageKey && (
                  <input className="form-input text-mono" type="number" placeholder="Kilométrage"
                    value={form[mileageKey] || ''}
                    onChange={e => setForm(p => ({ ...p, [mileageKey]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={save}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ── Repairs tab ───────────────────────────────────────────
const REPAIR_TYPES = ['Vidange', 'Courroie de distribution', 'Freins', 'Pneus', 'Batterie', 'Embrayage', 'Suspension', 'Climatisation', 'Électronique', 'Carrosserie', 'Révision générale', 'Autre']
const EMPTY_REPAIR = { date: new Date().toISOString().split('T')[0], type: 'Vidange', description: '', cost: '', garage: '', mileage: '' }

function RepairsTab({ vehicle }) {
  const [repairs, setRepairs] = useState(() => getRepairs(vehicle.id))
  const [form, setForm] = useState(null)

  const refresh = () => setRepairs(getRepairs(vehicle.id))

  const save = () => {
    saveRepair({ ...form, vehicleId: vehicle.id, cost: Number(form.cost), mileage: Number(form.mileage) })
    setForm(null)
    refresh()
  }

  const remove = (id) => {
    if (confirm('Supprimer cette réparation ?')) { deleteRepair(id); refresh() }
  }

  const total = repairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {repairs.length} intervention{repairs.length !== 1 ? 's' : ''} · <strong style={{ color: '#dc2626' }}>{total.toLocaleString()} MAD</strong> total
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY_REPAIR })}>
          <PlusCircle size={13} /> Ajouter
        </button>
      </div>

      {form && (
        <div className="card">
          <div className="card-header"><h3>{form.id ? 'Modifier' : 'Nouvelle intervention'}</h3></div>
          <div className="card-body">
            <div className="form-row cols-3">
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {REPAIR_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Coût (MAD) *</label>
                <input className="form-input text-mono" type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">Garage / Prestataire</label>
                <input className="form-input" value={form.garage} placeholder="Nom du garage…" onChange={e => setForm(p => ({ ...p, garage: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Kilométrage</label>
                <input className="form-input text-mono" type="number" value={form.mileage} onChange={e => setForm(p => ({ ...p, mileage: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description / Remarques</label>
              <input className="form-input" value={form.description} placeholder="Détails de l'intervention…" onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save} disabled={!form.date || !form.cost}>Enregistrer</button>
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {repairs.length === 0 && !form && (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune intervention enregistrée.</p>
      )}

      {repairs.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, background: '#fef2f2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>🔧</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.type}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: '#dc2626' }}>{(r.cost || 0).toLocaleString()} MAD</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {new Date(r.date).toLocaleDateString('fr-MA')}
              {r.garage && ` · ${r.garage}`}
              {r.mileage ? ` · ${Number(r.mileage).toLocaleString()} km` : ''}
            </div>
            {r.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{r.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(r)}><Edit2 size={12} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(r.id)}><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Rental history tab ────────────────────────────────────
function RentalsTab({ vehicle }) {
  const [contracts] = useState(() => getContracts().filter(c => c.vehicleId === vehicle.id))
  const total     = contracts.reduce((s, c) => s + (c.totalTTC || 0), 0)
  const days      = contracts.reduce((s, c) => s + (c.days || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { label: 'Locations',   value: contracts.length },
          { label: 'Jours loués', value: days },
          { label: 'CA total',    value: `${total.toLocaleString()} MAD` },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ flex: 1, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {contracts.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune location pour ce véhicule.</p>}

      {contracts.map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{c.contractNumber}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
              {c.clientName} · {c.startDate} → {c.endDate} ({c.days} j)
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--accent)' }}>{(c.totalTTC || 0).toLocaleString()} MAD</div>
            <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{c.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Vehicle detail panel ──────────────────────────────────
const TABS = [
  { id: 'rentals',    label: 'Locations',      icon: History },
  { id: 'repairs',    label: 'Réparations',     icon: Wrench },
  { id: 'amort',      label: 'Amortissement',   icon: TrendingDown },
  { id: 'deadlines',  label: 'Échéances',       icon: Clock },
]

function VehicleDetail({ vehicle, onClose, onSave }) {
  const [tab, setTab] = useState('rentals')
  const contracts = getContracts()

  const urgentDeadlines = [
    vehicle.nextOilChange, vehicle.nextTimingBelt, vehicle.nextControleTech,
    vehicle.nextRepair, vehicle.warrantyEnd,
  ].filter(d => d && Math.ceil((new Date(d) - new Date()) / 86400000) <= 30).length

  return (
    <div className="card mb-4">
      <div className="card-header" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><ChevronLeft size={14} /></button>
          <div>
            <div style={{ fontWeight: 700 }}>{vehicle.make} {vehicle.model} {vehicle.year}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono, monospace' }}>{displayPlate(vehicle.plate)}</div>
          </div>
        </div>
        {urgentDeadlines > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--orange)', fontSize: 12, fontWeight: 600 }}>
            <AlertTriangle size={14} /> {urgentDeadlines} échéance{urgentDeadlines > 1 ? 's' : ''} urgente{urgentDeadlines > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 18px' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 14px', border: 'none', background: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: tab === id ? 600 : 400,
            color: tab === id ? 'var(--accent)' : 'var(--text3)',
            borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -1,
          }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      <div className="card-body">
        {tab === 'rentals'   && <RentalsTab vehicle={vehicle} />}
        {tab === 'repairs'   && <RepairsTab vehicle={vehicle} />}
        {tab === 'amort'     && <AmortissementTab vehicle={vehicle} contracts={contracts} />}
        {tab === 'deadlines' && <DeadlinesTab vehicle={vehicle} onSave={v => { onSave(v); }} />}
      </div>
    </div>
  )
}

// ── Vehicle form ──────────────────────────────────────────
const EMPTY = {
  make: '', model: '', year: new Date().getFullYear(),
  plate: '', category: 'Economy', dailyRate: 300,
  status: 'available', mileage: 0, color: '', fuelType: 'Essence',
  purchasePrice: '', purchaseDate: '', residualValue: '', lifespan: 5,
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
  const [fleet,        setFleet]       = useState(getFleet)
  const [editing,      setEditing]     = useState(null)
  const [detail,       setDetail]      = useState(null)  // vehicle being viewed
  const [form,         setForm]        = useState(EMPTY)
  const [configBanner, setConfigBanner] = useState(null)
  const [editingHadPurchaseDate, setEditingHadPurchaseDate] = useState(false)

  const refresh  = () => { const f = getFleet(); setFleet(f); if (detail) setDetail(f.find(v => v.id === detail.id) || null) }
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

  const save = () => {
    if (!form.make || !form.model || !form.plate) return
    let toSave = { ...form, purchasePrice: Number(form.purchasePrice) || 0, residualValue: Number(form.residualValue) || 0 }
    if (editing === 'new') toSave = autoFillMaintenance(toSave)
    saveVehicle(toSave)
    setEditing(null)
    setConfigBanner(null)
    refresh()
  }

  const remove = (id) => {
    if (confirm('Supprimer ce véhicule ?')) { deleteVehicle(id); setDetail(null); refresh() }
  }

  const saveDeadlines = (updated) => {
    saveVehicle(updated)
    refresh()
  }

  const models = CAR_CATALOGUE[form.make] || []

  return (
    <div>
      <div className="page-header">
        <div><h2>Parc automobile</h2><p>Gérez votre flotte de véhicules</p></div>
        <button className="btn btn-primary" onClick={openAdd}><PlusCircle size={15} /> Ajouter</button>
      </div>

      <div className="page-body">

        {/* Add / Edit form */}
        {editing && (
          <div className="card mb-4">
            <div className="card-header"><h3>{editing === 'new' ? 'Nouveau véhicule' : 'Modifier le véhicule'}</h3></div>
            <div className="card-body">
              <div className="form-row cols-3">
                <div className="form-group">
                  <label className="form-label">Marque *</label>
                  <select className="form-select" value={form.make} onChange={e => handleMakeChange(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Modèle *</label>
                  <select className="form-select" value={form.model} onChange={e => set('model', e.target.value)} disabled={!form.make}>
                    <option value="">— Choisir —</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Année</label>
                  <select className="form-select" value={form.year} onChange={e => set('year', +e.target.value)}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {editing === 'new' && configBanner && (
                <div style={{ margin: '4px 0 10px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                  ⚙️ Données de maintenance pré-remplies selon la Fleet_Config pour <strong>{configBanner}</strong>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Immatriculation * <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>— Format marocain</span></label>
                <PlateInput value={form.plate} onChange={v => set('plate', v)} />
              </div>

              <div className="form-row cols-3">
                <div className="form-group">
                  <label className="form-label">Couleur</label>
                  <input className="form-input" value={form.color} onChange={e => set('color', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kilométrage</label>
                  <input className="form-input text-mono" type="number" value={form.mileage} onChange={e => set('mileage', +e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Carburant</label>
                  <select className="form-select" value={form.fuelType} onChange={e => set('fuelType', e.target.value)}>
                    {['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row cols-3">
                <div className="form-group">
                  <label className="form-label">Catégorie</label>
                  <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                    {['Economy', 'Sedan', 'SUV', 'Luxury', 'Van', 'Pickup'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tarif journalier (MAD)</label>
                  <input className="form-input text-mono" type="number" value={form.dailyRate} onChange={e => set('dailyRate', +e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                    {['available', 'rented', 'maintenance'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Max km per day */}
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="maxKmEnabled"
                    checked={!!form.maxKmEnabled}
                    onChange={e => set('maxKmEnabled', e.target.checked)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  <label htmlFor="maxKmEnabled" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none', color: 'var(--text2)' }}>
                    Activer une limite kilométrique par jour pour ce véhicule
                  </label>
                </div>
                {form.maxKmEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, marginLeft: 25 }}>
                    <input
                      className="form-input text-mono"
                      type="number"
                      min={1}
                      placeholder="Ex: 300"
                      value={form.maxKmPerDay || ''}
                      onChange={e => set('maxKmPerDay', Number(e.target.value))}
                      style={{ width: 110 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>km/jour max</span>
                  </div>
                )}
              </div>

              {/* Investment section */}
              <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Investissement & amortissement</div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Prix d'achat (MAD)</label>
                    <input className="form-input text-mono" type="number" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} placeholder="Ex: 120000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date d'achat</label>
                    <input className="form-input" type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
                    {form.purchaseDate && form.purchaseDate.endsWith('-01-01') && !editingHadPurchaseDate && (
                      <div style={{ fontSize: 11, color: '#c2410c', marginTop: 3 }}>
                        ⚠️ Date estimée au 01/01 — vérifiez et corrigez si nécessaire.
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Valeur résiduelle (MAD)</label>
                    <input className="form-input text-mono" type="number" value={form.residualValue} onChange={e => set('residualValue', e.target.value)} placeholder="Ex: 20000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Durée d'amortissement (ans)</label>
                    <select className="form-select" value={form.lifespan} onChange={e => set('lifespan', +e.target.value)}>
                      {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} ans</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={save} disabled={!form.make || !form.model || !form.plate}>Enregistrer</button>
                <button className="btn btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* Vehicle detail */}
        {detail && !editing && (
          <VehicleDetail
            vehicle={detail}
            onClose={() => setDetail(null)}
            onSave={saveDeadlines}
          />
        )}

        {/* Fleet grid */}
        {!detail && (
          <div className="fleet-grid">
            {fleet.map(v => {
              const urgentCount = [v.nextOilChange, v.nextTimingBelt, v.nextControleTech, v.nextRepair, v.warrantyEnd]
                .filter(d => d && Math.ceil((new Date(d) - new Date()) / 86400000) <= 30).length

              return (
                <div key={v.id} className="vehicle-card">
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
                  <div className="vehicle-meta">{v.mileage?.toLocaleString()} km</div>
                  <div className="vehicle-status">
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--accent)' }}>{v.dailyRate} MAD/j</span>
                    <span className={`badge ${v.status === 'available' ? 'badge-green' : v.status === 'rented' ? 'badge-orange' : 'badge-gray'}`}>{v.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setDetail(v); setEditing(null) }}>
                      <History size={12} /> Historique
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}><Edit2 size={12} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(v.id)}><Trash2 size={12} /></button>
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
