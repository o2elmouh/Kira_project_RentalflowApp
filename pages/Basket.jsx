/**
 * Basket of Cases — Premium feature
 * Lists inbound leads from WhatsApp/Gmail.
 * Opens a comparison modal: image(s) left, AI-extracted fields right.
 * "Convert to Rental" pre-fills the NewRental wizard.
 */
import { useState, useEffect, useCallback, useContext } from 'react'
import { api } from '../lib/api.js'
import { UserContext } from '../lib/UserContext.js'

const STATUS_LABELS = { pending: 'En attente', processed: 'Traité', ignored: 'Ignoré' }
const SOURCE_LABELS  = { whatsapp: 'WhatsApp', gmail: 'Gmail' }

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
function LeadModal({ lead, onClose, onConvert, onStatusChange }) {
  const [extracted, setExtracted] = useState(lead.extracted_data || {})
  const [saving, setSaving] = useState(false)

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

  const images = (lead.media_urls || []).filter(u => u.startsWith('http') || u.startsWith('data:image/'))

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
              {extracted.firstName || '—'} {extracted.lastName || ''}
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
                src={url.startsWith('data:') ? url : url}
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
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onStatusChange(lead.id, 'ignored')}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
          >
            Ignorer
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
          >
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
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
        {hasName ? `${ex.firstName || ''} ${ex.lastName || ''}`.trim() : lead.sender_id}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {ex.documentType && <span>{ex.documentType} · </span>}
        {ex.documentNumber && <span>{ex.documentNumber}</span>}
        {!ex.documentNumber && <span>Aucun document extrait</span>}
      </div>

      {lead.match_score && (
        <div style={{ fontSize: 11, color: '#f59e0b' }}>
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
export default function Basket({ onNavigate }) {
  const [leads, setLeads]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const { isPremium } = useContext(UserContext)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedLead, setSelectedLead] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getLeads(statusFilter)
      setLeads(data)
    } catch (err) {
      if (!err.message?.includes('PREMIUM_REQUIRED')) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(id, status) {
    try {
      await api.updateLeadStatus(id, status)
      setLeads(prev => prev.filter(l => l.id !== id))
      setSelectedLead(null)
    } catch (err) {
      console.error(err)
    }
  }

  function handleConvert(lead, extractedData) {
    const prefill = {
      firstName:      extractedData.firstName || '',
      lastName:       extractedData.lastName  || '',
      documentNumber: extractedData.documentNumber || '',
      dateOfBirth:    extractedData.dateOfBirth || '',
      expiryDate:     extractedData.expiryDate  || '',
      documentType:   extractedData.documentType || 'ID_CARD',
      issuingCountry: extractedData.issuingCountry || '',
      phone:          lead.source === 'whatsapp' ? lead.sender_id.replace('whatsapp:', '').replace(/@.*$/, '') : '',
      email:          lead.source === 'gmail'    ? lead.sender_id : '',
      rentalIntent:   extractedData.rentalIntent || null,
      leadId:         lead.id,
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

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Corbeille de Dossiers</h1>
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

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Object.entries(STATUS_LABELS).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: '1px solid var(--border)',
              background: statusFilter === val ? 'var(--accent)' : 'none',
              color: statusFilter === val ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: statusFilter === val ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 60 }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: '#ef4444', textAlign: 'center', marginTop: 60 }}>{error}</div>
      ) : leads.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          Aucun dossier {STATUS_LABELS[statusFilter].toLowerCase()}
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
