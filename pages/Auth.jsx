import { useState } from 'react'
import { supabase } from '../lib/supabase'

function Field({ label, children }) {
  return (
    <div className="auth-field">
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

function LoginForm({ onSwitch }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Connexion</h2>
      <p className="auth-subtitle">Accédez à votre espace RentaFlow</p>

      {error && <div className="auth-error">{error}</div>}

      <Field label="Adresse email">
        <input className="form-input" type="email" placeholder="vous@agence.ma"
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      </Field>

      <Field label="Mot de passe">
        <input className="form-input" type="password" placeholder="••••••••"
          value={password} onChange={e => setPassword(e.target.value)} required />
      </Field>

      <div className="auth-actions">
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="auth-switch">
          Pas encore de compte ?{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSwitch}>
            Créer un compte
          </button>
        </p>
      </div>
    </form>
  )
}

function SignupForm({ onSwitch }) {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [error, setError]             = useState(null)
  const [loading, setLoading]         = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 6)  { setError('Mot de passe trop court (6 caractères min).'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (!data.session) setNeedsConfirm(true)
    setLoading(false)
  }

  if (needsConfirm) return (
    <div className="auth-form" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
      <h2>Vérifiez votre email</h2>
      <p className="auth-subtitle" style={{ marginTop: 8 }}>
        Un lien de confirmation a été envoyé à <strong>{email}</strong>.
      </p>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onSwitch}>
        Retour à la connexion
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Créer un compte</h2>
      <p className="auth-subtitle">Commencez votre essai gratuit RentaFlow</p>

      {error && <div className="auth-error">{error}</div>}

      <Field label="Adresse email">
        <input className="form-input" type="email" placeholder="vous@agence.ma"
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      </Field>

      <Field label="Mot de passe">
        <input className="form-input" type="password" placeholder="••••••••"
          value={password} onChange={e => setPassword(e.target.value)} required />
      </Field>

      <Field label="Confirmer le mot de passe">
        <input className="form-input" type="password" placeholder="••••••••"
          value={confirm} onChange={e => setConfirm(e.target.value)} required />
      </Field>

      <div className="auth-actions">
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Création…' : 'Créer mon compte'}
        </button>
        <p className="auth-switch">
          Déjà un compte ?{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSwitch}>
            Se connecter
          </button>
        </p>
      </div>
    </form>
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-logo">RF</div>
        <span>RentaFlow</span>
      </div>
      {mode === 'login'
        ? <LoginForm  onSwitch={() => setMode('signup')} />
        : <SignupForm onSwitch={() => setMode('login')}  />
      }
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
        © {new Date().getFullYear()} RentaFlow · Gestion de location automobile au Maroc
      </p>
    </div>
  )
}
