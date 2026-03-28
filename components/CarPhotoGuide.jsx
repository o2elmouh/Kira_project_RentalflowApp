// 3D-style car illustrations for each photo angle
// viewBox 220x140 for all views

const RED   = '#ef4444'
const RED_O = '0.62'
const BODY  = '#cbd5e1'
const BODY2 = '#b8c4d4'
const GLASS = '#bfdbfe'
const DARK  = '#1e293b'
const WHEEL = '#374151'
const HUB   = '#94a3b8'
const STROKE = '#94a3b8'

// ── Shared: wheel with rim ────────────────────────────────
function Wheel({ cx, cy, rx = 22, ry = 22 }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={WHEEL} stroke="#111827" strokeWidth="1.2" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.62} ry={ry * 0.62} fill="#4b5563" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.22} ry={ry * 0.22} fill={HUB} />
      {[0, 60, 120, 180, 240, 300].map(a => {
        const rad = a * Math.PI / 180
        return <line key={a} x1={cx} y1={cy}
          x2={cx + Math.cos(rad) * rx * 0.55} y2={cy + Math.sin(rad) * ry * 0.55}
          stroke="#6b7280" strokeWidth="1.2" />
      })}
    </g>
  )
}

// ── FRONT VIEW ────────────────────────────────────────────
function FrontView() {
  return (
    <svg viewBox="0 0 220 140" style={{ width: '100%', height: '100%' }}>
      {/* Roof */}
      <path d="M62,8 Q75,4 110,4 Q145,4 158,8 L178,46 L42,46 Z" fill={BODY2} stroke={STROKE} strokeWidth="1" />
      {/* Windshield */}
      <path d="M70,9 Q110,5 150,9 L172,44 L48,44 Z" fill={GLASS} fillOpacity="0.88" stroke="#93c5fd" strokeWidth="0.8" />
      {/* Main front face */}
      <path d="M36,46 L184,46 L188,94 Q188,100 180,100 L40,100 Q32,100 32,94 Z" fill={BODY} stroke={STROKE} strokeWidth="1.2" />
      {/* Hood crease */}
      <line x1="36" y1="65" x2="184" y2="65" stroke={BODY2} strokeWidth="1" />
      {/* Left headlight — DRL style */}
      <rect x="38" y="50" width="48" height="16" rx="5" fill="#fefce8" stroke="#fbbf24" strokeWidth="1" />
      <rect x="40" y="52" width="30" height="12" rx="3" fill="#fef9c3" />
      <line x1="70" y1="52" x2="84" y2="64" stroke="#fbbf24" strokeWidth="1" strokeDasharray="2,2" />
      {/* Right headlight */}
      <rect x="134" y="50" width="48" height="16" rx="5" fill="#fefce8" stroke="#fbbf24" strokeWidth="1" />
      <rect x="150" y="52" width="30" height="12" rx="3" fill="#fef9c3" />
      <line x1="150" y1="52" x2="136" y2="64" stroke="#fbbf24" strokeWidth="1" strokeDasharray="2,2" />
      {/* Grille */}
      <rect x="86" y="53" width="48" height="22" rx="4" fill={DARK} />
      {[57,63,69].map(y => <line key={y} x1="87" y1={y} x2="133" y2={y} stroke="#374151" strokeWidth="0.7" />)}
      {[98,110,122].map(x => <line key={x} x1={x} y1="53" x2={x} y2="75" stroke="#374151" strokeWidth="0.7" />)}
      {/* Logo */}
      <circle cx="110" cy="48" r="5" fill="#64748b" stroke={STROKE} strokeWidth="0.8" />
      {/* BUMPER — RED */}
      <path d="M32,82 L188,82 L188,94 Q188,100 180,100 L40,100 Q32,100 32,94 Z"
        fill={RED} fillOpacity={RED_O} stroke={RED} strokeWidth="1.5" />
      <text x="110" y="94" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">AVANT</text>
      {/* Wheels (foreshortened) */}
      <Wheel cx={66} cy={118} rx={26} ry={13} />
      <Wheel cx={154} cy={118} rx={26} ry={13} />
      {/* Underside */}
      <line x1="40" y1="100" x2="180" y2="100" stroke={STROKE} strokeWidth="0.8" />
    </svg>
  )
}

