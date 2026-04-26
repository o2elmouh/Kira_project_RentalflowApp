/**
 * RentalFlow Network — Cross-Agency B2B Car Sharing
 * UI follows the same design system as NewRental / RentalStep.
 */

import { useState, useEffect, useRef, useContext } from 'react'
import { Globe, Search, ArrowUpRight, ArrowDownLeft, Eye, Check, X, Loader2, Calendar, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { UserContext } from '../lib/UserContext'

// ─── Status badge ─────────────────────────────────────────────
const STATUS_BADGE = {
  PENDING:   'badge badge-orange',
  APPROVED:  'badge badge-green',
  REJECTED:  'badge badge-red',
  COMPLETED: 'badge badge-blue',
  CANCELLED: 'badge badge-gray',
}

function StatusBadge({ status }) {
  return <span className={STATUS_BADGE[status] ?? 'badge badge-gray'}>{status}</span>
}

// ─── Masked car card (network search result) ──────────────────
function CarCard({ car, onRequest }) {
  return (
    <div className="vehicle-card" style={{ cursor: 'default' }}>
      {car.image_url?.[0] && (
        <img src={car.image_url[0]} alt={`${car.brand} ${car.model}`}
          style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
      )}
      <div className="vehicle-plate">
        {car.city ?? '—'}
      </div>
      <div className="vehicle-name">{car.brand} {car.model} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>{car.year}</span></div>
      <div className="vehicle-meta">{car.transmission} · {car.fuel_type} · {car.seats} seats</div>
      <div className="vehicle-status">
        <span style={{ fontFamily: 'DM Mono', fontWeight: 600, color: 'var(--accent)', fontSize: 13 }}>
          {car.network_daily_price != null ? `${car.network_daily_price} MAD/day` : 'On request'}
        </span>
      </div>
      <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 12 }}
        onClick={() => onRequest(car)}>
        Request
      </button>
    </div>
  )
}

