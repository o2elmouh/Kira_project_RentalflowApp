import { useRef, useEffect, useState } from 'react'
import { getGeneralConfig, saveGeneralConfig } from '../../lib/db'

export default function SignatureSection() {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [savedSig, setSavedSig] = useState(null)
  const [editMode, setEditMode] = useState(true)
  const [saveFeedback, setSaveFeedback] = useState(false)

  useEffect(() => {
    (async () => {
      const cfg = await getGeneralConfig()
      const sig = cfg.defaultSignature || null
      setSavedSig(sig)
      setEditMode(!sig)
    })()
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setDrawing(true)
  }

  const draw = (e) => {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c1a16'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const stopDraw = () => setDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const saveSig = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const cfg = await getGeneralConfig()
    await saveGeneralConfig({ ...cfg, defaultSignature: dataUrl })
    setSavedSig(dataUrl)
    setEditMode(false)
    setSaveFeedback(true)
    setTimeout(() => setSaveFeedback(false), 2000)
  }

  const startEdit = () => {
    setEditMode(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }, 50)
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-header">
        <h3>Signature par défaut</h3>
        {saveFeedback && <span className="badge badge-green">Enregistrée</span>}
      </div>
      <div className="card-body">
        {!editMode && savedSig ? (
          <div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'inline-block', marginBottom: 12 }}>
              <img src={savedSig} alt="Signature enregistrée" style={{ display: 'block', maxWidth: 400 }} />
            </div>
            <div>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={startEdit}>
                Modifier la signature
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              Dessinez votre signature ci-dessous :
            </div>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={clearCanvas}>
                Effacer
              </button>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveSig}>
                Enregistrer la signature
              </button>
              {savedSig && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditMode(false)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
