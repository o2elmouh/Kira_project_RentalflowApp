/**
 * Basket of Cases — Premium feature
 * Lists inbound leads from WhatsApp/Gmail.
 * Opens a comparison modal: image(s) left, AI-extracted fields right.
 * "Convert to Rental" pre-fills the NewRental wizard.
 */
import { useState, useContext } from 'react'
import { api } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { UserContext } from '../lib/UserContext.js'
import { useLeads } from '../hooks/useLeads.js'
import { buildRentalPrefill } from '../utils/leadToRental.js'
import LeadModal from '../components/LeadModal.jsx'
import AlertSection from '../components/AlertSection.jsx'

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

// ── Confidence badge (used by LeadCard) ───────────────────
function ConfBadge({ score }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const color = score >= 0.85 ? '#22c55e' : score >= 0.7 ? '#f59e0b' : '#ef4444'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, marginLeft: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 5px' }}>
      {pct}%
    </span>
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
  const { isPremium, isAdmin } = useContext(UserContext)
  const [activeTab, setActiveTab]   = useState(initialTab === 'alertes' ? 'alertes' : 'leads')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedLead, setSelectedLead] = useState(null)

  const { leads, alerts, loading, error, load, handleStatusChange, handleEscalate, handleIgnoreAlert } = useLeads(activeTab, statusFilter)

  function handleConvert(lead, extractedData) {
    const prefill = buildRentalPrefill(lead, extractedData)
    api.updateLeadStatus(lead.id, 'processed').catch(() => {})
    onNavigate('new-rental', { prefilledLead: prefill })
  }

  // ── Upgrade wall ───────────────────────────────────────
  if (!isPremium && !isAdmin) {
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
        <AlertSection alerts={alerts} loading={loading} onEscalate={handleEscalate} onIgnore={handleIgnoreAlert} />
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