// ─── Request modal ────────────────────────────────────────────
function RequestModal({ car, onClose, onSubmit, loading }) {
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [notes,     setNotes]     = useState('')

  const days = startDate && endDate
    ? Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)
    : 0

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({ vehicle_id: car.id, start_date: startDate, end_date: endDate, requester_notes: notes || undefined })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'var(--text1)' }}>Request — {car.brand} {car.model}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row cols-2">
            <div className="form-group">
              <label className="form-label">Start date *</label>
              <input className="form-input" type="date" required value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">End date *</label>
              <input className="form-input" type="date" required value={endDate} min={startDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {days > 0 && car.network_daily_price && (
            <div className="alert alert-success" style={{ marginBottom: 14 }}>
              <Check size={13} />
              <span>{days} days — estimated total: <strong>{(days * car.network_daily_price).toFixed(2)} MAD</strong></span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" rows={2} value={notes}
              placeholder="Any specific requirements…"
              onChange={e => setNotes(e.target.value)}
              style={{ resize: 'none' }} />
          </div>

          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
            Your end-customer details are never shared with the car owner.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              Send Request
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reveal modal ─────────────────────────────────────────────
function RevealModal({ data, onClose }) {
  if (!data) return null
  const { request, vehicle } = data
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={16} /> Handover Details
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Vehicle</p>
            <p style={{ fontWeight: 700, color: 'var(--text1)', margin: '0 0 4px' }}>{vehicle.brand} {vehicle.model} {vehicle.year}</p>
            <span className="vehicle-plate">{vehicle.plate_number}</span>
          </div>

          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Owner Agency</p>
            <p style={{ fontWeight: 700, color: 'var(--text1)', margin: '0 0 4px' }}>{vehicle.agency_name}</p>
            {vehicle.agency_phone   && <p style={{ fontSize: 13, color: 'var(--text2)', margin: '2px 0' }}>{vehicle.agency_phone}</p>}
            {vehicle.agency_email   && <p style={{ fontSize: 13, color: 'var(--text2)', margin: '2px 0' }}>{vehicle.agency_email}</p>}
            {vehicle.agency_city    && <p style={{ fontSize: 13, color: 'var(--text2)', margin: '2px 0' }}>{vehicle.agency_city}</p>}
            {vehicle.agency_address && <p style={{ fontSize: 13, color: 'var(--text2)', margin: '2px 0' }}>{vehicle.agency_address}</p>}
          </div>

          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Booking</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '2px 0' }}>{request.start_date} → {request.end_date}</p>
            {request.agreed_price && <p style={{ fontWeight: 700, color: 'var(--text1)', margin: '4px 0 0' }}>{request.agreed_price} MAD total</p>}
            {request.owner_notes  && <p style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginTop: 6 }}>"{request.owner_notes}"</p>}
          </div>
        </div>

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 18 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function Network() {
  const { profile } = useContext(UserContext)
  const isAdmin = profile?.role === 'admin'

  const [tab, setTab]             = useState('search')
  const [searchParams, setSearch] = useState({ startDate: '', endDate: '', city: '', transmission: '' })
  const [results, setResults]     = useState([])
  const [outgoing, setOutgoing]   = useState([])
  const [incoming, setIncoming]   = useState([])
  const [requestTarget, setReqTarget] = useState(null)
  const [revealData, setRevealData]   = useState(null)
  const [loading, setLoading]         = useState(false)
  const [reqLoading, setReqLoading]   = useState(false)
  const [error, setError]             = useState('')
  const [refreshing, setRefreshing]   = useState(false)

  const incomingRefreshRef = useRef(null)

  useEffect(() => {
    if (tab === 'outgoing') loadOutgoing()
    if (tab === 'incoming') {
      loadIncoming()
      // Subscribe to real-time inserts on cross_agency_requests for this agency
      const channel = supabase
        .channel('network-incoming')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'cross_agency_requests',
        }, () => loadIncoming())
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'cross_agency_requests',
        }, () => loadIncoming())
        .subscribe()
      incomingRefreshRef.current = channel
    }
    return () => {
      if (incomingRefreshRef.current) {
        supabase.removeChannel(incomingRefreshRef.current)
        incomingRefreshRef.current = null
      }
    }
  }, [tab])

  async function handleSearch(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v))
      const { results: r } = await api.network.search(params)
      setResults(r ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadOutgoing() {
    try {
      const { requests } = await api.network.getOutgoing()
      setOutgoing(requests ?? [])
    } catch { /* silent */ }
  }

  async function loadIncoming(showSpinner = false) {
    if (showSpinner) setRefreshing(true)
    try {
      const { requests } = await api.network.getIncoming()
      setIncoming(requests ?? [])
    } catch { /* silent */ } finally {
      if (showSpinner) setRefreshing(false)
    }
  }

  async function handleCreateRequest(body) {
    setReqLoading(true)
    try {
      await api.network.createRequest(body)
      setReqTarget(null)
      setTab('outgoing')
      loadOutgoing()
    } catch (err) {
      setError(err.message)
    } finally {
      setReqLoading(false)
    }
  }

  async function handleStatusUpdate(id, status) {
    try {
      await api.network.updateStatus(id, { status })
      loadIncoming()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleReveal(id) {
    try {
      const data = await api.network.reveal(id)
      setRevealData(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const TABS = [
    { id: 'search',   label: 'Search Network', icon: Search },
    { id: 'outgoing', label: 'My Requests',     icon: ArrowUpRight },
    { id: 'incoming', label: 'Incoming',         icon: ArrowDownLeft },
  ]

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Globe size={22} color="var(--accent)" />
          <div>
            <h2>RentalFlow Network</h2>
            <p>Borrow vehicles from partner agencies when your fleet is full</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', border: 'none', background: 'none',
                fontSize: 13, fontWeight: tab === id ? 600 : 400, cursor: 'pointer',
                color: tab === id ? 'var(--accent)' : 'var(--text2)',
                borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <X size={13} />
            <span>{error}</span>
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 11, textDecoration: 'underline' }}
              onClick={() => setError('')}>dismiss</button>
          </div>
        )}

        {/* ════════════════════════════════════════
            Search tab
        ════════════════════════════════════════ */}
        {tab === 'search' && (
          <div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header"><h3>Search available vehicles</h3></div>
              <div className="card-body">
                <form onSubmit={handleSearch}>
                  <div className="form-row cols-3">
                    <div className="form-group">
                      <label className="form-label">Start date *</label>
                      <input className="form-input" type="date" required value={searchParams.startDate}
                        onChange={e => setSearch(s => ({ ...s, startDate: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End date *</label>
                      <input className="form-input" type="date" required value={searchParams.endDate} min={searchParams.startDate}
                        onChange={e => setSearch(s => ({ ...s, endDate: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input className="form-input" type="text" placeholder="e.g. Casablanca" value={searchParams.city}
                        onChange={e => setSearch(s => ({ ...s, city: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row cols-3">
                    <div className="form-group">
                      <label className="form-label">Transmission</label>
                      <select className="form-select" value={searchParams.transmission}
                        onChange={e => setSearch(s => ({ ...s, transmission: e.target.value }))}>
                        <option value="">Any</option>
                        <option value="manual">Manual</option>
                        <option value="automatic">Automatic</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading
                        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Search size={13} />}
                      Search
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {results.length === 0 && !loading && (
              <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>
                Enter dates above to find vehicles from other agencies.
              </p>
            )}

            {results.length > 0 && (
              <div className="fleet-grid">
                {results.map(car => (
                  <CarCard key={car.id} car={car} onRequest={setReqTarget} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            Outgoing requests
        ════════════════════════════════════════ */}
        {tab === 'outgoing' && (
          <div>
            {outgoing.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>
                No outgoing requests yet. Search the network to request a vehicle.
              </p>
            ) : (
              <div className="card">
                <div className="card-header"><h3>My Requests</h3></div>
                <div style={{ padding: 0 }}>
                  {outgoing.map((r, i) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                      borderBottom: i < outgoing.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text1)', margin: '0 0 3px', fontSize: 14 }}>
                          {r.vehicles?.brand} {r.vehicles?.model} {r.vehicles?.year}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} /> {r.start_date} → {r.end_date}
                          {r.agreed_price && <span style={{ marginLeft: 8, fontFamily: 'DM Mono', color: 'var(--accent)' }}>{r.agreed_price} MAD</span>}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <StatusBadge status={r.status} />
                        {['APPROVED', 'COMPLETED'].includes(r.status) && (
                          <button className="btn btn-secondary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                            onClick={() => handleReveal(r.id)}>
                            <Eye size={12} /> Reveal
                          </button>
                        )}
                        {r.status === 'PENDING' && (
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => api.network.updateStatus(r.id, { status: 'CANCELLED' }).then(loadOutgoing)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            Incoming requests
        ════════════════════════════════════════ */}
        {tab === 'incoming' && (
          <div>
            {!isAdmin && (
              <div className="alert alert-warn" style={{ marginBottom: 16 }}>
                Only agency admins can approve or reject incoming requests.
              </div>
            )}

            {incoming.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>
                No incoming requests for your fleet yet.
              </p>
            ) : (
              <div className="card">
                <div className="card-header">
                <h3>Incoming Requests</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => loadIncoming(true)}
                  disabled={refreshing}
                >
                  <RefreshCw size={12} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
                  Actualiser
                </button>
              </div>
                <div style={{ padding: 0 }}>
                  {incoming.map((r, i) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                      borderBottom: i < incoming.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text1)', margin: '0 0 3px', fontSize: 14 }}>
                          {r.vehicle?.brand} {r.vehicle?.model} {r.vehicle?.year}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} /> {r.start_date} → {r.end_date}
                          {r.agreed_price && <span style={{ marginLeft: 8, fontFamily: 'DM Mono', color: 'var(--accent)' }}>{r.agreed_price} MAD</span>}
                        </p>
                        {r.requester_notes && (
                          <p style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', margin: '4px 0 0' }}>"{r.requester_notes}"</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <StatusBadge status={r.status} />
                        {isAdmin && r.status === 'PENDING' && (
                          <>
                            <button className="btn btn-primary btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleStatusUpdate(r.id, 'APPROVED')}>
                              <Check size={12} /> Approve
                            </button>
                            <button className="btn btn-ghost btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c62828', borderColor: '#fce4ec' }}
                              onClick={() => handleStatusUpdate(r.id, 'REJECTED')}>
                              <X size={12} /> Reject
                            </button>
                          </>
                        )}
                        {isAdmin && r.status === 'APPROVED' && (
                          <>
                            <button className="btn btn-secondary btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleReveal(r.id)}>
                              <Eye size={12} /> Details
                            </button>
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => handleStatusUpdate(r.id, 'COMPLETED')}>
                              Complete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {requestTarget && (
        <RequestModal
          car={requestTarget}
          loading={reqLoading}
          onClose={() => setReqTarget(null)}
          onSubmit={handleCreateRequest}
        />
      )}
      {revealData && <RevealModal data={revealData} onClose={() => setRevealData(null)} />}
    </div>
  )
}
