import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'

export default function SmartQuotePanel({ lead, onSent }) {
  const [vehicles, setVehicles]   = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [price, setPrice]         = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState(null)
  const [done, setDone]           = useState(lead.status === 'offer_sent')

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('id, make, model, license_plate')
      .eq('agency_id', lead.agency_id)
      .then(({ data }) => setVehicles(data || []))
  }, [lead.agency_id])

  async function handleSend() {
    if (!vehicleId || !price) return
    setSending(true)
    setError(null)
    try {
      const payload = { leadId: lead.id, vehicleId, priceTotal: parseFloat(price) }
      if (lead.source === 'gmail') {
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

  const channel = lead.source === 'gmail' ? 'email' : 'WhatsApp'

  if (done) {
    return (
      <div style={{ marginTop: 20, padding: 14, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#22c55e' }}>
        ✅ Offre envoyée au client via {channel}. En attente de sa réponse.
        {lead.offered_price_total && (
          <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>({lead.offered_price_total} MAD)</span>
        )}
      </div>
    )
  }

  const disabled = sending || !vehicleId || !price

  return (
    <div style={{ marginTop: 20, padding: 16, background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Devis Rapide
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Véhicule proposé</label>
        <select
          value={vehicleId}
          onChange={e => setVehicleId(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
        >
          <option value="">— Choisir un véhicule —</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>
              {`${v.make} ${v.model}`.trim()} {v.license_plate ? `(${v.license_plate})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Prix total (MAD)</label>
        <input
          type="number"
          min="0"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="Ex : 1500"
          style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</div>}
      <button
        onClick={handleSend}
        disabled={disabled}
        style={{
          width: '100%', padding: '9px 16px', borderRadius: 8,
          background: disabled ? 'var(--bg-secondary)' : '#22c55e',
          color: disabled ? 'var(--text-secondary)' : '#fff',
          border: 'none', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
        }}
      >
        {sending ? 'Envoi…' : lead.source === 'gmail' ? '✉️ Envoyer l\'Offre par Email' : '📲 Envoyer l\'Offre via WhatsApp'}
      </button>
    </div>
  )
}
