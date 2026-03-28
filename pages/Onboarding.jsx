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

export default function OnboardingPage({ user }) {
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
      setError("Nom de l'agence et votre nom sont requis.")
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
      setError(err.message || 'Erreur lors de la création. Vérifiez la console.')
      setLoading(false)
    }
  }

  const goNext = () => {
    if (!fullName.trim()) { setError('Votre nom est requis.'); return }
    setError(null)
    setStep(2)
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-logo">RF</div>
        <span>RentaFlow</span>
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

        <h2>{step === 1 ? 'Bienvenue ! 👋' : 'Votre agence'}</h2>
        <p className="auth-subtitle">
          {step === 1
            ? 'Configurons votre compte en 2 étapes.'
            : 'Ces informations apparaîtront sur vos contrats et factures.'}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {step === 1 && (
          <>
            <Field label="Votre nom complet">
              <input className="form-input" placeholder="Prénom Nom"
                value={fullName} onChange={e => setFullName(e.target.value)}
                required autoFocus />
            </Field>

            <Field label="Téléphone">
              <input className="form-input" placeholder="+212 6XX XXX XXX"
                value={phone} onChange={e => setPhone(e.target.value)} />
            </Field>

            <div className="auth-actions">
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>
                Suivant →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Nom de l'agence *">
              <input className="form-input" placeholder="Atlas Car Rental"
                value={agencyName} onChange={e => setAgencyName(e.target.value)}
                required autoFocus />
            </Field>

            <Field label="Ville">
              <input className="form-input" placeholder="Casablanca"
                value={city} onChange={e => setCity(e.target.value)} />
            </Field>

            <div className="auth-actions">
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  ← Retour
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Création…' : 'Créer mon agence 🚀'}
                </button>
              </div>
            </div>
          </>
        )}
      </form>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
        Connecté en tant que {user?.email} ·{' '}
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
          onClick={() => supabase.auth.signOut()}>
          Déconnexion
        </button>
      </p>
    </div>
  )
}
