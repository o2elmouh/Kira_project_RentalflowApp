import { useState } from 'react'

function formatSenderId(id) {
  return id ? id.replace(/@.*$/, '') : id
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `il y a ${hrs}h`
  return `il y a ${Math.floor(hrs / 24)}j`
}

export default function AlertCard({ alert, onEscalate, onIgnore }) {
  const [expanded, setExpanded] = useState(false)
  const ex = alert.extracted_data || {}
  const summary = ex.summary_for_agent || '—'
  const body = ex.translated_body || null
  const sourceLabel = alert.source === 'whatsapp' ? 'WhatsApp' : 'Gmail'

  return (
    <div style={{
      background: '#FEF0E8',
      border: '1px solid #f9c6a0',
      borderRadius: 10,
      padding: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#CF4500',
          background: '#fff', borderRadius: 4, padding: '2px 7px', border: '1px solid #f9c6a0',
        }}>
          ⚠ {sourceLabel}
        </span>
        <span style={{ fontSize: 11, color: '#999' }}>{timeAgo(alert.created_at)}</span>
      </div>

      {/* Sender */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#141413' }}>
        {formatSenderId(alert.sender_id)}
      </div>

      {/* Summary */}
      <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>{summary}</div>

      {/* Collapsible translated body */}
      {body && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none', border: 'none', color: '#CF4500',
              fontSize: 12, cursor: 'pointer', padding: 0,
            }}
          >
            {expanded ? '▾ Masquer le message' : '▸ Voir message complet'}
          </button>
          {expanded && (
            <div style={{
              marginTop: 6, fontSize: 12, color: '#555',
              background: '#fff', borderRadius: 6, padding: '8px 10px',
              border: '1px solid #f9c6a0',
            }}>
              {body}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onEscalate(alert.id)}
          style={{
            background: '#141413', color: '#F3F0EE', border: 'none',
            borderRadius: 20, padding: '5px 14px', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Escalader
        </button>
        <button
          onClick={() => onIgnore(alert.id)}
          style={{
            background: '#fff', color: '#696969',
            border: '1px solid #ddd', borderRadius: 20,
            padding: '5px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          Ignorer
        </button>
      </div>
    </div>
  )
}
