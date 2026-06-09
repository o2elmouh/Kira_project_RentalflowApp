export default function CarDiagram({ activeSlot, takenSlots }) {
  const zone = (id) => {
    if (activeSlot === id) return { fill: '#CF4500', fillOpacity: 0.55 }
    if (takenSlots?.[id])  return { fill: '#2D7A47', fillOpacity: 0.40 }
    return { fill: 'transparent', fillOpacity: 0 }
  }

  return (
    <svg viewBox="0 0 120 210" style={{ width: 130, height: 195, flexShrink: 0 }}>
      <defs>
        <clipPath id="bodyClip">
          <rect x="26" y="20" width="68" height="164" rx="14" />
        </clipPath>
      </defs>

      {/* Body base */}
      <rect x="26" y="20" width="68" height="164" rx="14" fill="#E8E5E2" stroke="rgba(20,20,19,0.20)" strokeWidth="1.5" />

      {/* Zone overlays — clipped to body shape */}
      <g clipPath="url(#bodyClip)">
        {/* front hood */}
        <rect x="26" y="20" width="68" height="52" {...zone('front')} />
        {/* rear trunk */}
        <rect x="26" y="132" width="68" height="52" {...zone('rear')} />
        {/* left side */}
        <rect x="26" y="60" width="30" height="84" {...zone('left')} />
        {/* right side */}
        <rect x="64" y="60" width="30" height="84" {...zone('right')} />
        {/* interior */}
        <rect x="34" y="62" width="52" height="80" {...zone('interior')} />
      </g>

      {/* Windshields */}
      <rect x="34" y="34" width="52" height="24" rx="4" fill="#C8D8F5" fillOpacity="0.85" stroke="#3860BE" strokeWidth="0.8" strokeOpacity="0.4" />
      <rect x="34" y="146" width="52" height="24" rx="4" fill="#C8D8F5" fillOpacity="0.85" stroke="#3860BE" strokeWidth="0.8" strokeOpacity="0.4" />

      {/* Wheels */}
      <rect x="11" y="32" width="16" height="22" rx="4" fill="#141413" />
      <rect x="93" y="32" width="16" height="22" rx="4" fill="#141413" />
      <rect x="11" y="150" width="16" height="22" rx="4" fill="#141413" />
      <rect x="93" y="150" width="16" height="22" rx="4" fill="#141413" />

      {/* Body outline on top */}
      <rect x="26" y="20" width="68" height="164" rx="14" fill="none" stroke="rgba(20,20,19,0.25)" strokeWidth="1.5" />

      {/* Damage: dashed border around whole car */}
      {activeSlot === 'damage' && (
        <rect x="26" y="20" width="68" height="164" rx="14" fill="none"
          stroke="#ef4444" strokeWidth="2.5" strokeDasharray="5,3" />
      )}

      {/* Active zone labels */}
      {activeSlot === 'front'    && <text x="60" y="51"  textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">AVANT</text>}
      {activeSlot === 'rear'     && <text x="60" y="163" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">ARRIÈRE</text>}
      {activeSlot === 'left'     && <text x="41" y="105" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">G</text>}
      {activeSlot === 'right'    && <text x="79" y="105" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">D</text>}
      {activeSlot === 'interior' && <text x="60" y="105" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">INT.</text>}
      {activeSlot === 'damage'   && <text x="60" y="105" textAnchor="middle" fontSize="7" fill="#ef4444" fontWeight="bold">DOMMAGE</text>}

      {/* Direction labels */}
      <text x="60" y="14"  textAnchor="middle" fontSize="7" fill="#9ca3af">▲ Avant</text>
      <text x="60" y="204" textAnchor="middle" fontSize="7" fill="#9ca3af">Arrière</text>
    </svg>
  )
}
