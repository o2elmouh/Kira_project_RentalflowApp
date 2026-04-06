import { useState, useRef } from 'react'
import { Camera, CheckCircle, ArrowLeft, X, ArrowRight } from 'lucide-react'
import { compressImage } from '../../utils/imageUtils'
import CarPhotoGuide from '../../components/CarPhotoGuide'
import StepButtons from './StepButtons'
import CarDiagram from './CarDiagram'

const PHOTO_SLOTS = [
  { id: 'front',    label: 'Avant' },
  { id: 'rear',     label: 'Arrière' },
  { id: 'left',     label: 'Côté gauche' },
  { id: 'right',    label: 'Côté droit' },
  { id: 'interior', label: 'Intérieur' },
  { id: 'damage',   label: 'Détail / Dommage' },
]

export default function PhotoStep({ onNext, onBack, onSaveAndQuit, onCancel }) {
  const [photos,     setPhotos]     = useState({})
  const [loading,    setLoading]    = useState({})
  const [activeSlot, setActiveSlot] = useState(null)
  const refs = useRef({})

  const capture = async (id, file) => {
    if (!file) return
    setLoading(p => ({ ...p, [id]: true }))
    const compressed = await compressImage(file)
    if (!compressed) {
      setLoading(p => ({ ...p, [id]: false }))
      return
    }
    const dataUrl = compressed
    setPhotos(p => ({ ...p, [id]: dataUrl }))
    setLoading(p => ({ ...p, [id]: false }))
    setActiveSlot(null)
  }

  const triggerCapture = (id) => {
    setActiveSlot(id)
    refs.current[id]?.click()
  }

  const takenCount = Object.keys(photos).length

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>

        {/* Car diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Guide visuel
          </div>
          <CarDiagram activeSlot={activeSlot} takenSlots={photos} />
          <div style={{
            minHeight: 20, fontSize: 12, fontWeight: 600,
            color: activeSlot ? '#ef4444' : 'var(--text3)',
            textAlign: 'center',
          }}>
            {activeSlot
              ? `📷 ${PHOTO_SLOTS.find(s => s.id === activeSlot)?.label}`
              : takenCount > 0
                ? `${takenCount} / ${PHOTO_SLOTS.length} photos`
                : 'Appuyez sur une zone'}
          </div>
        </div>

        {/* Photo slots */}
        <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {PHOTO_SLOTS.map(({ id, label }) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div
                onClick={() => triggerCapture(id)}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: photos[id]
                    ? '2px solid var(--green)'
                    : activeSlot === id
                      ? '2px solid #ef4444'
                      : '2px dashed var(--border)',
                  background: activeSlot === id ? '#fef2f2' : 'var(--bg2)',
                  cursor: 'pointer',
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {photos[id] ? (
                  <img src={photos[id]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : loading[id] ? (
                  <div style={{ fontSize: 24, opacity: 0.5 }}>⏳</div>
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CarPhotoGuide slotId={id} />
                  </div>
                )}
                {photos[id] && (
                  <div style={{
                    position: 'absolute', bottom: 4, right: 4,
                    background: 'var(--green)', borderRadius: '50%',
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckCircle size={11} color="#fff" />
                  </div>
                )}
              </div>
              <input
                ref={el => refs.current[id] = el}
                type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => capture(id, e.target.files[0])}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
                {photos[id] && (
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 10 }}
                    onClick={() => triggerCapture(id)}>
                    <Camera size={10} /> Reprendre
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {takenCount > 0 && (
        <div className="alert alert-success mb-4" style={{ fontSize: 12 }}>
          <CheckCircle size={14} />
          <span>{takenCount} photo{takenCount > 1 ? 's' : ''} prise{takenCount > 1 ? 's' : ''}. Elles seront incluses dans le contrat PDF.</span>
        </div>
      )}

      <StepButtons
        leftBtns={
          <>
            <button className="btn btn-primary btn-lg" onClick={onBack} style={{ color: 'white' }}><ArrowLeft size={15} /> Retour</button>
            <button className="btn btn-primary btn-lg" style={{ color: 'white' }} onClick={onCancel}>
              <X size={15} /> Annuler la location
            </button>
          </>
        }
        rightBtns={
          <>
            <button className="btn btn-ghost" onClick={onSaveAndQuit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              💾 Sauvegarder & quitter
            </button>
            <button className="btn btn-primary btn-lg" onClick={() => onNext(photos)}>
              Continuer <ArrowRight size={15} />
            </button>
          </>
        }
      />
    </div>
  )
}
