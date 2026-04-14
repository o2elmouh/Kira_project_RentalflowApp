/**
 * WelcomeScreen — shown after onboarding completes.
 * SVG car drives across screen with spinning wheels and road dashes.
 * Auto-advances to dashboard after 3 seconds.
 */
import { useEffect, useState } from 'react'

export default function WelcomeScreen({ onDone }) {
  const [phase, setPhase] = useState('drive-in') // drive-in → pause → drive-out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('pause'), 1200)
    const t2 = setTimeout(() => setPhase('drive-out'), 2200)
    const t3 = setTimeout(() => onDone(), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  return (
    <div style={styles.shell}>
      {/* Background glow */}
      <div style={styles.glow} />

      {/* Welcome text */}
      <div style={{ ...styles.textWrap, opacity: phase === 'pause' ? 1 : 0, transform: phase === 'pause' ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s ease' }}>
        <p style={styles.sub}>Bienvenue sur</p>
        <h1 style={styles.title}>RentaFlow</h1>
        <p style={styles.sub2}>Votre agence est prête ✓</p>
      </div>

      {/* Road */}
      <div style={styles.roadWrap}>
        <div style={styles.road}>
          <div style={styles.dashes} />
        </div>

        {/* Car SVG */}
        <div style={{ ...styles.carWrap, ...getCarPos(phase) }}>
          <CarSVG />
        </div>
      </div>
    </div>
  )
}

function getCarPos(phase) {
  if (phase === 'drive-in')  return { transform: 'translateX(-160px)', opacity: 1, transition: 'transform 1.1s cubic-bezier(0.25,0.46,0.45,0.94)' }
  if (phase === 'pause')     return { transform: 'translateX(0px)',    opacity: 1, transition: 'transform 0.4s ease-out' }
  if (phase === 'drive-out') return { transform: 'translateX(200px)',  opacity: 1, transition: 'transform 0.9s cubic-bezier(0.55,0,1,0.45)' }
  return {}
}

function CarSVG() {
  return (
    <svg width="160" height="64" viewBox="0 0 160 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes spin { from { transform-origin: center; transform: rotate(0deg); } to { transform-origin: center; transform: rotate(360deg); } }
        .wheel { animation: spin 0.5s linear infinite; }
        @keyframes shimmer { 0%,100% { opacity:0.6 } 50% { opacity:1 } }
        .headlight { animation: shimmer 0.8s ease-in-out infinite; }
      `}</style>

      {/* Car body */}
      <rect x="18" y="28" width="124" height="22" rx="4" fill="var(--accent, #6366f1)" />

      {/* Cabin */}
      <path d="M50 28 L62 10 L100 10 L114 28 Z" fill="#818cf8" />

      {/* Window */}
      <path d="M65 27 L72 14 L96 14 L106 27 Z" fill="#1e1b4b" opacity="0.8" />
      <line x1="86" y1="14" x2="86" y2="27" stroke="#4f46e5" strokeWidth="1" />

      {/* Stripe */}
      <rect x="18" y="36" width="124" height="3" rx="1" fill="white" opacity="0.15" />

      {/* Front bumper */}
      <rect x="136" y="34" width="8" height="10" rx="2" fill="#4f46e5" />

      {/* Rear bumper */}
      <rect x="16" y="34" width="8" height="10" rx="2" fill="#4f46e5" />

      {/* Headlight */}
      <ellipse cx="143" cy="37" rx="4" ry="3" fill="#fde68a" className="headlight" />
      <ellipse cx="143" cy="37" rx="2" ry="1.5" fill="#fef3c7" className="headlight" />

      {/* Tail light */}
      <ellipse cx="19" cy="37" rx="3" ry="2.5" fill="#f87171" opacity="0.9" />

      {/* Front wheel */}
      <g style={{ transformOrigin: '118px 50px', animation: 'spin 0.5s linear infinite' }}>
        <circle cx="118" cy="50" r="12" fill="#1e1b4b" />
        <circle cx="118" cy="50" r="8" fill="#374151" />
        <circle cx="118" cy="50" r="3" fill="#6b7280" />
        <line x1="118" y1="42" x2="118" y2="58" stroke="#6b7280" strokeWidth="1.5" />
        <line x1="110" y1="50" x2="126" y2="50" stroke="#6b7280" strokeWidth="1.5" />
        <line x1="112" y1="44" x2="124" y2="56" stroke="#6b7280" strokeWidth="1" />
        <line x1="124" y1="44" x2="112" y2="56" stroke="#6b7280" strokeWidth="1" />
      </g>

      {/* Rear wheel */}
      <g style={{ transformOrigin: '44px 50px', animation: 'spin 0.5s linear infinite' }}>
        <circle cx="44" cy="50" r="12" fill="#1e1b4b" />
        <circle cx="44" cy="50" r="8" fill="#374151" />
        <circle cx="44" cy="50" r="3" fill="#6b7280" />
        <line x1="44" y1="42" x2="44" y2="58" stroke="#6b7280" strokeWidth="1.5" />
        <line x1="36" y1="50" x2="52" y2="50" stroke="#6b7280" strokeWidth="1.5" />
        <line x1="38" y1="44" x2="50" y2="56" stroke="#6b7280" strokeWidth="1" />
        <line x1="50" y1="44" x2="38" y2="56" stroke="#6b7280" strokeWidth="1" />
      </g>

      {/* Speed lines */}
      <line x1="0" y1="32" x2="14" y2="32" stroke="var(--accent, #6366f1)" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      <line x1="0" y1="38" x2="10" y2="38" stroke="var(--accent, #6366f1)" strokeWidth="1.5" opacity="0.35" strokeLinecap="round" />
      <line x1="0" y1="44" x2="7" y2="44" stroke="var(--accent, #6366f1)" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
    </svg>
  )
}

const styles = {
  shell: {
    position: 'fixed', inset: 0,
    background: 'var(--bg, #0f0e17)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: 400, height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  textWrap: {
    textAlign: 'center', marginBottom: 48, position: 'relative',
  },
  title: {
    fontSize: 42, fontWeight: 800, margin: '4px 0',
    background: 'linear-gradient(135deg, #818cf8, #6366f1)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    letterSpacing: '-1px',
  },
  sub: {
    fontSize: 14, color: 'var(--text-secondary, #94a3b8)',
    margin: 0, letterSpacing: 2, textTransform: 'uppercase',
  },
  sub2: {
    fontSize: 15, color: '#22c55e', marginTop: 8, fontWeight: 600,
  },
  roadWrap: {
    position: 'relative', width: 340, height: 80,
  },
  road: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
    background: '#1e293b', borderRadius: 4,
    overflow: 'hidden',
  },
  dashes: {
    position: 'absolute', top: '50%', left: 0,
    width: '200%', height: 3, marginTop: -1.5,
    background: 'repeating-linear-gradient(90deg, #475569 0px, #475569 24px, transparent 24px, transparent 48px)',
    animation: 'dashMove 0.4s linear infinite',
  },
}

// Inject the dash animation globally once
if (typeof document !== 'undefined' && !document.getElementById('rf-welcome-anim')) {
  const s = document.createElement('style')
  s.id = 'rf-welcome-anim'
  s.textContent = `@keyframes dashMove { from { transform: translateX(0) } to { transform: translateX(-48px) } }`
  document.head.appendChild(s)
}
