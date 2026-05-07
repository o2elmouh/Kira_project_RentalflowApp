import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReservation } from '../../src/hooks/useReservations'
import SourceChannelBadge from './SourceChannelBadge'
import StatusBadge from './StatusBadge'
import { formatLocal, formatRange } from '../../src/utils/timezone'

/**
 * Side-panel "sheet" that slides in from the right.
 * Renders the full reservation row with joined client/vehicle data and
 * the raw source_metadata as a JSON viewer (so the agent can see
 * channel-specific details like email subject or WhatsApp number).
 *
 * Renders nothing when `id` is falsy — the parent toggles visibility
 * by setting/clearing the `id` state.
 */
export default function ReservationDetailsPanel({ id, onClose }) {
  const { t } = useTranslation('reservations')
  const { data, isLoading, error } = useReservation(id)

  if (!id) return null

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
        }}
      />

      {/* Sheet */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          insetInlineEnd: 0,
          bottom: 0,
          width: 460,
          maxWidth: '90vw',
          background: 'var(--bg, #fff)',
          zIndex: 1000,
          boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.15)',
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: 0 }}>{t('details.title')}</h3>
          <button
            className="btn-outline-ink"
            style={{ padding: '4px 10px' }}
            onClick={onClose}
            aria-label={t('details.close', 'Fermer')}
          >
            <X size={14} />
          </button>
        </div>

        {isLoading && <div style={{ color: 'var(--text2)' }}>{t('details.loading')}…</div>}

        {error && (
          <div className="alert alert-error" style={{ fontSize: 13 }}>
            {t('error.fetch')}: {error.message}
          </div>
        )}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SourceChannelBadge source={data.source_channel} />
              <StatusBadge status={data.status} />
            </div>

            <Field label={t('fields.customer')} value={data.customer_name} />
            <Field label={t('fields.contact')}  value={data.customer_contact} />
            <Field label={t('fields.car')}      value={data.car_model} />
            <Field label={t('fields.period')}   value={formatRange(data.start_date, data.end_date)} />
            <Field label={t('fields.price')}    value={`${data.total_price} ${data.currency || 'MAD'}`} />
            <Field label={t('fields.created')}  value={formatLocal(data.created_at)} />

            <div>
              <strong style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('details.metadata')}
              </strong>
              <pre
                style={{
                  background: 'var(--surface-2, #F7F5F2)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  overflowX: 'auto',
                  marginTop: 6,
                  marginBottom: 0,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(data.source_metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text2)',
          marginBottom: 2,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}
