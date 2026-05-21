import { useState } from 'react'
import { api } from '../lib/api.js'
import SmartQuotePanel from './SmartQuotePanel.jsx'
import { formatPhone } from '../utils/phoneFormat.js'

const CONF_COLOR = (score) => {
  if (score == null) return 'var(--text-secondary)'
  if (score >= 0.85) return '#22c55e'
  if (score >= 0.7)  return '#f59e0b'
  return '#ef4444'
}

// ── Confidence badge ───────────────────────────────────────
function ConfBadge({ score }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: CONF_COLOR(score),
      marginLeft: 6,
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 4,
      padding: '1px 5px',
    }}>
      {pct}%
    </span>
  )
}

// ── Editable field row ─────────────────────────────────────
function FieldRow({ label, fieldKey, value, confidence, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        {label}
        <ConfBadge score={confidence} />
      </label>
      <input
        value={value || ''}
        onChange={e => onChange(fieldKey, e.target.value)}
        style={{
          width: '100%',
          background: 'var(--bg-secondary)',
          border: `1px solid ${confidence != null && confidence < 0.8 ? '#f59e0b44' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '6px 10px',
          color: 'var(--text-primary)',
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Comparison modal ───────────────────────────────────────
export default function LeadModal({ lead, onClose, onConvert, onStatusChange }) {
  const [extracted, setExtracted] = useState(lead.extracted_data || {})
  const [saving, setSaving] = useState(false)
  const [ignoring, setIgnoring] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState(null)
  const [localStatus, setLocalStatus] = useState(lead.status)

  const conf = lead.confidence_scores || {}

  function handleChange(key, val) {
    setExtracted(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.updateLeadExtracted(lead.id, extracted)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const images = (lead.media_urls || [])
    .filter(u => u.startsWith('http') || u.startsWith('data:image/'))
    .map(u => u.startsWith('data:') ? u : `${API_URL}/leads/media?url=${encodeURIComponent(u)}`)

  const SOURCE_LABELS = { whatsapp: 'WhatsApp', gmail: 'Gmail' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        width: '100%',
        maxWidth: 900,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontWeight: 600 }}>
              {(extracted.firstName || extracted.lastName)
                ? `${extracted.firstName || ''} ${extracted.lastName || ''}`.trim()
                : formatPhone(lead.sender_id)}
            </span>
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {SOURCE_LABELS[lead.source] || lead.source} · {formatPhone(lead.sender_id)}
            </span>
            {lead.match_score && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b', background: '#f59e0b22', borderRadius: 4, padding: '2px 6px' }}>
                Correspondance probable ({Math.round(lead.match_score * 100)}%)
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left — images */}
          <div style={{ flex: 1, padding: 20, overflow: 'auto', borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            {images.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                Aucune image jointe
              </div>
            ) : images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Document ${i + 1}`}
                style={{ width: '100%', borderRadius: 8, marginBottom: 12, border: '1px solid var(--border)' }}
              />
            ))}
          </div>

          {/* Right — fields */}
          <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
              Données extraites par IA
            </div>

            {extracted.classification ? (
              /* ── Routing lead (text / audio) ── */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 10px',
                    background: extracted.classification === 'new_lead' ? 'rgba(34,197,94,0.12)' : extracted.classification === 'prolongation' ? 'rgba(59,130,246,0.12)' : extracted.classification === 'support_issue' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
                    color: extracted.classification === 'new_lead' ? '#16a34a' : extracted.classification === 'prolongation' ? '#2563eb' : extracted.classification === 'support_issue' ? '#dc2626' : '#64748b',
                  }}>
                    {extracted.classification === 'new_lead' ? 'Nouveau lead' : extracted.classification === 'prolongation' ? 'Prolongation' : extracted.classification === 'support_issue' ? 'Incident' : 'Autre'}
                  </span>
                  {extracted.confidence != null && <ConfBadge score={extracted.confidence} />}
                </div>

                {extracted.summary_for_agent && (
                  <div style={{ marginBottom: 16, padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {extracted.summary_for_agent}
                  </div>
                )}

                {extracted.requested_car && (
                  <FieldRow label="Véhicule demandé" fieldKey="requested_car" value={extracted.requested_car} confidence={null} onChange={handleChange} />
                )}
                {extracted.start_date && (
                  <FieldRow label="Date de début" fieldKey="start_date" value={extracted.start_date} confidence={null} onChange={handleChange} />
                )}
                {extracted.end_date && (
                  <FieldRow label="Date de fin" fieldKey="end_date" value={extracted.end_date} confidence={null} onChange={handleChange} />
                )}
                {extracted.pickup_location && (
                  <FieldRow label="Lieu de récupération" fieldKey="pickup_location" value={extracted.pickup_location} confidence={null} onChange={handleChange} />
                )}
                {extracted.return_location && (
                  <FieldRow label="Lieu de retour" fieldKey="return_location" value={extracted.return_location} confidence={null} onChange={handleChange} />
                )}
                {extracted.requested_extra_days != null && (
                  <FieldRow label="Jours supplémentaires" fieldKey="requested_extra_days" value={String(extracted.requested_extra_days)} confidence={null} onChange={handleChange} />
                )}
              </div>
            ) : (
              /* ── OCR lead (document image) ── */
              <div>
                <FieldRow label="Prénom"          fieldKey="firstName"      value={extracted.firstName}      confidence={conf.firstName}      onChange={handleChange} />
                <FieldRow label="Nom"             fieldKey="lastName"       value={extracted.lastName}       confidence={conf.lastName}       onChange={handleChange} />
                <FieldRow label="N° Document"     fieldKey="documentNumber" value={extracted.documentNumber} confidence={conf.documentNumber} onChange={handleChange} />
                <FieldRow label="Date de naissance" fieldKey="dateOfBirth"  value={extracted.dateOfBirth}    confidence={conf.dateOfBirth}    onChange={handleChange} />
                <FieldRow label="Expiration"      fieldKey="expiryDate"     value={extracted.expiryDate}     confidence={conf.expiryDate}     onChange={handleChange} />
                <FieldRow label="Type de doc"     fieldKey="documentType"   value={extracted.documentType}   confidence={null}                onChange={handleChange} />
                <FieldRow label="Pays émetteur"   fieldKey="issuingCountry" value={extracted.issuingCountry} confidence={null}                onChange={handleChange} />

                {extracted.rentalIntent?.detected && (
                  <div style={{ marginTop: 16, padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>Intention de location détectée</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {extracted.rentalIntent.startDate && <span>Du {extracted.rentalIntent.startDate} </span>}
                      {extracted.rentalIntent.endDate   && <span>au {extracted.rentalIntent.endDate} </span>}
                      {extracted.rentalIntent.vehicleClass && <span>· {extracted.rentalIntent.vehicleClass}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Smart Quote panel — shown when status is waiting or offer_sent */}
            {(localStatus === 'waiting' || localStatus === 'offer_sent') && (
              <SmartQuotePanel
                lead={{ ...lead, status: localStatus }}
                onSent={() => setLocalStatus('offer_sent')}
              />
            )}

            {/* Accepted badge */}
            {localStatus === 'accepted' && (
              <div style={{ marginTop: 20, padding: 14, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                ✅ Le client a accepté l'offre — vous pouvez convertir en contrat.
                {lead.last_client_note && (
                  <div style={{ fontWeight: 400, marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Réponse : « {lead.last_client_note} »
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={async () => { setIgnoring(true); await onStatusChange(lead.id, 'ignored'); setIgnoring(false) }}
            disabled={ignoring}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: ignoring ? 'not-allowed' : 'pointer', fontSize: 13, opacity: ignoring ? 0.6 : 1 }}
          >
            {ignoring ? 'Suppression…' : 'Ignorer'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
          >
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
          {/* Préparer Devis — available for any pending lead (including escalated alerts) */}
          {localStatus === 'pending' && (
            <>
              {prepareError && (
                <div style={{ fontSize: 12, color: '#ef4444', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
                  {prepareError}
                </div>
              )}
              <button
                onClick={async () => {
                  setPreparing(true)
                  setPrepareError(null)
                  try {
                    await api.updateLeadStatus(lead.id, 'waiting')
                    setLocalStatus('waiting')
                  } catch (err) {
                    setPrepareError(err.message)
                  } finally {
                    setPreparing(false)
                  }
                }}
                disabled={preparing}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#818cf8', cursor: preparing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {preparing ? 'Mise à jour…' : '💬 Préparer Devis'}
              </button>
            </>
          )}
          <button
            onClick={() => onConvert(lead, extracted)}
            style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
          >
            Convertir en contrat →
          </button>
        </div>
      </div>
    </div>
  )
}
