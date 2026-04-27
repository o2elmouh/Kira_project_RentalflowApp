import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { getAvailableVehicles } from '../lib/db.js'

export default function SmartQuotePanel({ lead, onSent }) {
  const [vehicles, setVehicles]   = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [price, setPrice]         = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [notes, setNotes]         = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState(null)
  const [done, setDone]           = useState(lead.status === 'offer_sent')

  const isEmail = lead.source === 'gmail'
  const canSend = vehicleId && price && startDate && endDate && !sending

  useEffect(() => {
    getAvailableVehicles(startDate || null, endDate || null)
      .then(data => setVehicles(data || []))
      .catch(() => setVehicles([]))
  }, [startDate, endDate])

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const payload = {
        leadId: lead.id,
        vehicleId,
        priceTotal: parseFloat(price),
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      }
      if (isEmail) {
        await api.sendQuoteOfferEmail(payload)
      } else {
        await api.sendQuoteOffer(payload)
      }
      setDone(true)
      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const inputStyle = { width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }
  const labelStyle = { fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }

  if (done) {
    const channel = isEmail ? 'Email' : 'WhatsApp'
    return (
      <div style={{ marginTop: 20, padding: 14, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#22c55e' }}>
        ✅ Offre envoyée au client via {channel}. En attente de sa réponse.
        {lead.offered_price_total && (
          <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>({lead.offered_price_total} MAD)</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20, padding: 16, background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Devis Rapide
      </div>

      {/* Vehicle — available only */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Véhicule disponible</label>
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={inputStyle}>
          <option value="">— Choisir un véhicule —</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>
              {v.name || `${v.make} ${v.model}`.trim()} {v.license_plate ? `(${v.license_plate})` : ''}
            </option>
          ))}
        </select>
        {vehicles.length === 0 && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠ Aucun véhicule disponible actuellement</div>
        )}
      </div>

      {/* Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Date de début</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Date de fin</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} style={inputStyle} />
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Prix total (MAD)</label>
        <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex : 1500" style={inputStyle} />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Détails supplémentaires (optionnel)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ex : Kilométrage illimité, livraison incluse…"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</div>}

      <button
        onClick={handleSend}
        disabled={!canSend}
        style={{
          width: '100%', padding: '9px 16px', borderRadius: 8,
          background: canSend ? '#22c55e' : 'var(--bg-secondary)',
          color: canSend ? '#fff' : 'var(--text-secondary)',
          border: 'none', fontWeight: 600,
          cursor: canSend ? 'pointer' : 'not-allowed', fontSize: 13,
        }}
      >
        {sending ? 'Envoi…' : isEmail ? '📧 Envoyer l\'Offre par Email' : '📲 Envoyer l\'Offre via WhatsApp'}
      </button>
    </div>
  )
}

