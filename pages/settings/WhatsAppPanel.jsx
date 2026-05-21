import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api.js'

// Poll fast while the user is mid-scan (QR refreshes every ~20s), slow once
// connected — there's nothing to surface until the user clicks disconnect.
const POLL_FAST_MS = 2000
const POLL_SLOW_MS = 30000

// Anti-ban (4): show a warm-up notice for the first 3 days after a successful scan.
const WARMUP_DAYS = 3

const sectionStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 24,
  marginBottom: 20,
}

const badgeStyle = (ok) => ({
  fontSize: 11,
  background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
  color: ok ? '#22c55e' : 'var(--text-secondary)',
  borderRadius: 4,
  padding: '2px 7px',
  fontWeight: 600,
})

const btnPrimary = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnOutline = {
  background: 'transparent',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
}

export default function WhatsAppPanel() {
  const { t } = useTranslation('settings')
  const [status, setStatus] = useState({
    connected: false, qrDataUrl: null, status: 'idle', phone: null,
    connectedAt: null, dailySendCount: 0, dailySendLimit: 150,
  })
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)

  const isInWarmup = status.connected && status.connectedAt && (
    (Date.now() - new Date(status.connectedAt).getTime()) < WARMUP_DAYS * 24 * 60 * 60 * 1000
  )

  // Reschedule polling when connection state flips between connected ↔ not.
  useEffect(() => {
    pollStatus()
    const interval = status.connected ? POLL_SLOW_MS : POLL_FAST_MS
    pollRef.current = setInterval(pollStatus, interval)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected])

  async function pollStatus() {
    try {
      const data = await api.getWhatsAppStatus()
      setStatus(data)
    } catch (_) { /* swallow — next tick will retry */ }
  }

  async function handleConnect() {
    setLoading(true)
    try { await api.connectWhatsApp() }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleDisconnect() {
    if (!window.confirm(t('integrations.waDisconnectConfirm'))) return
    setLoading(true)
    try {
      await api.disconnectWhatsApp()
      setStatus({
        connected: false, qrDataUrl: null, status: 'idle', phone: null,
        connectedAt: null, dailySendCount: 0, dailySendLimit: status.dailySendLimit,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={sectionStyle}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>📱</span> WhatsApp
        <span style={badgeStyle(status.connected)}>
          {status.connected ? t('integrations.waConnected') : t('integrations.waNotConnected')}
        </span>
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
        {t('integrations.waDesc')}
      </p>

      {status.connected ? (
        <>
          {status.phone && (
            <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: '4px 0 12px' }}>
              +{status.phone}
            </p>
          )}

          {isInWarmup && (
            <div style={{
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.30)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              lineHeight: 1.5,
            }} role="note">
              <strong style={{ color: '#f59e0b', display: 'block', marginBottom: 4 }}>
                {t('integrations.waWarmupTitle')}
              </strong>
              <span style={{ color: 'var(--text-secondary)' }}>
                {t('integrations.waWarmupBody')}
              </span>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            {t('integrations.waDailyCounter', {
              count: status.dailySendCount,
              limit: status.dailySendLimit,
            })}
          </p>

          <button onClick={handleDisconnect} disabled={loading} style={btnOutline}>
            {t('integrations.waDisconnect')}
          </button>
        </>
      ) : (
        <>
          {status.qrDataUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                {t('integrations.waScanHint')}
              </p>
              <img
                src={status.qrDataUrl}
                alt="WhatsApp QR code"
                width={220}
                height={220}
                style={{ background: '#fff', padding: 8, borderRadius: 8 }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                {t('integrations.waQrExpires')}
              </p>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading || status.status === 'connecting' || status.status === 'reconnecting'}
              style={btnPrimary}
            >
              {status.status === 'connecting' || status.status === 'reconnecting'
                ? t('integrations.waConnecting')
                : t('integrations.waConnect')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
