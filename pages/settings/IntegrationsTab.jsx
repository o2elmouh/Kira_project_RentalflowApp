/**
 * Integrations tab — WhatsApp (Twilio) + Gmail App Password
 * (visible only on premium plan)
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api.js'

export default function IntegrationsTab() {
  const { t } = useTranslation('settings')
  const [gmailStatus, setGmailStatus] = useState(null)
  const [gmailAddress, setGmailAddress] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [gmailSaving, setGmailSaving] = useState(false)
  const [gmailMsg, setGmailMsg] = useState(null)

  useEffect(() => {
    api.getGmailStatus()
      .then(s => {
        setGmailStatus(s)
        if (s.gmail_address) setGmailAddress(s.gmail_address)
      })
      .catch(() => { })
  }, [])

  async function saveGmail(e) {
    e.preventDefault()
    setGmailSaving(true)
    setGmailMsg(null)
    try {
      await api.saveGmailCredentials({ gmail_address: gmailAddress, gmail_app_password: appPassword })
      setGmailMsg({ ok: true, text: t('integrations.saved') })
      setAppPassword('')
      setGmailStatus(prev => ({ ...prev, connected: true, gmail_address: gmailAddress }))
    } catch (err) {
      setGmailMsg({ ok: false, text: err.message })
    } finally {
      setGmailSaving(false)
    }
  }

  async function disconnectGmail() {
    if (!window.confirm(t('integrations.disconnectConfirm'))) return
    try {
      await api.deleteGmailCredentials()
      setGmailStatus({ connected: false, gmail_address: null, last_polled: null })
      setGmailAddress('')
      setGmailMsg({ ok: true, text: t('integrations.disconnected') })
    } catch (err) {
      setGmailMsg({ ok: false, text: err.message })
    }
  }

  async function pollNow() {
    try {
      await api.triggerGmailPoll()
      setGmailMsg({ ok: true, text: t('integrations.syncTriggered') })
    } catch (err) {
      setGmailMsg({ ok: false, text: err.message })
    }
  }

  const fieldStyle = {
    width: '100%',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 14,
    boxSizing: 'border-box',
  }

  const labelStyle = { fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }

  const sectionStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  }

  const msgStyle = (ok) => ({
    marginTop: 10,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    color: ok ? '#22c55e' : '#ef4444',
    border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
  })

  return (
    <div style={{ maxWidth: 600 }}>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 24, fontSize: 14 }}>
        {t('integrations.intro')}
        <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
          PREMIUM
        </span>
      </p>

      {/* WhatsApp — Twilio */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📱</span> WhatsApp
          <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
            {t('integrations.waConnected')}
          </span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          {t('integrations.waDesc')}
        </p>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', lineHeight: 1.7 }}>
          <div>🔑 <strong style={{ color: 'var(--text-primary)' }}>TWILIO_ACCOUNT_SID</strong> — configuré sur Railway</div>
          <div>🔑 <strong style={{ color: 'var(--text-primary)' }}>TWILIO_AUTH_TOKEN</strong> — configuré sur Railway</div>
          <div>📞 <strong style={{ color: 'var(--text-primary)' }}>TWILIO_WHATSAPP_NUMBER</strong> — configuré sur Railway</div>
        </div>
      </div>

      {/* Gmail section */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>✉️</span> Gmail IMAP
          {gmailStatus?.connected && (
            <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              {t('integrations.gmailConnected')}
            </span>
          )}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          {t('integrations.gmailImap')}{' '}
          <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            {t('integrations.gmailAppPwdLink')}
          </a>
          {t('integrations.gmailAppPwdSuffix')}
        </p>

        {gmailStatus?.last_polled && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('integrations.lastSync')} {new Date(gmailStatus.last_polled).toLocaleString('fr-MA')}
            <button
              onClick={pollNow}
              style={{ marginLeft: 12, fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {t('integrations.syncNow')}
            </button>
          </div>
        )}

        <form onSubmit={saveGmail}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('integrations.gmailAddress')}</label>
            <input
              type="email"
              value={gmailAddress}
              onChange={e => setGmailAddress(e.target.value)}
              placeholder="votre@gmail.com"
              required
              style={fieldStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('integrations.gmailAppPwd')}</label>
            <input
              type="password"
              value={appPassword}
              onChange={e => setAppPassword(e.target.value)}
              placeholder={gmailStatus?.connected ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx'}
              required={!gmailStatus?.connected}
              style={fieldStyle}
              autoComplete="new-password"
            />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              {t('integrations.gmailAppPwdHint')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={gmailSaving}
              style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              {gmailSaving ? t('integrations.saving') : gmailStatus?.connected ? t('integrations.update') : t('integrations.connect')}
            </button>
            {gmailStatus?.connected && (
              <button
                type="button"
                onClick={disconnectGmail}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef444455', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
              >
                {t('integrations.disconnect')}
              </button>
            )}
          </div>
          {gmailMsg && <div style={msgStyle(gmailMsg.ok)}>{gmailMsg.text}</div>}
        </form>
      </div>
    </div>
  )
}
