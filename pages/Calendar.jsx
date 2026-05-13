import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getContracts, getFleet } from '../lib/db.js'

function startOf(date, zoom) {
  const d = new Date(date)
  if (zoom === 'week')  { d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0) }
  if (zoom === 'month') { d.setDate(1); d.setHours(0,0,0,0) }
  if (zoom === 'year')  { d.setMonth(0, 1); d.setHours(0,0,0,0) }
  return d
}
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
function getDays(anchor, zoom) {
  const n = zoom === 'week' ? 7 : zoom === 'month' ? daysInMonth(anchor) : 365
  return Array.from({ length: n }, (_, i) => { const d = new Date(anchor); d.setDate(d.getDate() + i); return d })
}
function advance(anchor, zoom, dir) {
  const d = new Date(anchor)
  if (zoom === 'week')  d.setDate(d.getDate() + dir * 7)
  if (zoom === 'month') d.setMonth(d.getMonth() + dir)
  if (zoom === 'year')  d.setFullYear(d.getFullYear() + dir)
  return d
}
function periodLabel(anchor, zoom) {
  if (zoom === 'week') {
    const end = new Date(anchor); end.setDate(end.getDate() + 6)
    return anchor.toLocaleDateString('fr-MA',{day:'numeric',month:'short'}) + ' – ' + end.toLocaleDateString('fr-MA',{day:'numeric',month:'short',year:'numeric'})
  }
  if (zoom === 'month') return anchor.toLocaleDateString('fr-MA',{month:'long',year:'numeric'})
  return String(anchor.getFullYear())
}
function dayLabel(d, zoom) {
  if (zoom === 'week')  return d.toLocaleDateString('fr-MA',{weekday:'short',day:'numeric'})
  if (zoom === 'month') return String(d.getDate())
  return ''
}

const PALETTE = {
  active: { bg: 'rgba(207,69,0,0.13)',    border: '#CF4500', text: '#CF4500' },
  closed: { bg: 'rgba(105,105,105,0.12)', border: '#696969', text: '#696969' },
  late:   { bg: 'rgba(220,38,38,0.13)',   border: '#dc2626', text: '#dc2626' },
}
function palette(c) {
  if (c.status === 'active' && c.endDate && new Date(c.endDate) < new Date()) return PALETTE.late
  return PALETTE[c.status] || PALETTE.active
}

const VW = 164
const NAV_BTN = { width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text-primary)', cursor:'pointer', fontSize:18, padding:0 }

