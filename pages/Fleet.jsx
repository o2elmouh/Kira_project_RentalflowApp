import { useState, useEffect } from 'react'
import { PlusCircle, Trash2, Edit2, ChevronLeft, AlertTriangle, Clock, Wrench, TrendingDown, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getFleet, saveVehicle, deleteVehicle, getContracts, getRepairs, saveRepair, deleteRepair, getFleetConfigForMake } from '../lib/db'

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
function AmortissementTab({ vehicle, contracts, repairs: repairsProp }) {
  const { t } = useTranslation('fleet')
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
  const repairCosts = (repairsProp || []).reduce((s, r) => s + (r.cost || 0), 0)
  const roi   = price > 0 ? ((revenue - repairCosts) / price * 100).toFixed(1) : 0
  const toRecover = Math.max(0, price - revenue + repairCosts)

  if (!price) return (
    <div className="alert alert-info" style={{ fontSize: 13 }}>
      {t('detail.tiles.noPrice')}
    </div>
  )

  const usingEstimatedDate = !vehicle.purchaseDate && vehicle.year

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {residualWarning && (
        <div style={{ fontSize: 12, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          {t('amortissement.residualWarning')}
        </div>
      )}
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          <span>{t('detail.tiles.amortissement')} · {t('detail.tiles.lifespanValue', { n: lifespan })}</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--bg2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 10, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: t('form.purchasePrice'),        value: `${price.toLocaleString()} MAD`,          color: 'var(--text1)' },
          { label: t('detail.tiles.currentValue'), value: `${Math.round(bookValue).toLocaleString()} MAD`, color: 'var(--accent)' },
          { label: t('form.residualValue'),        value: `${residual.toLocaleString()} MAD`,        color: 'var(--text3)' },
          { label: t('rentals.totalRevenue'),      value: `${revenue.toLocaleString()} MAD`,         color: 'var(--green)' },
          { label: t('detail.tiles.repairs'),      value: `${repairCosts.toLocaleString()} MAD`,     color: '#dc2626' },
          { label: t('amortissement.roi'),                      value: `${roi}%`,                                 color: +roi >= 0 ? 'var(--green)' : '#dc2626' },
          { label: t('amortissement.toRecover'),            value: `${toRecover.toLocaleString()} MAD`,       color: toRecover > 0 ? 'var(--orange)' : 'var(--green)' },
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
            ? <span style={{ color: 'var(--orange)' }}>{t('amortissement.estimatedDate', { year: vehicle.year })} </span>
            : t('amortissement.boughtOn', { date: bought.toLocaleDateString('fr-MA') })
          }
          {t('amortissement.yearsOwned', { n: yearsElapsed.toFixed(1) })}
          {pct >= 100 && <span style={{ color: 'var(--green)', fontWeight: 600 }}> · {t('amortissement.fullyAmortised')}</span>}
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
  const { t } = useTranslation('fleet')
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
    { label: t('detail.modal.oilChange'),     dateKey: 'nextOilChange',   mileageKey: 'nextOilChangeMileage',  icon: '🛢️', configHint: config ? t('detail.modal.configHintKm', { km: config.vidangeKm.toLocaleString() }) : null },
    { label: t('detail.modal.timingBelt'),    dateKey: 'nextTimingBelt',  mileageKey: 'nextTimingBeltMileage', icon: '⚙️', configHint: config ? t('detail.modal.configHintAtKm', { km: config.courroieKm.toLocaleString() }) : null },
    { label: t('detail.modal.controleTech'),  dateKey: 'nextControleTech', icon: '📋', configHint: config ? t('detail.modal.configHintYears', { years: config.controlTechYears }) : null },
    { label: t('detail.modal.nextRepair'),    dateKey: 'nextRepair',      icon: '🔧', configHint: null },
    { label: t('detail.modal.warrantyEnd'),   dateKey: 'warrantyEnd',     icon: '🛡️', configHint: config ? `Config : ${config.warrantyGeneral}` : null },
    { label: t('detail.modal.plannedSale'),   dateKey: 'plannedSaleDate', icon: '💰', configHint: null },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Config banner */}
      {config && (
        <div style={{ fontSize: 12, color: '#6366f1', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px' }}>
          {t('echeances.configBanner', { make: vehicle.make, warranty: config.warrantyGeneral, ct: config.controlTechYears, vidange: config.vidangeKm.toLocaleString(), courroie: config.courroieKm.toLocaleString() })}
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
                  {isComputed && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 6, fontWeight: 400 }}>{t('echeances.computed')}</span>}
                </div>
                {mileageKey && form[mileageKey] && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t('echeances.atKm', { km: Number(form[mileageKey]).toLocaleString() })}</div>
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
          <h3>{t('detail.modal.title')}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {config && (
              <button className="btn btn-ghost btn-sm" onClick={recalc} title={t('echeances.recalcTitle')}>
                {t('echeances.recalcBtn')}
              </button>
            )}
            {saved && <span className="badge badge-green">{t('saved')}</span>}
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
                  <input className="form-input text-mono" type="number" placeholder={t('detail.modal.mileagePlaceholder')}
                    value={form[mileageKey] || ''}
                    onChange={e => setForm(p => ({ ...p, [mileageKey]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={save}>{t('repairs.addBtn')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Repairs tab ───────────────────────────────────────────
const REPAIR_TYPES = ['Vidange', 'Courroie de distribution', 'Freins', 'Pneus', 'Batterie', 'Embrayage', 'Suspension', 'Climatisation', 'Électronique', 'Carrosserie', 'Révision générale', 'Autre']
const EMPTY_REPAIR = { date: new Date().toISOString().split('T')[0], type: 'Vidange', description: '', cost: '', garage: '', mileage: '' }

function RepairsTab({ vehicle }) {
  const { t } = useTranslation('fleet')
  const [repairs, setRepairs] = useState([])
  const [form, setForm] = useState(null)

  const refresh = async () => {
    try { setRepairs(await getRepairs(vehicle.id)) } catch (e) { console.error(e) }
  }

  useEffect(() => { refresh() }, [vehicle.id])  // refresh() has its own internal cancel guard

  const save = async () => {
    try {
      await saveRepair({ ...form, vehicleId: vehicle.id, cost: Number(form.cost), mileage: Number(form.mileage) })
      setForm(null)
      await refresh()
    } catch (e) { console.error(e) }
  }

  const remove = async (id) => {
    if (confirm(t('repairs.deleteConfirm'))) {
      try { await deleteRepair(id); await refresh() } catch (e) { console.error(e) }
    }
  }

  const total = repairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {t('repairs.count', { count: repairs.length })} · <strong style={{ color: '#dc2626' }}>{t('repairs.totalCost', { total: total.toLocaleString() })}</strong>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY_REPAIR })}>
          <PlusCircle size={13} /> {t('repairs.addBtn')}
        </button>
      </div>

      {form && (
        <div className="card">
          <div className="card-header"><h3>{form.id ? t('repairs.titleEdit') : t('repairs.titleNew')}</h3></div>
          <div className="card-body">
            <div className="form-row cols-3">
              <div className="form-group">
                <label className="form-label">{t('repairs.date')}</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.type')}</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {Object.keys(t('repairs.types', { returnObjects: true })).map(k => <option key={k} value={k}>{t(`repairs.types.${k}`)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.cost')}</label>
                <input className="form-input text-mono" type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label className="form-label">{t('repairs.garage')}</label>
                <input className="form-input" value={form.garage} placeholder={t('repairs.garagePlaceholder')} onChange={e => setForm(p => ({ ...p, garage: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('repairs.kmLabel')}</label>
                <input className="form-input text-mono" type="number" value={form.mileage} onChange={e => setForm(p => ({ ...p, mileage: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('repairs.description')}</label>
              <input className="form-input" value={form.description} placeholder={t('repairs.descriptionPlaceholder')} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save} disabled={!form.date || !form.cost}>{t('form.save')}</button>
              <button className="btn btn-ghost" onClick={() => setForm(null)}>{t('form.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {repairs.length === 0 && !form && (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('repairs.empty')}</p>
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
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    let cancelled = false
    getContracts()
      .then(all => { if (!cancelled) setContracts(all.filter(c => c.vehicleId === vehicle.id)) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [vehicle.id])

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

// ── Vehicle dashboard (Kanban Tiles 2x2) ─────────────────
function VehicleDetail({ vehicle, onClose, onSave, onEdit, onDelete }) {
  const [showDeadlineEdit, setShowDeadlineEdit] = useState(false)
  const [deadlineForm, setDeadlineForm] = useState(() => computeDeadlinesFromConfig(vehicle))
  const [deadlineSaved, setDeadlineSaved] = useState(false)
  const [contracts, setContracts] = useState([])
  const [repairs, setRepairs] = useState([])

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
  const boughtDate = vehicle.purchaseDate || (vehicle.year ? `${vehicle.year}-01-01` : null)
  const bought = boughtDate ? new Date(boughtDate) : null
  const yearsElapsed = bought ? (Date.now() - bought.getTime()) / (365.25 * 24 * 3600 * 1000) : 0
  const depreciable = Math.max(0, price - residual)
  const bookValue = price > 0 ? Math.max(residual, price - (depreciable / lifespan) * yearsElapsed) : 0
  const amortPct = price > 0 ? Math.min(100, (yearsElapsed / lifespan) * 100) : 0

  // Deadlines metrics
  const nextOilKm = vehicle.nextOilChangeMileage || ''
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
    { label: 'Prochaine vidange',     dateKey: 'nextOilChange',    mileageKey: 'nextOilChangeMileage',  configHint: config ? `Config : tous les ${config.vidangeKm.toLocaleString()} km` : null },
    { label: 'Changement courroie',   dateKey: 'nextTimingBelt',   mileageKey: 'nextTimingBeltMileage', configHint: config ? `Config : à ${config.courroieKm.toLocaleString()} km` : null },
    { label: 'Contrôle technique',    dateKey: 'nextControleTech', configHint: config ? `Config : tous les ${config.controlTechYears} ans` : null },
    { label: 'Prochaine réparation',  dateKey: 'nextRepair',       configHint: null },
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
          <div className="dashboard-tile-label" style={{ color: '#dc2626' }}>
            RÉPARATIONS
            <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{repairs.length}</span>
          </div>
          <div className="dashboard-tile-value">{repairTotal.toLocaleString()}<span>MAD total</span></div>
          <div className="dashboard-tile-meta">
            {lastRepair ? (
              <div className="dashboard-tile-meta-row">
                <span>Dernière</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>
                  {lastRepair.type}<br />
                  <span style={{ fontWeight: 400, fontSize: 11 }}>{new Date(lastRepair.date).toLocaleDateString('fr-MA')}</span>
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
            {nextOilKm ? <>{Number(nextOilKm).toLocaleString()}<span>km vidange</span></> : <span style={{ fontSize: 14, fontWeight: 500 }}>—</span>}
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
                Modifier
              </button>
            </div>
          </div>
        </div>

      </div>

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
                <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                    {label}
                    {configHint && <span style={{ fontSize: 11, color: '#a5b4fc', marginLeft: 4 }}>({configHint})</span>}
                  </label>
                  <input className="form-input" type="date" value={deadlineForm[dateKey] || ''}
                    onChange={e => setDeadlineForm(p => ({ ...p, [dateKey]: e.target.value }))} />
                  {mileageKey && (
                    <input className="form-input text-mono" type="number" placeholder="Kilométrage"
                      value={deadlineForm[mileageKey] || ''}
                      onChange={e => setDeadlineForm(p => ({ ...p, [mileageKey]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => { saveDeadlines(); setShowDeadlineEdit(false) }}>Enregistrer</button>
              <button className="btn btn-ghost" onClick={() => setShowDeadlineEdit(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
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
  const [fleet,        setFleet]       = useState([])
  const [loading,      setLoading]     = useState(true)
  const [editing,      setEditing]     = useState(null)
  const [detail,       setDetail]      = useState(null)  // vehicle being viewed
  const [form,         setForm]        = useState(EMPTY)
  const [configBanner, setConfigBanner] = useState(null)
  const [editingHadPurchaseDate, setEditingHadPurchaseDate] = useState(false)

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

  const models = CAR_CATALOGUE[form.make] || []

  return (
    <div>
      <div className="page-header">
        <div><h2>Parc automobile</h2><p>Gérez votre flotte de véhicules</p></div>
        {!detail && !editing && (
          <button className="btn btn-primary" onClick={openAdd}><PlusCircle size={15} /> Ajouter</button>
        )}
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
            onEdit={() => openEdit(detail)}
            onDelete={() => remove(detail.id)}
          />
        )}

        {/* Fleet grid */}
        {!detail && (
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
