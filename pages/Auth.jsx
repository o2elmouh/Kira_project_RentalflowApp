import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import LanguageSelector from '../components/LanguageSelector'

function Field({ label, children }) {
  return (
    <div className="auth-field">
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

function LoginForm({ onSwitch }) {
  const { t } = useTranslation('auth')
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
      <h2>{t('login.title')}</h2>
      <p className="auth-subtitle">{t('login.subtitle')}</p>

      {error && <div className="auth-error">{error}</div>}

      <Field label={t('login.email')}>
        <input className="form-input" type="email" placeholder={t('login.emailPlaceholder')}
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      </Field>

      <Field label={t('login.password')}>
        <input className="form-input" type="password" placeholder={t('login.passwordPlaceholder')}
          value={password} onChange={e => setPassword(e.target.value)} required />
      </Field>

      <div className="auth-actions">
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? t('login.submitting') : t('login.submit')}
        </button>
        <p className="auth-switch">
          {t('login.noAccount')}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSwitch}>
            {t('login.signUp')}
          </button>
        </p>
      </div>
    </form>
  )
}

function SignupForm({ onSwitch }) {
  const { t } = useTranslation('auth')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError(t('errors.passwordMismatch')); return }
    if (password.length < 6)  { setError(t('errors.passwordTooShort')); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (!data.session) setNeedsConfirm(true)
    setLoading(false)
  }

  if (needsConfirm) return (
    <div className="auth-form" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
      <h2>{t('verify.title')}</h2>
      <p className="auth-subtitle" style={{ marginTop: 8 }}
        dangerouslySetInnerHTML={{ __html: t('verify.hint', { email: `<strong>${email}</strong>` }) }}
      />
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onSwitch}>
        {t('verify.backToLogin')}
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>{t('signup.title')}</h2>
      <p className="auth-subtitle">{t('signup.subtitle')}</p>

      {error && <div className="auth-error">{error}</div>}

      <Field label={t('signup.email')}>
        <input className="form-input" type="email" placeholder={t('signup.emailPlaceholder')}
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      </Field>

      <Field label={t('signup.password')}>
        <input className="form-input" type="password" placeholder={t('signup.passwordPlaceholder')}
          value={password} onChange={e => setPassword(e.target.value)} required />
      </Field>

      <Field label={t('signup.confirmPassword')}>
        <input className="form-input" type="password" placeholder={t('signup.passwordPlaceholder')}
          value={confirm} onChange={e => setConfirm(e.target.value)} required />
      </Field>

      <div className="auth-actions">
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? t('signup.submitting') : t('signup.submit')}
        </button>
        <p className="auth-switch">
          {t('signup.hasAccount')}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSwitch}>
            {t('signup.signIn')}
          </button>
        </p>
      </div>
    </form>
  )
}

export default function AuthPage() {
  const { t } = useTranslation('auth')
  const [mode, setMode] = useState('login')
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-logo">RF</div>
        <span>RentaFlow</span>
      </div>
      <div style={{ marginBottom: 16, width: '100%', maxWidth: 300 }}>
        <LanguageSelector />
      </div>
      {mode === 'login'
        ? <LoginForm  onSwitch={() => setMode('signup')} />
        : <SignupForm onSwitch={() => setMode('login')}  />
      }
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
        {t('footer', { year: new Date().getFullYear() })}
      </p>
    </div>
  )
}
