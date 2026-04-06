import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { compressImage } from '../../utils/imageUtils'
import CarPhotoGuide from '../../components/CarPhotoGuide'

const PHOTO_SLOTS = [
  { id: 'front' },
  { id: 'rear' },
  { id: 'left' },
  { id: 'right' },
  { id: 'interior' },
  { id: 'damage' },
]

export default function Step2Photos({ contract, photos, onChange, onNext, onBack }) {
  const { t } = useTranslation('restitution')
  const fileRefs = useRef({})
  const departurePhotos = contract.photos || {}

  const handleFile = async (slotId, file) => {
    if (!file) return
    const compressed = await compressImage(file)
    onChange({ ...photos, [slotId]: compressed })
  }

  return (
    <div className="card" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>{t('step2.title')}</h3></div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {PHOTO_SLOTS.map(slot => {
            const departurePhoto = departurePhotos[slot.id]
            const returnPhoto = photos[slot.id]
            return (
              <div key={slot.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg2)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  {t(`photos.${slot.id}`)}
                </div>
                <div style={{ display: 'flex', gap: 4, padding: 8 }}>
                  {/* Departure photo */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{t('step2.departure')}</div>
                    {departurePhoto ? (
                      <img src={departurePhoto} alt="départ" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', borderRadius: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>—</span>
                      </div>
                    )}
                  </div>
                  {/* Return photo */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{t('step2.return')}</div>
                    {returnPhoto ? (
                      <div style={{ position: 'relative' }}>
                        <img src={returnPhoto} alt="retour" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }} />
                        <button
                          onClick={() => { const p = { ...photos }; delete p[slot.id]; onChange(p) }}
                          style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: 'white', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >×</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileRefs.current[slot.id]?.click()}
                        style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', borderRadius: 4, cursor: 'pointer', border: '2px dashed var(--border)' }}
                      >
                        <CarPhotoGuide slotId={slot.id} size={32} />
                      </div>
                    )}
                    <input
                      ref={el => fileRefs.current[slot.id] = el}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => handleFile(slot.id, e.target.files[0])}
                    />
                    {!returnPhoto && (
                      <button
                        className="btn btn-secondary"
                        style={{ marginTop: 4, padding: '3px 8px', fontSize: 11, width: '100%' }}
                        onClick={() => fileRefs.current[slot.id]?.click()}
                      >
                        {t('step2.add')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.prev')}
          </button>
          <button className="btn btn-primary" onClick={onNext} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('nav.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
