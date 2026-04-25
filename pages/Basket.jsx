/**
 * Basket of Cases — Premium feature
 * Lists inbound leads from WhatsApp/Gmail.
 * Opens a comparison modal: image(s) left, AI-extracted fields right.
 * "Convert to Rental" pre-fills the NewRental wizard.
 */
import { useState, useEffect, useCallback, useContext } from 'react'
import { api } from '../lib/api.js'
import AlertCard from '../components/AlertCard.jsx'
import { supabase } from '../lib/supabase.js'
import { UserContext } from '../lib/UserContext.js'

const STATUS_LABELS = {
  pending:    'En attente',
  waiting:    'Devis à préparer',
  offer_sent: 'Offre envoyée',
  accepted:   'Accepté',
  processed:  'Traité',
  ignored:    'Ignoré',
  converted:  'Converti',
}
const SOURCE_LABELS  = { whatsapp: 'WhatsApp', gmail: 'Gmail' }

// Strip WhatsApp JID suffix: "212XXXXXXX@s.whatsapp.net" → "212XXXXXXX"
function formatSenderId(id) {
  return id ? id.replace(/@.*$/, '') : id
}

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

// ── Smart Quote panel ──────────────────────────────────────
function SmartQuotePanel({ lead, onSent }) {
  const [vehicles, setVehicles]   = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [price, setPrice]         = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState(null)
  const [done, setDone]           = useState(lead.status === 'offer_sent')

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('id, make, model, license_plate, name')
      .eq('agency_id', lead.agency_id)
      .then(({ data }) => setVehicles(data || []))
  }, [lead.agency_id])

  async function handleSend() {
    if (!vehicleId || !price) return
    setSending(true)
    setError(null)
    try {
      await api.sendQuoteOffer({ leadId: lead.id, vehicleId, priceTotal: parseFloat(price) })
      setDone(true)
      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 20, padding: 14, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#22c55e' }}>
        ✅ Offre envoyée au client via WhatsApp. En attente de sa réponse.
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
              {v.name || `${v.make} ${v.model}`.trim()} {v.license_plate ? `(${v.license_plate})` : ''}
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
        disabled={sending || !vehicleId || !price}
        style={{
          width: '100%', padding: '9px 16px', borderRadius: 8,
          background: sending || !vehicleId || !price ? 'var(--bg-secondary)' : '#22c55e',
          color: sending || !vehicleId || !price ? 'var(--text-secondary)' : '#fff',
          border: 'none', fontWeight: 600, cursor: sending || !vehicleId || !price ? 'not-allowed' : 'pointer', fontSize: 13,
        }}
      >
        {sending ? 'Envoi…' : '📲 Envoyer l\'Offre via WhatsApp'}
      </button>
    </div>
  )
}

