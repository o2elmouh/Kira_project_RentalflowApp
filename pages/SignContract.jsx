import { useState, useRef, useEffect } from 'react'

// Public signing page is reached without an authenticated session, so we
// hit the backend directly using fetch. VITE_API_URL points at the Railway
// backend in production; falls back to relative "" for local dev proxy.
const API_BASE = import.meta.env.VITE_API_URL || ''

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

const ERROR_MAP = {
  invalid_token:  'Ce lien de signature est invalide ou inexistant.',
  already_signed: 'Ce contrat a déjà été signé. Aucune action requise.',
  expired:        'Ce lien a expiré. Veuillez demander un nouveau lien à l\'agence.',
}

export default function SignContract({ token }) {
  const [state, setState] = useState('loading') // loading | ready | signed | error
  const [errorMsg, setErrorMsg] = useState('')
  const [contract, setContract] = useState(null)

  // Signature pad.
  // drawing/hasStrokes are kept in refs (not state) so that drawing mouse-
  // moves do NOT trigger React re-renders mid-stroke. A prior bug ("signature
  // disappears on release") was caused by setHasStrokes(true) firing during
  // the first mousemove, which re-rendered the canvas and reapplied its
  // width/height attributes, clearing the bitmap. We now only sync to state
  // once at stopDraw to flip the "Signer" button into its enabled style.
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const strokesRef = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setErrorMsg('Lien invalide.'); setState('error'); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/contracts/sign/${token}`)
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setErrorMsg(ERROR_MAP[data.error] || 'Erreur de chargement du contrat.')
          setState('error')
          return
        }
        setContract(data.contract)
        setState('ready')
      } catch (err) {
        if (!cancelled) {
          setErrorMsg('Erreur réseau. Vérifiez votre connexion.')
          setState('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // ── Canvas helpers (same pattern as Settings.jsx SignatureSection) ──

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    drawingRef.current = true
  }

  const draw = (e) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1c1a16'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    strokesRef.current = true
  }

  const stopDraw = () => {
    drawingRef.current = false
    // Sync the strokes-ref to state once, on lift, to enable the Signer button.
    // Doing it here (instead of inside draw) keeps the drag path render-free.
    if (strokesRef.current && !hasStrokes) setHasStrokes(true)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    strokesRef.current = false
    setHasStrokes(false)
  }

  const handleSign = async () => {
    if (!hasStrokes) return
    const canvas = canvasRef.current
    if (!canvas) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const signatureBase64 = canvas.toDataURL('image/png')
      const r = await fetch(`${API_BASE}/contracts/sign/${token}/sign-native`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signatureBase64 }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        // For known terminal errors (already_signed, expired) drop into
        // the error state; transient errors stay on the ready screen so
        // the user can retry without redrawing.
        if (data.error === 'already_signed' || data.error === 'expired' || data.error === 'invalid_token') {
          setErrorMsg(ERROR_MAP[data.error] || 'Erreur lors de la sauvegarde.')
          setState('error')
        } else {
          setErrorMsg('Erreur lors de la sauvegarde de la signature. Réessayez.')
        }
        return
      }
      setState('signed')
    } catch (err) {
      setErrorMsg('Erreur réseau lors de la sauvegarde.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shared card wrapper ──
  const Card = ({ children }) => (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #f5f4f0)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px 48px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--surface, #ffffff)',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )

  // ── Loading ──
  if (state === 'loading') return (
    <Card>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3, #888)' }}>
        Chargement du contrat…
      </div>
    </Card>
  )

  // ── Error ──
  if (state === 'error') return (
    <Card>
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Lien invalide</h2>
        <p style={{ fontSize: 14, color: 'var(--text2, #555)', lineHeight: 1.6 }}>{errorMsg}</p>
      </div>
    </Card>
  )

  // ── Confirmation after signing ──
  if (state === 'signed') return (
    <Card>
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Contrat signé</h2>
        <p style={{ fontSize: 14, color: 'var(--text2, #555)', lineHeight: 1.6 }}>
          Votre signature a été enregistrée avec succès.<br />
          Merci, vous pouvez fermer cette page.
        </p>
      </div>
    </Card>
  )

  // ── Main signing view ──
  const days = contract.days || (
    contract.startDate && contract.endDate
      ? Math.max(0, Math.round((new Date(contract.endDate) - new Date(contract.startDate)) / 86400000))
      : 0
  )

  return (
    <Card>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border, #e5e5e5)',
        background: 'var(--bg2, #f9f8f5)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3, #888)', marginBottom: 4 }}>
          Signature de contrat
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 700 }}>
          {contract.contractNumber || contract.id}
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: '20px 24px' }}>
        <SummarySection title="Client">
          <SummaryRow label="Nom" value={contract.clientName || '—'} />
        </SummarySection>

        <SummarySection title="Véhicule">
          <SummaryRow label="Véhicule" value={contract.vehicleName || '—'} />
        </SummarySection>

        <SummarySection title="Dates">
          <SummaryRow label="Début" value={`${fmtDate(contract.startDate)}${contract.startTime ? ' ' + contract.startTime : ''}`} />
          <SummaryRow label="Fin" value={`${fmtDate(contract.endDate)}${contract.endTime ? ' ' + contract.endTime : ''}`} />
          <SummaryRow label="Durée" value={`${days} jour${days > 1 ? 's' : ''}`} />
        </SummarySection>

        <SummarySection title="Montant">
          <SummaryRow
            label="Total TTC"
            value={`${(contract.totalTTC || 0).toLocaleString('fr-MA')} MAD`}
            bold
          />
        </SummarySection>

        {/* Signature pad */}
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--text3, #888)',
            marginBottom: 10,
          }}>
            Votre signature
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2, #555)', marginBottom: 8 }}>
            Dessinez votre signature dans le cadre ci-dessous :
          </div>
          <canvas
            ref={canvasRef}
            width={432}
            height={160}
            style={{
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 10,
              background: '#fff',
              cursor: 'crosshair',
              touchAction: 'none',
              display: 'block',
              width: '100%',
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={clearCanvas}
              style={{
                background: 'none',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                color: 'var(--text2, #555)',
              }}
            >
              Effacer
            </button>
            <button
              onClick={handleSign}
              disabled={!hasStrokes || submitting}
              style={{
                flex: 1,
                background: hasStrokes && !submitting ? 'var(--accent, #2563eb)' : 'var(--border, #ccc)',
                color: hasStrokes && !submitting ? '#fff' : 'var(--text3, #999)',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 700,
                cursor: hasStrokes && !submitting ? 'pointer' : 'default',
                transition: 'background .15s',
              }}
            >
              {submitting ? 'Enregistrement…' : 'Signer le contrat'}
            </button>
          </div>
          {!hasStrokes && (
            <p style={{ fontSize: 12, color: 'var(--text3, #aaa)', marginTop: 6 }}>
              Dessinez votre signature pour activer le bouton.
            </p>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid var(--border, #e5e5e5)',
        fontSize: 11,
        color: 'var(--text3, #aaa)',
        textAlign: 'center',
        background: 'var(--bg2, #f9f8f5)',
      }}>
        Ce lien est à usage unique et ne peut être utilisé qu'une seule fois.
      </div>
    </Card>
  )
}

function SummarySection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.08em',
        color: 'var(--text3, #888)',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border, #e5e5e5)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text3, #888)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  )
}