export default function Calendar() {
  const { t } = useTranslation("common")
  const [contracts, setContracts] = useState([])
  const [fleet, setFleet]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [zoom, setZoom]           = useState('month')
  const [anchor, setAnchor]       = useState(() => startOf(new Date(), 'month'))
  const [vehicle, setVehicle]     = useState('all')

  useEffect(() => {
    Promise.all([getContracts(), getFleet()])
      .then(([c, f]) => { setContracts(c || []); setFleet(f || []) })
      .finally(() => setLoading(false))
  }, [])

  const rows  = useMemo(() => vehicle === 'all' ? fleet : fleet.filter(v => v.id === vehicle), [fleet, vehicle])
  const days  = useMemo(() => getDays(anchor, zoom), [anchor, zoom])
  const cols  = zoom === 'year'
    ? Array.from({length:12}, (_,m) => new Date(anchor.getFullYear(), m, 1))
    : days

  function blocksFor(vehicleId) {
    const s0 = days[0], s1 = days[days.length - 1]
    return contracts.filter(c =>
      c.vehicleId === vehicleId &&
      new Date(c.startDate) <= s1 &&
      new Date(c.endDate || c.startDate) >= s0
    )
  }

  function pos(c) {
    const MS = 86400000, origin = days[0].getTime(), span = days.length * MS
    const s = Math.max(new Date(c.startDate).getTime(), origin)
    const e = Math.min(new Date(c.endDate || c.startDate).getTime() + MS, origin + span)
    return {
      left:  ((s - origin) / span * 100).toFixed(2) + '%',
      width: (Math.max(e - s, MS * 0.4) / span * 100).toFixed(2) + '%',
    }
  }

  return (
    <div style={{ padding:24, color:'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:700, letterSpacing:'-0.02em' }}>{t('calendar.title')}</h1>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setAnchor(advance(anchor,zoom,-1))} style={NAV_BTN}>&#8249;</button>
          <span style={{ fontSize:14, fontWeight:600, minWidth:190, textAlign:'center' }}>
            {periodLabel(anchor, zoom)}
          </span>
          <button onClick={() => setAnchor(advance(anchor,zoom,1))} style={NAV_BTN}>&#8250;</button>
          <button onClick={() => setAnchor(startOf(new Date(), zoom))} style={{ ...NAV_BTN, width:'auto', padding:'0 14px', borderRadius:99, fontSize:12 }}>
            {t('calendar.today')}
          </button>
        </div>

        {/* Zoom selector */}
        <div style={{ display:'flex', gap:3, background:'var(--bg-secondary)', padding:3, borderRadius:10 }}>
          {[['week', t('calendar.week')],['month', t('calendar.month')],['year', t('calendar.year')]].map(([z,label]) => (
            <button key={z} onClick={() => { setZoom(z); setAnchor(startOf(new Date(), z)) }} style={{
              padding:'5px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: zoom===z ? 'var(--bg-primary)' : 'transparent',
              color: zoom===z ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: zoom===z ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {/* Vehicle filter */}
        <select value={vehicle} onChange={e => setVehicle(e.target.value)} style={{
          background:'var(--bg-secondary)', border:'1px solid var(--border)',
          borderRadius:8, padding:'6px 12px', fontSize:13, color:'var(--text-primary)', cursor:'pointer',
        }}>
          <option value="all">{t('calendar.allVehicles')}</option>
          {fleet.map(v => (
            <option key={v.id} value={v.id}>{v.make} {v.model}{v.plate ? ' · '+v.plate : ''}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ padding:60, textAlign:'center', color:'var(--text-secondary)' }}>{t('loading')}</div>
      )}

      {!loading && (
        <>
          <div style={{ background:'var(--bg-secondary)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden' }}>

            {/* Column headers */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--bg-primary)' }}>
              <div style={{ width:VW, minWidth:VW, borderRight:'1px solid var(--border)' }} />
              <div style={{ flex:1, display:'flex' }}>
                {cols.map((d, i) => {
                  const isToday = zoom !== 'year' && d.toDateString() === new Date().toDateString()
                  const label   = zoom === 'year'
                    ? d.toLocaleDateString('fr-MA',{month:'short'})
                    : dayLabel(d, zoom)
                  return (
                    <div key={i} style={{
                      flex:1, textAlign:'center', padding:'7px 1px', fontSize:11, overflow:'hidden',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? '#CF4500' : 'var(--text-secondary)',
                      borderRight: i < cols.length-1 ? '1px solid var(--border)' : 'none',
                      background: isToday ? 'rgba(207,69,0,0.06)' : 'transparent',
                    }}>{label}</div>
                  )
                })}
              </div>
            </div>

            {/* Vehicle rows */}
            {rows.length === 0 && (
              <div style={{ padding:40, textAlign:'center', color:'var(--text-secondary)', fontSize:14 }}>
                {t('calendar.noFleet')}
              </div>
            )}
            {rows.map((v, vi) => (
              <div key={v.id} style={{ display:'flex', borderBottom: vi < rows.length-1 ? '1px solid var(--border)' : 'none', minHeight:54 }}>
                <div style={{ width:VW, minWidth:VW, padding:'10px 14px', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                  <span style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.make} {v.model}</span>
                  {v.plate && <span style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>{v.plate}</span>}
                </div>
                <div style={{ flex:1, position:'relative', minHeight:54 }}>
                  {/* Grid lines */}
                  <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none' }}>
                    {cols.map((_,i) => <div key={i} style={{ flex:1, borderRight: i < cols.length-1 ? '1px solid rgba(128,128,128,0.15)' : 'none' }} />)}
                  </div>
                  {/* Booking pills */}
                  {blocksFor(v.id).map(c => {
                    const p = pos(c), col = palette(c)
                    return (
                      <div key={c.id}
                        title={[c.contractNumber, c.startDate, c.endDate].filter(Boolean).join(' · ')}
                        style={{
                          position:'absolute', top:'50%', transform:'translateY(-50%)',
                          left:p.left, width:p.width, height:28, borderRadius:99,
                          background:col.bg, border:'1.5px solid '+col.border,
                          display:'flex', alignItems:'center', padding:'0 10px',
                          overflow:'hidden', boxSizing:'border-box', zIndex:1, cursor:'default',
                        }}>
                        <span style={{ fontSize:11, fontWeight:600, color:col.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {c.contractNumber || ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginTop:14, flexWrap:'wrap' }}>
            {[[t('status.inProgress'), PALETTE.active],[t('status.closed'), PALETTE.closed],[t('status.late'), PALETTE.late]].map(([label, col]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
                <div style={{ width:22, height:10, borderRadius:99, background:col.bg, border:'1.5px solid '+col.border }} />
                {label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