// ── REAR VIEW ─────────────────────────────────────────────
function RearView() {
  return (
    <svg viewBox="0 0 220 140" style={{ width: '100%', height: '100%' }}>
      {/* Roof */}
      <path d="M62,8 Q75,4 110,4 Q145,4 158,8 L178,46 L42,46 Z" fill={BODY2} stroke={STROKE} strokeWidth="1" />
      {/* Rear window */}
      <path d="M70,9 Q110,5 150,9 L172,44 L48,44 Z" fill={GLASS} fillOpacity="0.88" stroke="#93c5fd" strokeWidth="0.8" />
      {/* Main rear face */}
      <path d="M36,46 L184,46 L188,94 Q188,100 180,100 L40,100 Q32,100 32,94 Z" fill={BODY} stroke={STROKE} strokeWidth="1.2" />
      {/* Trunk line */}
      <line x1="36" y1="64" x2="184" y2="64" stroke={BODY2} strokeWidth="1" />
      {/* Left taillight — wrap-around style */}
      <rect x="36" y="48" width="52" height="18" rx="4" fill="#fecaca" stroke="#ef4444" strokeWidth="1.2" />
      <rect x="38" y="50" width="22" height="14" rx="3" fill="#fca5a5" />
      <rect x="62" y="50" width="24" height="14" rx="3" fill="#fee2e2" />
      <line x1="62" y1="50" x2="62" y2="64" stroke="#ef4444" strokeWidth="0.7" />
      {/* Right taillight */}
      <rect x="132" y="48" width="52" height="18" rx="4" fill="#fecaca" stroke="#ef4444" strokeWidth="1.2" />
      <rect x="134" y="50" width="24" height="14" rx="3" fill="#fee2e2" />
      <rect x="160" y="50" width="22" height="14" rx="3" fill="#fca5a5" />
      <line x1="158" y1="50" x2="158" y2="64" stroke="#ef4444" strokeWidth="0.7" />
      {/* License plate */}
      <rect x="86" y="68" width="48" height="16" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1" />
      <text x="110" y="79" textAnchor="middle" fontSize="7" fill={DARK} fontFamily="monospace">12345 و 21</text>
      {/* Exhaust */}
      <rect x="76" y="94" width="14" height="6" rx="2" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
      <rect x="130" y="94" width="14" height="6" rx="2" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
      {/* BUMPER — RED */}
      <path d="M32,82 L188,82 L188,94 Q188,100 180,100 L40,100 Q32,100 32,94 Z"
        fill={RED} fillOpacity={RED_O} stroke={RED} strokeWidth="1.5" />
      <text x="110" y="94" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">ARRIÈRE</text>
      <Wheel cx={66} cy={118} rx={26} ry={13} />
      <Wheel cx={154} cy={118} rx={26} ry={13} />
    </svg>
  )
}

