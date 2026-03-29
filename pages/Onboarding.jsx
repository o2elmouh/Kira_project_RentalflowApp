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

export default function OnboardingPage({ user }) {
  const { t } = useTranslation('onboarding')
  const [step, setStep]             = useState(1)
  const [agencyName, setAgencyName] = useState('')
  const [fullName, setFullName]     = useState(user?.user_metadata?.full_name || '')
  const [city, setCity]             = useState('')
  const [phone, setPhone]           = useState('')
  const [error, setError]           = useState(null)
  const [loading, setLoading]       = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    if (!agencyName.trim() || !fullName.trim()) {
      setError(t('step2.errors.required'))
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.rpc('onboard_new_agency', {
        p_user_id:     user.id,
        p_agency_name: agencyName.trim(),
        p_full_name:   fullName.trim(),
        p_email:       user.email,
        p_phone:       phone.trim() || null,
        p_city:        city.trim() || null,
      })
      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('[Onboarding]', err)
      setError(err.message || t('step2.errors.generic'))
      setLoading(false)
    }
  }

  const goNext = () => {
    if (!fullName.trim()) { setError(t('step1.errors.nameRequired')); return }
    setError(null)
    setStep(2)
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-logo">RF</div>
        <span>RentaFlow</span>
      </div>
      <div style={{ marginBottom: 16, width: '100%', maxWidth: 300 }}>
        <LanguageSelector />
      </div>

      <form onSubmit={handleCreate} className="auth-form">
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              height: 4, flex: 1, borderRadius: 4,
              background: s <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <h2>{step === 1 ? t('step1.title') : t('step2.title')}</h2>
        <p className="auth-subtitle">
          {step === 1 ? t('step1.subtitle') : t('step2.subtitle')}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {step === 1 && (
          <>
            <Field label={t('step1.fullName')}>
              <input className="form-input" placeholder={t('step1.fullNamePlaceholder')}
                value={fullName} onChange={e => setFullName(e.target.value)}
                required autoFocus />
            </Field>

            <Field label={t('step1.phone')}>
              <input className="form-input" placeholder={t('step1.phonePlaceholder')}
                value={phone} onChange={e => setPhone(e.target.value)} />
            </Field>

            <div className="auth-actions">
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>
                {t('step1.next')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t('step2.agencyName')}>
              <input className="form-input" placeholder={t('step2.agencyNamePlaceholder')}
                value={agencyName} onChange={e => setAgencyName(e.target.value)}
                required autoFocus />
            </Field>

            <Field label={t('step2.city')}>
              <input className="form-input" placeholder={t('step2.cityPlaceholder')}
                value={city} onChange={e => setCity(e.target.value)} />
            </Field>

            <div className="auth-actions">
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  {t('step2.back')}
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? t('step2.submitting') : t('step2.submit')}
                </button>
              </div>
            </div>
          </>
        )}
      </form>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
        {t('loggedInAs', { email: user?.email })}{' '}
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
          onClick={() => supabase.auth.signOut()}>
          {t('signOut', { ns: 'common' })}
        </button>
      </p>
    </div>
  )
}