// ── Comparison modal ───────────────────────────────────────
function LeadModal({ lead, onClose, onConvert, onStatusChange }) {
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
                : formatSenderId(lead.sender_id)}
            </span>
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {SOURCE_LABELS[lead.source] || lead.source} · {lead.sender_id}
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
          {/* Préparer Devis — available for pending/new_lead to queue a quote offer */}
          {localStatus === 'pending' && extracted.classification === 'new_lead' && (
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

// ── Lead card ──────────────────────────────────────────────
function LeadCard({ lead, onClick }) {
  const ex = lead.extracted_data || {}
  const hasName = ex.firstName || ex.lastName
  const date = new Date(lead.created_at).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: lead.source === 'whatsapp' ? '#22c55e' : '#3b82f6',
          background: lead.source === 'whatsapp' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
          borderRadius: 4,
          padding: '2px 7px',
        }}>
          {SOURCE_LABELS[lead.source]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{date}</span>
      </div>

      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {hasName ? `${ex.firstName || ''} ${ex.lastName || ''}`.trim() : formatSenderId(lead.sender_id)}
      </div>

      {ex.classification ? (
        /* ── Routing lead (text / audio) ── */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
              background: ex.classification === 'new_lead' ? 'rgba(34,197,94,0.12)' : ex.classification === 'prolongation' ? 'rgba(59,130,246,0.12)' : ex.classification === 'support_issue' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
              color: ex.classification === 'new_lead' ? '#16a34a' : ex.classification === 'prolongation' ? '#2563eb' : ex.classification === 'support_issue' ? '#dc2626' : '#64748b',
            }}>
              {ex.classification === 'new_lead' ? 'Nouveau lead' : ex.classification === 'prolongation' ? 'Prolongation' : ex.classification === 'support_issue' ? 'Incident' : 'Autre'}
            </span>
            {ex.confidence != null && <ConfBadge score={ex.confidence} />}
          </div>
          {ex.summary_for_agent && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {ex.summary_for_agent}
            </div>
          )}
          {ex.pickup_location && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              📍 {ex.pickup_location}
            </div>
          )}
          {ex.return_location && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              🏁 {ex.return_location}
            </div>
          )}
        </div>
      ) : (
        /* ── OCR lead (document image) ── */
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {ex.documentType && <span>{ex.documentType} · </span>}
          {ex.documentNumber && <span>{ex.documentNumber}</span>}
          {!ex.documentType && !ex.documentNumber && (
            lead.raw_payload?.body
              ? <span style={{ fontStyle: 'italic' }}>"{String(lead.raw_payload.body).slice(0, 80)}"</span>
              : <span>Aucun document extrait</span>
          )}
        </div>
      )}

      {lead.match_score && (
        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
          ⚠ Correspondance probable avec un dossier existant
        </div>
      )}

      {ex.rentalIntent?.detected && (
        <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>
          ✓ Intention de location détectée
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function Basket({ onNavigate, initialTab = null }) {
  const [leads, setLeads]           = useState([])
  const [alerts, setAlerts]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const { isPremium } = useContext(UserContext)
  const [activeTab, setActiveTab]   = useState(initialTab === 'alertes' ? 'alertes' : 'leads')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedLead, setSelectedLead] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'alertes') {
        const data = await api.getAlerts()
        setAlerts(data)
      } else {
        const data = await api.getLeads(statusFilter)
        setLeads(data)
      }
    } catch (err) {
      if (!err.message?.includes('PREMIUM_REQUIRED')) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [activeTab, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(id, status) {
    try {
      await api.updateLeadStatus(id, status)
      setLeads(prev => prev.filter(l => l.id !== id))
      setAlerts(prev => prev.filter(a => a.id !== id))
      setSelectedLead(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleEscalate(id) {
    await handleStatusChange(id, 'pending')
  }

  async function handleIgnoreAlert(id) {
    await handleStatusChange(id, 'ignored')
  }

  function handleConvert(lead, extractedData) {
    // Resolve ISO-3166 country code to French nationality label (matches useScannerFlow)
    const NATIONALITY_MAP = {
      MAR:'Marocain',FRA:'Français',ESP:'Espagnol',ITA:'Italien',DEU:'Allemand',
      GBR:'Britannique',BEL:'Belge',CHE:'Suisse',NLD:'Néerlandais',PRT:'Portugais',
      USA:'Américain',CAN:'Canadien',DZA:'Algérien',TUN:'Tunisien',LBY:'Libyen',
      EGY:'Égyptien',SAU:'Saoudien',ARE:'Émirati',QAT:'Qatarien',KWT:'Koweïtien',
      JOR:'Jordanien',LBN:'Libanais',TUR:'Turc',
    }
    const countryCode = (extractedData.issuingCountry || '').toUpperCase()
    const nationality = NATIONALITY_MAP[countryCode] || countryCode || 'Marocain'

    const prefill = {
      firstName:            extractedData.firstName || '',
      lastName:             extractedData.lastName  || '',
      cinNumber:            extractedData.documentNumber || '',   // key useScannerFlow expects
      cinExpiry:            extractedData.expiryDate  || '',      // key useScannerFlow expects
      dateOfBirth:          extractedData.dateOfBirth || '',
      nationality,                                                 // resolved label, not ISO code
      drivingLicenseNumber: '',
      licenseExpiry:        '',
      phone:                lead.source === 'whatsapp' ? lead.sender_id.replace('whatsapp:', '').replace(/@.*$/, '') : '',
      email:                lead.source === 'gmail'    ? lead.sender_id : '',
      rentalIntent: {
        detected: !!(extractedData.rentalIntent?.detected || extractedData.start_date || extractedData.end_date || extractedData.pickup_location || extractedData.return_location),
        startDate:      extractedData.rentalIntent?.startDate || extractedData.start_date || null,
        endDate:        extractedData.rentalIntent?.endDate   || extractedData.end_date   || null,
        vehicleClass:   extractedData.rentalIntent?.vehicleClass || extractedData.requested_car || null,
        pickupLocation: extractedData.pickup_location || null,
        returnLocation: extractedData.return_location || null,
      },
      leadId:               lead.id,
    }
    // Mark as processed then navigate
    api.updateLeadStatus(lead.id, 'processed').catch(() => {})
    onNavigate('new-rental', { prefilledLead: prefill })
  }

  // ── Upgrade wall ───────────────────────────────────────
  if (!isPremium) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ marginBottom: 8 }}>Fonctionnalité Premium</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 24px' }}>
          La Corbeille de Dossiers est disponible avec le plan Premium.
          Recevez et traitez automatiquement les demandes WhatsApp et Gmail.
        </p>
        <button
          onClick={() => onNavigate('settings')}
          style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          Voir les plans →
        </button>
      </div>
    )
  }

  const SUB_FILTERS = [
    ['pending', 'En attente'],
    ['waiting', 'Devis à préparer'],
    ['offer_sent', 'Offre envoyée'],
    ['accepted', 'Accepté'],
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Boîte de réception</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Demandes entrantes WhatsApp &amp; Gmail — extraction IA automatique
          </p>
        </div>
        <button
          onClick={load}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
        >
          ↻ Actualiser
        </button>
      </div>

      {/* Top-level tabs: Leads / Alertes */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('leads')}
          style={{
            padding: '6px 18px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeTab === 'leads' ? '#141413' : 'none',
            color: activeTab === 'leads' ? '#F3F0EE' : 'var(--text-secondary)',
          }}
        >
          Leads {leads.length > 0 && <span style={{ marginLeft: 6, background: '#F3F0EE', color: '#141413', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{leads.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('alertes')}
          style={{
            padding: '6px 18px', borderRadius: 20, border: '1px solid #f9c6a0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeTab === 'alertes' ? '#CF4500' : '#FEF0E8',
            color: activeTab === 'alertes' ? '#fff' : '#CF4500',
          }}
        >
          ⚠ Alertes {alerts.length > 0 && <span style={{ marginLeft: 6, background: activeTab === 'alertes' ? '#fff' : '#CF4500', color: activeTab === 'alertes' ? '#CF4500' : '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{alerts.length}</span>}
        </button>
      </div>

      {/* Sub-filters (Leads tab only) */}
      {activeTab === 'leads' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {SUB_FILTERS.map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)',
                background: statusFilter === val ? 'var(--accent)' : 'none',
                color: statusFilter === val ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 12,
                fontWeight: statusFilter === val ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 60 }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: '#ef4444', textAlign: 'center', marginTop: 60 }}>{error}</div>
      ) : activeTab === 'alertes' ? (
        alerts.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            Aucune alerte en attente — tout est sous contrôle
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onEscalate={handleEscalate}
                onIgnore={handleIgnoreAlert}
              />
            ))}
          </div>
        )
      ) : leads.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          Aucun dossier en attente
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
          ))}
        </div>
      )}

      {/* Modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onConvert={handleConvert}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