// ── SIDE VIEW (left profile) ──────────────────────────────
function SideView({ flip = false }) {
  const label = flip ? 'CÔTÉ DROIT' : 'CÔTÉ GAUCHE'
  return (
    <svg viewBox="0 0 220 140" style={{ width: '100%', height: '100%', transform: flip ? 'scaleX(-1)' : 'none' }}>
      {/* Body silhouette */}
      <path d="M14,90 Q14,72 22,66 L44,42 Q60,24 80,19 Q100,14 126,16 L162,22 Q188,30 202,52 L208,72 L208,90 Q208,98 200,98 L22,98 Q14,98 14,90 Z"
        fill={BODY} stroke={STROKE} strokeWidth="1.3" />
      {/* SIDE PANEL — RED */}
      <path d="M14,90 Q14,72 22,66 L44,42 Q60,24 80,19 Q100,14 126,16 L162,22 Q188,30 202,52 L208,72 L208,90 Q208,98 200,98 L22,98 Q14,98 14,90 Z"
        fill={RED} fillOpacity="0.38" stroke={RED} strokeWidth="1.8" />
      {/* Windows */}
      <path d="M46,43 L62,26 Q78,18 102,16 Q124,15 148,22 L172,38 L162,52 L52,52 Z"
        fill={GLASS} fillOpacity="0.88" stroke="#93c5fd" strokeWidth="0.8" />
      {/* B-pillar */}
      <rect x="108" y="20" width="5" height="32" fill={BODY2} />
      {/* Door lines */}
      <line x1="52" y1="52" x2="52" y2="96" stroke={BODY2} strokeWidth="1.2" />
      <line x1="113" y1="52" x2="113" y2="96" stroke={BODY2} strokeWidth="1.2" />
      <line x1="168" y1="42" x2="168" y2="90" stroke={BODY2} strokeWidth="1.2" />
      {/* Door handles */}
      <rect x="68" y="66" width="20" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      <rect x="130" y="66" width="20" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      {/* Headlight */}
      <path d="M16,68 Q16,58 24,56 L52,54 L52,66 Q40,68 16,68 Z" fill="#fefce8" stroke="#fbbf24" strokeWidth="1" />
      <path d="M18,68 L52,66" stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="3,2" />
      {/* Taillight */}
      <path d="M204,56 L174,54 L174,68 L204,70 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1" />
      {/* Side mirror */}
      <path d="M46,46 L32,41 L32,50 L46,50 Z" fill={BODY2} stroke={STROKE} strokeWidth="0.8" />
      {/* Roof rails */}
      <line x1="60" y1="16" x2="166" y2="20" stroke={BODY2} strokeWidth="1.5" />
      {/* Wheels */}
      <Wheel cx={62} cy={112} rx={25} ry={25} />
      <Wheel cx={164} cy={112} rx={25} ry={25} />
      {/* Label (not flipped for readability) */}
      <text x="110" y="76"
        textAnchor="middle" fontSize="9" fill={RED} fontWeight="bold"
        style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.4))' }}
        transform={flip ? `scale(-1,1) translate(-220,0)` : ''}>
        {label}
      </text>
    </svg>
  )
}

// ── INTERIOR (top-down) ───────────────────────────────────
function InteriorView() {
  return (
    <svg viewBox="0 0 220 150" style={{ width: '100%', height: '100%' }}>
      {/* Car outline */}
      <path d="M44,8 Q78,4 110,4 Q142,4 176,8 L192,30 L196,110 Q196,130 176,134 L44,134 Q24,130 24,110 L28,30 Z"
        fill={BODY} stroke={STROKE} strokeWidth="1.4" />
      {/* Windshield */}
      <path d="M52,10 Q110,6 168,10 L184,30 L36,30 Z" fill={GLASS} fillOpacity="0.85" stroke="#93c5fd" strokeWidth="0.8" />
      {/* Rear window */}
      <path d="M52,132 Q110,136 168,132 L184,112 L36,112 Z" fill={GLASS} fillOpacity="0.85" stroke="#93c5fd" strokeWidth="0.8" />
      {/* INTERIOR — RED */}
      <rect x="36" y="32" width="148" height="78" rx="3" fill={RED} fillOpacity="0.45" stroke={RED} strokeWidth="1.5" />
      {/* Dashboard */}
      <rect x="38" y="30" width="144" height="14" rx="3" fill={DARK} />
      <rect x="44" y="33" width="60" height="8" rx="2" fill="#374151" />
      <rect x="116" y="33" width="60" height="8" rx="2" fill="#374151" />
      <rect x="96" y="32" width="28" height="12" rx="3" fill="#1e293b" />
      {/* Steering wheel */}
      <circle cx="76" cy="56" r="13" fill="none" stroke={DARK} strokeWidth="3" />
      <circle cx="76" cy="56" r="5" fill="#374151" />
      <line x1="76" y1="43" x2="76" y2="51" stroke={DARK} strokeWidth="2.5" />
      <line x1="76" y1="61" x2="76" y2="69" stroke={DARK} strokeWidth="2.5" />
      <line x1="63" y1="56" x2="71" y2="56" stroke={DARK} strokeWidth="2.5" />
      <line x1="81" y1="56" x2="89" y2="56" stroke={DARK} strokeWidth="2.5" />
      {/* Front seat driver */}
      <rect x="44" y="48" width="42" height="34" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="46" y="50" width="38" height="22" rx="4" fill="#6b7280" />
      {/* Front seat passenger */}
      <rect x="134" y="48" width="42" height="34" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="136" y="50" width="38" height="22" rx="4" fill="#6b7280" />
      {/* Center console */}
      <rect x="96" y="50" width="28" height="32" rx="4" fill="#475569" />
      <rect x="100" y="54" width="20" height="10" rx="2" fill="#374151" />
      <circle cx="110" cy="72" r="5" fill="#374151" />
      {/* Rear seats */}
      <rect x="44" y="86" width="42" height="28" rx="4" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="134" y="86" width="42" height="28" rx="4" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="96" y="86" width="28" height="28" rx="4" fill="#5e6e82" stroke="#475569" strokeWidth="0.8" />
      {/* Direction */}
      <text x="110" y="8" textAnchor="middle" fontSize="7" fill="#94a3b8">▲ Avant</text>
      <text x="110" y="70" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">INTÉRIEUR</text>
    </svg>
  )
}

