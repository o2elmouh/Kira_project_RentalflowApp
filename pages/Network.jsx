/**
 * RentalFlow Network — Cross-Agency B2B Car Sharing
 *
 * Tabs:
 *   Search   — find available cars on the network (masked DTO)
 *   Outgoing — requests I sent
 *   Incoming — requests for my cars (admin: approve / reject)
 */

import { useState, useEffect, useContext } from 'react'
import { Globe, Search, ArrowUpRight, ArrowDownLeft, Eye, Check, X, Loader2, Car, Calendar, MapPin, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { UserContext } from '../lib/UserContext'

// ─── Status badge ─────────────────────────────────────────────
const STATUS_COLORS = {
  PENDING:   'bg-yellow-500/20 text-yellow-300',
  APPROVED:  'bg-green-500/20 text-green-300',
  REJECTED:  'bg-red-500/20 text-red-300',
  COMPLETED: 'bg-blue-500/20 text-blue-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  )
}

// ─── Masked car card ──────────────────────────────────────────
function CarCard({ car, onRequest }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
      {car.image_url?.[0] && (
        <img src={car.image_url[0]} alt={`${car.brand} ${car.model}`}
          className="w-full h-36 object-cover rounded-lg" />
      )}
      <div>
        <p className="font-semibold text-white">{car.brand} {car.model} <span className="text-gray-400 font-normal">{car.year}</span></p>
        <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
          <MapPin size={12} /> {car.city ?? '—'}
        </p>
      </div>
      <div className="flex gap-3 text-sm text-gray-300">
        <span className="flex items-center gap-1"><Zap size={12} /> {car.transmission}</span>
        <span className="flex items-center gap-1"><Car size={12} /> {car.fuel_type}</span>
        <span>{car.seats} seats</span>
      </div>
      <p className="text-lg font-bold text-white">
        {car.network_daily_price != null ? `${car.network_daily_price} MAD/day` : 'Price on request'}
      </p>
      <button
        onClick={() => onRequest(car)}
        className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Request this car
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Request {car.brand} {car.model}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required min={startDate}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          {days > 0 && car.network_daily_price && (
            <p className="text-sm text-green-400 font-medium">
              Estimated total: {(days * car.network_daily_price).toFixed(2)} MAD ({days} days)
            </p>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any specific requirements..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
          </div>
          <div className="text-xs text-gray-500">
            Your end-customer details are never shared with the car owner.
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Send Request
          </button>
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold flex items-center gap-2"><Eye size={16} /> Handover Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="bg-gray-700/50 rounded-lg p-3 space-y-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Vehicle</p>
            <p className="text-white font-medium">{vehicle.brand} {vehicle.model} {vehicle.year}</p>
            <p className="text-gray-300">Plate: <span className="font-mono text-yellow-300">{vehicle.plate_number}</span></p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3 space-y-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Owner Agency</p>
            <p className="text-white font-medium">{vehicle.agency_name}</p>
            {vehicle.agency_phone && <p className="text-gray-300">{vehicle.agency_phone}</p>}
            {vehicle.agency_email && <p className="text-gray-300">{vehicle.agency_email}</p>}
            {vehicle.agency_city  && <p className="text-gray-300">{vehicle.agency_city}</p>}
            {vehicle.agency_address && <p className="text-gray-300">{vehicle.agency_address}</p>}
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3 space-y-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Booking</p>
            <p className="text-gray-300">{request.start_date} → {request.end_date}</p>
            {request.agreed_price && <p className="text-white font-semibold">{request.agreed_price} MAD total</p>}
            {request.owner_notes && <p className="text-gray-400 italic">"{request.owner_notes}"</p>}
          </div>
        </div>
        <button onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">
          Close
        </button>
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
  const [loading, setLoading]     = useState(false)
  const [reqLoading, setReqLoading]   = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (tab === 'outgoing') loadOutgoing()
    if (tab === 'incoming') loadIncoming()
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

  async function loadIncoming() {
    try {
      const { requests } = await api.network.getIncoming()
      setIncoming(requests ?? [])
    } catch { /* silent */ }
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
    { id: 'search',   label: 'Search',   icon: Search },
    { id: 'outgoing', label: 'Outgoing', icon: ArrowUpRight },
    { id: 'incoming', label: 'Incoming', icon: ArrowDownLeft },
  ]

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Globe className="text-blue-400" size={24} />
          <div>
            <h1 className="page-title">RentalFlow Network</h1>
            <p className="page-subtitle text-sm text-gray-400">Borrow vehicles from partner agencies</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-800 rounded-xl w-fit mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline">dismiss</button>
        </div>
      )}

      {/* ── Search tab ── */}
      {tab === 'search' && (
        <div>
          <form onSubmit={handleSearch} className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start date *</label>
              <input type="date" required value={searchParams.startDate}
                onChange={e => setSearch(s => ({ ...s, startDate: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End date *</label>
              <input type="date" required value={searchParams.endDate} min={searchParams.startDate}
                onChange={e => setSearch(s => ({ ...s, endDate: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">City</label>
              <input type="text" placeholder="e.g. Casablanca" value={searchParams.city}
                onChange={e => setSearch(s => ({ ...s, city: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-40" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Transmission</label>
              <select value={searchParams.transmission}
                onChange={e => setSearch(s => ({ ...s, transmission: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="">Any</option>
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </select>
            </div>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Search
            </button>
          </form>

          {results.length === 0 && !loading && (
            <p className="text-gray-500 text-sm text-center py-12">
              Search above to find available vehicles from other agencies.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {results.map(car => (
              <CarCard key={car.id} car={car} onRequest={setReqTarget} />
            ))}
          </div>
        </div>
      )}

      {/* ── Outgoing tab ── */}
      {tab === 'outgoing' && (
        <div className="space-y-3">
          {outgoing.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-12">No outgoing requests yet.</p>
          )}
          {outgoing.map(r => (
            <div key={r.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">
                  {r.vehicles?.brand} {r.vehicles?.model} {r.vehicles?.year}
                </p>
                <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                  <Calendar size={12} /> {r.start_date} → {r.end_date}
                </p>
                {r.agreed_price && (
                  <p className="text-sm text-gray-300 mt-0.5">{r.agreed_price} MAD</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                {['APPROVED', 'COMPLETED'].includes(r.status) && (
                  <button onClick={() => handleReveal(r.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs font-medium transition-colors">
                    <Eye size={13} /> Reveal
                  </button>
                )}
                {r.status === 'PENDING' && (
                  <button onClick={() => api.network.updateStatus(r.id, { status: 'CANCELLED' }).then(loadOutgoing)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Incoming tab ── */}
      {tab === 'incoming' && (
        <div className="space-y-3">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
              Only agency admins can approve or reject incoming requests.
            </div>
          )}
          {incoming.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-12">No incoming requests for your fleet.</p>
          )}
          {incoming.map(r => (
            <div key={r.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">
                  {r.vehicle?.brand} {r.vehicle?.model} {r.vehicle?.year}
                </p>
                <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                  <Calendar size={12} /> {r.start_date} → {r.end_date}
                </p>
                {r.agreed_price && (
                  <p className="text-sm text-gray-300 mt-0.5">{r.agreed_price} MAD</p>
                )}
                {r.requester_notes && (
                  <p className="text-xs text-gray-500 italic mt-1">"{r.requester_notes}"</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {isAdmin && r.status === 'PENDING' && (
                  <>
                    <button onClick={() => handleStatusUpdate(r.id, 'APPROVED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs font-medium transition-colors">
                      <Check size={13} /> Approve
                    </button>
                    <button onClick={() => handleStatusUpdate(r.id, 'REJECTED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-medium transition-colors">
                      <X size={13} /> Reject
                    </button>
                  </>
                )}
                {isAdmin && r.status === 'APPROVED' && (
                  <>
                    <button onClick={() => handleReveal(r.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-medium transition-colors">
                      <Eye size={13} /> Details
                    </button>
                    <button onClick={() => handleStatusUpdate(r.id, 'COMPLETED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors">
                      Complete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
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
