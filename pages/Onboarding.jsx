import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { seedFleetConfig } from '../lib/db'
import LanguageSelector from '../components/LanguageSelector'

function Field({ label, children }) {
  return (
    <div className="auth-field">
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

export default function OnboardingPage({ user, onDone }) {
  const { t } = useTranslation('onboarding')
  const [step, setStep]             = useState(1)
  const [agencyName, setAgencyName] = useState('')
  const [fullName, setFullName]     = useState(user?.user_metadata?.full_name || '')
  const [city, setCity]             = useState('')
  const [phone, setPhone]           = useState('')
  const [ice, setIce]               = useState('')
  const [rc, setRc]                 = useState('')
  const [error, setError]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [joiningAgency, setJoiningAgency] = useState(false)

  // Invited users land here authenticated via magic link without a
  // password set. We block the silent agency join behind a password
  // setup form so they leave with a credential they can re-use.
  const isInvitedUser = !!user?.user_metadata?.agency_id
  const [passwordSet, setPasswordSet] = useState(false)
  const [staffPwd, setStaffPwd]             = useState('')
  const [staffPwdConfirm, setStaffPwdConfirm] = useState('')
  const [staffPwdLoading, setStaffPwdLoading] = useState(false)

  const handleStaffPasswordSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (staffPwd !== staffPwdConfirm) { setError(t('errors.passwordMismatch', 'Les mots de passe ne correspondent pas')); return }
    if (staffPwd.length < 8) { setError(t('errors.passwordTooShort', 'Le mot de passe doit faire au moins 8 caractères')); return }
    setStaffPwdLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: staffPwd })
      if (updErr) throw updErr
      setPasswordSet(true) // unblocks the joinExistingAgency effect below
    } catch (err) {
      console.error('[Onboarding] staff password setup failed:', err)
      setError(err.message || t('errors.generic', 'Une erreur est survenue.'))
    } finally {
      setStaffPwdLoading(false)
    }
  }

  // ── Detect invited user (has agency_id in user_metadata) ─────────────
  // When admin invites via supabaseAdmin.auth.admin.inviteUserByEmail,
  // user_metadata contains { agency_id, role, invited_by }.
  // For invited users we must NOT call onboard_new_agency (which would
  // create a new agency and could orphan/overwrite the inviter's data).
  // Instead we just upsert the profile to link them to the existing agency.
  // Gated behind passwordSet so the user always sets a credential first.
  useEffect(() => {
    const invitedAgencyId = user?.user_metadata?.agency_id
    const invitedRole     = user?.user_metadata?.role
    if (!invitedAgencyId || !user?.id) return
    if (!passwordSet) return // wait for staff to set their password

    let cancelled = false
    const joinExistingAgency = async () => {
      setJoiningAgency(true)
      try {
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert({
            id:        user.id,
            email:     user.email,
            full_name: user.user_metadata?.full_name || user.email.split('@')[0],
            agency_id: invitedAgencyId,
            role:      invitedRole || 'staff',
          }, { onConflict: 'id' })
        if (upsertErr) throw upsertErr
        if (!cancelled) {
          if (typeof onDone === 'function') onDone(); else window.location.reload()
        }
      } catch (err) {
        console.error('[Onboarding] failed to join existing agency:', err)
        if (!cancelled) {
          setError(err.message || 'Failed to join agency. Contact your administrator.')
          setJoiningAgency(false)
        }
      }
    }
    joinExistingAgency()
    return () => { cancelled = true }
  }, [user?.id, passwordSet])

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
        p_ice:         ice.trim() || null,
        p_rc:          rc.trim() || null,
      })
      if (error) throw error
      // Seed default fleet config for the new agency (36 brands from Fleet_Config.csv)
      const { data: profile } = await supabase.from('profiles').select('agency_id').eq('id', user.id).single()
      if (profile?.agency_id) await seedFleetConfig(profile.agency_id)
      if (typeof onDone === 'function') onDone(); else window.location.reload()
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

  // ── Invited user, password not yet set ─────────────────────────────
  // Block until they create a password they can re-use to log back in.
  // Once submitted, the joinExistingAgency effect re-runs and silently
  // links them to the inviting agency.
  if (isInvitedUser && !passwordSet) {
    return (
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="auth-logo">RF</div>
          <span>RentaFlow</span>
        </div>
        <div style={{ marginBottom: 16, width: '100%', maxWidth: 300 }}>
          <LanguageSelector />
        </div>
        <form onSubmit={handleStaffPasswordSubmit} className="auth-form">
          <h2>{t('staffSetup.title', 'Finalisez votre compte')}</h2>
          <p className="auth-subtitle">
            {t('staffSetup.subtitle', "Vous avez été invité à rejoindre une agence sur RentaFlow. Choisissez un mot de passe pour pouvoir vous reconnecter.")}
          </p>

          {error && <div className="auth-error">{error}</div>}

          <Field label={t('staffSetup.email', 'Email')}>
            <input className="form-input" type="email" value={user?.email || ''} disabled />
          </Field>

          <Field label={t('staffSetup.password', 'Mot de passe')}>
            <input
              className="form-input"
              type="password"
              placeholder={t('staffSetup.passwordPlaceholder', 'Minimum 8 caractères')}
              value={staffPwd}
              onChange={e => setStaffPwd(e.target.value)}
              required
              autoFocus
              minLength={8}
            />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.6 }}>
              <div>{staffPwd.length >= 8 ? '✓' : '○'} {t('staffSetup.rule1', 'Au moins 8 caractères')}</div>
              <div>{/[A-Z]/.test(staffPwd) ? '✓' : '○'} {t('staffSetup.rule2', 'Une lettre majuscule')}</div>
              <div>{/[0-9]/.test(staffPwd) ? '✓' : '○'} {t('staffSetup.rule3', 'Un chiffre')}</div>
            </div>
          </Field>

          <Field label={t('staffSetup.confirmPassword', 'Confirmer le mot de passe')}>
            <input
              className="form-input"
              type="password"
              placeholder={t('staffSetup.passwordPlaceholder', 'Minimum 8 caractères')}
              value={staffPwdConfirm}
              onChange={e => setStaffPwdConfirm(e.target.value)}
              required
              minLength={8}
            />
          </Field>

          <div className="auth-actions">
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={staffPwdLoading}>
              {staffPwdLoading
                ? t('staffSetup.submitting', 'Création…')
                : t('staffSetup.submit', 'Créer mon compte')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Invited user — show joining screen instead of new-agency form
  if (joiningAgency) {
    return (
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="auth-logo">RF</div>
          <span>RentaFlow</span>
        </div>
        <div className="auth-form" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2>{t('joining.title', 'Connexion à votre agence...')}</h2>
          <p className="auth-subtitle" style={{ marginTop: 8 }}>
            {t('joining.subtitle', 'Vous rejoignez l\'agence qui vous a invité.')}
          </p>
          {error && <div className="auth-error" style={{ marginTop: 16 }}>{error}</div>}
        </div>
      </div>
    )
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
              background: s <= step ? 'var(--ink)' : 'var(--border)',
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

            <Field label={t('step2.ice')}>
              <input className="form-input" placeholder={t('step2.icePlaceholder')}
                value={ice} onChange={e => setIce(e.target.value)}
                maxLength={15} />
            </Field>

            <Field label={t('step2.rc')}>
              <input className="form-input" placeholder={t('step2.rcPlaceholder')}
                value={rc} onChange={e => setRc(e.target.value)} />
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

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
        {t('loggedInAs', { email: user?.email })}{' '}
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
          onClick={() => supabase.auth.signOut()}>
          {t('signOut', { ns: 'common' })}
        </button>
      </p>
    </div>
  )
}
