import { useRef } from 'react'
import { compressImage } from '../../utils/imageUtils'
import { REFERENCE_PHOTO_SLOTS } from './constants'

export default function ReferencePhotosSection({ photos, onChange }) {
  const fileRefs = useRef({})

  const handleFile = async (slotId, file) => {
    if (!file) return
    const compressed = await compressImage(file)
    if (compressed) onChange({ ...photos, [slotId]: compressed })
  }

  const removePhoto = (slotId) => {
    const updated = { ...photos }
    delete updated[slotId]
    onChange(updated)
  }

  const hasAny = REFERENCE_PHOTO_SLOTS.some(s => photos[s.id])

  return (
    <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Photos de référence
        {hasAny && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--green)', fontWeight: 400, textTransform: 'none' }}>({REFERENCE_PHOTO_SLOTS.filter(s => photos[s.id]).length}/6 photos)</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {REFERENCE_PHOTO_SLOTS.map(slot => (
          <div key={slot.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>{slot.label}</div>
            {photos[slot.id] ? (
              <div style={{ position: 'relative' }}>
                <img
                  src={photos[slot.id]}
                  alt={slot.label}
                  style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(slot.id)}
                  style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: 'white', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >×</button>
              </div>
            ) : (
              <div
                onClick={() => fileRefs.current[slot.id]?.click()}
                style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '2px dashed var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}
              >+</div>
            )}
            <input
              ref={el => fileRefs.current[slot.id] = el}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => handleFile(slot.id, e.target.files[0])}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
