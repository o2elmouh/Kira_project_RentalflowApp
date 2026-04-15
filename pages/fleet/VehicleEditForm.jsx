import { Radio } from 'lucide-react'
import PlateInput from './PlateInput'
import InlineRepairsSection from './InlineRepairsSection'
import ReferencePhotosSection from './ReferencePhotosSection'
import { CAR_CATALOGUE, MAKES, YEARS } from './constants'

export default function VehicleEditForm({ form, set, isNew, configBanner, editing, editingHadPurchaseDate, onSave, onCancel, onMakeChange }) {
  const models = CAR_CATALOGUE[form.make] || []

  return (
    <div className="card mb-4">
      <div className="card-header"><h3>{isNew ? 'Nouveau véhicule' : 'Modifier le véhicule'}</h3></div>
      <div className="card-body">
        <div className="form-row cols-3">
          <div className="form-group">
            <label className="form-label">Marque *</label>
            <select className="form-select" value={form.make} onChange={e => onMakeChange(e.target.value)}>
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

        {isNew && configBanner && (
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
            <select className="form-select" value={form.color} onChange={e => set('color', e.target.value)}>
              <option value="">— Choisir —</option>
              {['Blanc', 'Noir', 'Gris', 'Argent', 'Rouge', 'Bleu', 'Vert', 'Beige', 'Marron', 'Orange', 'Jaune', 'Violet', 'Autre'].map(c => <option key={c}>{c}</option>)}
            </select>
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

        {/* Reference photos section */}
        <ReferencePhotosSection
          photos={form.photos || {}}
          onChange={photos => set('photos', photos)}
        />

        {/* GPS device */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Radio size={14} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>Télématique GPS</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!form.trackedDevice !== false && form.trackedDevice !== null}
              onChange={e => set('trackedDevice', e.target.checked ? '' : null)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Ce véhicule est équipé d'un boîtier GPS
          </label>
          {form.trackedDevice !== null && form.trackedDevice !== undefined && (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: 12 }}>ID du boîtier (fourni par Traccar / Flespi)</label>
              <input
                className="form-input"
                style={{ fontFamily: 'monospace', fontSize: 13 }}
                placeholder="ex: device-001 ou IMEI 123456789"
                value={form.trackedDevice || ''}
                onChange={e => set('trackedDevice', e.target.value)}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Doit correspondre à l'identifiant configuré dans votre plateforme télématique.
              </div>
            </div>
          )}
        </div>

        {!isNew && <InlineRepairsSection vehicleId={editing} />}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={onSave} disabled={!form.make || !form.model || !form.plate}>Enregistrer</button>
          <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  )
}
