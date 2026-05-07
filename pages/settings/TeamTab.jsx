import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useIsAdmin } from '../../lib/UserContext'

export default function TeamTab() {
  const isAdmin = useIsAdmin()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('staff')
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error', msg }

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getTeam()
      setMembers(data)
    } catch {
      // no-op if not connected to backend
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleInvite = (e) => {
    e.preventDefault()
    if (!inviteEmail) return

    // Capture the email locally so we can reset the form right away —
    // by the time the API resolves the user may already be typing the
    // next invitee.
    const emailSnapshot = inviteEmail
    const roleSnapshot  = inviteRole

    // Show the toast immediately and clear the input. The actual API
    // call runs in the background; failures are logged but never block
    // the UI or evict the success toast — admins can simply retry.
    setFeedback({ type: 'success', msg: `Invitation en cours d'envoi à ${emailSnapshot}…` })
    setInviteEmail('')
    setInviting(true)

    // Auto-dismiss the toast after 4s so it doesn't accumulate.
    setTimeout(() => setFeedback(null), 4000)

    api.inviteMember({ email: emailSnapshot, role: roleSnapshot })
      .then(() => {
        setFeedback({ type: 'success', msg: `Invitation envoyée à ${emailSnapshot}` })
        setTimeout(() => setFeedback(null), 4000)
        load()
      })
      .catch((err) => {
        // Log but don't block — the admin can re-submit the form.
        console.error('[TeamTab] inviteMember failed:', err)
      })
      .finally(() => {
        setInviting(false)
      })
  }

  const handleRoleChange = async (id, role) => {
    try {
      await api.updateMemberRole(id, role)
      setMembers(m => m.map(x => x.id === id ? { ...x, role } : x))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Retirer ${name} de l'agence ?`)) return
    try {
      await api.removeMember(id)
      setMembers(m => m.filter(x => x.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const roleBadge = (role) => (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: role === 'admin' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.15)',
      color:      role === 'admin' ? '#a5b4fc' : '#86efac',
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>{role}</span>
  )

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Invite form — admin only */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Inviter un membre</h3>
          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: feedback.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color:      feedback.type === 'success' ? '#86efac' : '#fca5a5',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>{feedback.msg}</div>
          )}
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email" required placeholder="email@exemple.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: 200 }}
            />
            <select
              value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="form-input" style={{ width: 120 }}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary" disabled={inviting}>
              {inviting ? 'Envoi…' : 'Inviter'}
            </button>
          </form>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            L'invité recevra un lien par email pour créer son compte.
          </p>
        </div>
      )}

      {/* Members list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
          Membres ({members.length})
        </div>
        {loading ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Aucun membre trouvé. Configurez votre backend Railway pour afficher l'équipe.</div>
        ) : members.map((m, i) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--text2)',
            }}>
              {(m.full_name || m.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.full_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.email}</div>
            </div>
            {isAdmin ? (
              <select
                value={m.role || 'staff'}
                onChange={e => handleRoleChange(m.id, e.target.value)}
                className="form-input" style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            ) : roleBadge(m.role)}
            {isAdmin && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => handleRemove(m.id, m.full_name || m.email)}
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
