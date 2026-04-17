/**
 * Integrations tab — WhatsApp number + Gmail App Password
 * (visible only on premium plan)
 */
import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api.js'

export default function IntegrationsTab() {
  // Gmail state
  const [gmailStatus, setGmailStatus] = useState(null)
  const [gmailAddress, setGmailAddress] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [gmailSaving, setGmailSaving] = useState(false)
  const [gmailMsg, setGmailMsg] = useState(null)

  // WhatsApp — Baileys QR connection
  const [waStatus, setWaStatus] = useState(null)   // null | 'connecting' | 'qr' | 'open' | 'closed'
  const [waQr, setWaQr] = useState(null)
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState(null)
  const pollRef = useRef(null)
  const connectTimeoutRef = useRef(null)

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  function clearConnectTimeout() { if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null } }

  async function fetchWaStatus() {
    try {
      const res = await api.getWhatsAppStatus()
      setWaStatus(res.status)
      setWaQr(res.qr || null)
      if (res.status === 'open') { stopPoll(); clearConnectTimeout(); setWaError(null) }
      if (res.status === 'closed') { stopPoll(); clearConnectTimeout() }
      if (res.status === 'qr') clearConnectTimeout()
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchWaStatus()
    return () => { stopPoll(); clearConnectTimeout() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startPoll() {
    stopPoll()
    pollRef.current = setInterval(fetchWaStatus, 3000)
  }

  function startConnectTimeout() {
    clearConnectTimeout()
    connectTimeoutRef.current = setTimeout(() => {
      stopPoll()
      setWaStatus(null)
      setWaError('La connexion a pris trop de temps. Réessayez.')
    }, 30000)
  }

  async function connectWa() {
    setWaLoading(true)
    setWaError(null)
    try {
      await api.connectWhatsApp()
      setWaStatus('connecting')
      startPoll()
      startConnectTimeout()
    } catch (err) {
      setWaError(err.message)
    } finally {
      setWaLoading(false)
    }
  }

  async function disconnectWa() {
    if (!window.confirm('Déconnecter WhatsApp ?')) return
    try {
      await api.disconnectWhatsApp()
      setWaStatus('closed')
      setWaQr(null)
      stopPoll()
    } catch (err) {
      alert(err.message)
    }
  }

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
      setGmailMsg({ ok: true, text: 'Intégration Gmail enregistrée.' })
      setAppPassword('')
      setGmailStatus(prev => ({ ...prev, connected: true, gmail_address: gmailAddress }))
    } catch (err) {
      setGmailMsg({ ok: false, text: err.message })
    } finally {
      setGmailSaving(false)
    }
  }

  async function disconnectGmail() {
    if (!window.confirm('Déconnecter Gmail ?')) return
    try {
      await api.deleteGmailCredentials()
      setGmailStatus({ connected: false, gmail_address: null, last_polled: null })
      setGmailAddress('')
      setGmailMsg({ ok: true, text: 'Gmail déconnecté.' })
    } catch (err) {
      setGmailMsg({ ok: false, text: err.message })
    }
  }

  async function pollNow() {
    try {
      await api.triggerGmailPoll()
      setGmailMsg({ ok: true, text: 'Synchronisation déclenchée.' })
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
        Connectez vos canaux de communication pour recevoir automatiquement les demandes de location.
        <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
          PREMIUM
        </span>
      </p>

      {/* WhatsApp section */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📱</span> WhatsApp
          {waStatus === 'open' && (
            <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              Connecté
            </span>
          )}
          {(waStatus === 'connecting' || waStatus === 'qr') && (
            <span style={{ fontSize: 11, background: 'rgba(234,179,8,0.15)', color: '#eab308', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              {waStatus === 'qr' ? 'Scannez le QR' : 'Connexion…'}
            </span>
          )}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          Connectez votre numéro WhatsApp en scannant le QR code avec l'application WhatsApp.
        </p>

        {waStatus === 'qr' && waQr && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <img src={waQr} alt="WhatsApp QR Code" style={{ width: 220, height: 220, borderRadius: 8, border: '1px solid var(--border)' }} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              Ouvrez WhatsApp → Appareils connectés → Connecter un appareil
            </p>
          </div>
        )}

        {waStatus === 'open' ? (
          <button
            onClick={disconnectWa}
            style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
          >
            Déconnecter
          </button>
        ) : (
          <button
            onClick={connectWa}
            disabled={waLoading || waStatus === 'qr'}
            style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
          >
            {waLoading ? 'Connexion en cours…' : waStatus === 'connecting' ? 'Connexion… (Réessayer)' : waStatus === 'qr' ? 'En attente du scan…' : 'Connecter WhatsApp'}
          </button>
        )}
        {waError && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{waError}</p>
        )}
      </div>

      {/* Gmail section */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>✉️</span> Gmail IMAP
          {gmailStatus?.connected && (
            <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
              Connecté
            </span>
          )}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          Sondage IMAP toutes les 5 minutes. Utilisez un{' '}
          <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            mot de passe d'application Google
          </a>
          , pas votre mot de passe habituel.
        </p>

        {gmailStatus?.last_polled && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Dernière synchro : {new Date(gmailStatus.last_polled).toLocaleString('fr-MA')}
            <button
              onClick={pollNow}
              style={{ marginLeft: 12, fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Synchroniser maintenant
            </button>
          </div>
        )}

        <form onSubmit={saveGmail}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Adresse Gmail</label>
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
            <label style={labelStyle}>Mot de passe d'application (16 caractères)</label>
            <input
              type="password"
              value={appPassword}
              onChange={e => setAppPassword(e.target.value)}
              placeholder={gmailStatus?.connected ? '••••••••••••••••  (laissez vide pour conserver)' : 'xxxx xxxx xxxx xxxx'}
              required={!gmailStatus?.connected}
              style={fieldStyle}
              autoComplete="new-password"
            />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Stocké chiffré AES-256 — jamais transmis au frontend
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={gmailSaving}
              style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              {gmailSaving ? 'Enregistrement…' : gmailStatus?.connected ? 'Mettre à jour' : 'Connecter'}
            </button>
            {gmailStatus?.connected && (
              <button
                type="button"
                onClick={disconnectGmail}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef444455', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
              >
                Déconnecter
              </button>
            )}
          </div>
          {gmailMsg && <div style={msgStyle(gmailMsg.ok)}>{gmailMsg.text}</div>}
        </form>
      </div>
    </div>
  )
}