// ── DAMAGE / DETAIL ───────────────────────────────────────
function DamageView() {
  return (
    <svg viewBox="0 0 220 140" style={{ width: '100%', height: '100%' }}>
      {/* Same side body */}
      <path d="M14,90 Q14,72 22,66 L44,42 Q60,24 80,19 Q100,14 126,16 L162,22 Q188,30 202,52 L208,72 L208,90 Q208,98 200,98 L22,98 Q14,98 14,90 Z"
        fill={BODY} stroke={STROKE} strokeWidth="1.3" />
      <path d="M46,43 L62,26 Q78,18 102,16 Q124,15 148,22 L172,38 L162,52 L52,52 Z"
        fill={GLASS} fillOpacity="0.88" stroke="#93c5fd" strokeWidth="0.8" />
      <rect x="108" y="20" width="5" height="32" fill={BODY2} />
      <line x1="52" y1="52" x2="52" y2="96" stroke={BODY2} strokeWidth="1.2" />
      <line x1="113" y1="52" x2="113" y2="96" stroke={BODY2} strokeWidth="1.2" />
      <path d="M16,68 Q16,58 24,56 L52,54 L52,66 Q40,68 16,68 Z" fill="#fefce8" stroke="#fbbf24" strokeWidth="1" />
      <path d="M204,56 L174,54 L174,68 L204,70 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1" />
      <Wheel cx={62} cy={112} rx={25} ry={25} />
      <Wheel cx={164} cy={112} rx={25} ry={25} />
      {/* Inspection markers */}
      {[
        { cx: 30, cy: 74, label: '1' },
        { cx: 82, cy: 30, label: '2' },
        { cx: 140, cy: 72, label: '3' },
        { cx: 185, cy: 60, label: '4' },
        { cx: 100, cy: 92, label: '5' },
      ].map(({ cx, cy, label }) => (
        <g key={label}>
          <circle cx={cx} cy={cy} r="11" fill={RED} fillOpacity="0.18" stroke={RED} strokeWidth="2" />
          <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7} stroke={RED} strokeWidth="2" />
          <line x1={cx + 7} y1={cy - 7} x2={cx - 7} y2={cy + 7} stroke={RED} strokeWidth="2" />
        </g>
      ))}
      <text x="110" y="130" textAnchor="middle" fontSize="8" fill={RED} fontWeight="bold">DOMMAGES / DÉTAILS</text>
    </svg>
  )
}

// ── Main export ───────────────────────────────────────────
export default function CarPhotoGuide({ slotId }) {
  if (slotId === 'front')    return <FrontView />
  if (slotId === 'rear')     return <RearView />
  if (slotId === 'left')     return <SideView flip={false} />
  if (slotId === 'right')    return <SideView flip={true} />
  if (slotId === 'interior') return <InteriorView />
  return <DamageView />
}
