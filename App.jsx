import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { UserContext } from './lib/UserContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import NewRental from './pages/NewRental'
import Fleet from './pages/Fleet'
import Clients from './pages/Clients'
import Contracts from './pages/Contracts'
import Invoices from './pages/Invoices'
import Settings from './pages/Settings'
import Restitution from './pages/Restitution'
import RestitutionPicker from './pages/RestitutionPicker'
import AuthPage, { PasswordResetForm } from './pages/Auth'
import OnboardingPage from './pages/Onboarding'
import WelcomeScreen from './pages/WelcomeScreen'
import SignContract from './pages/SignContract'
import { initDefaultAccounts } from './lib/db'
import Accounting from './pages/Accounting'
import MigrateData from './pages/MigrateData'
import Basket from './pages/Basket'

const USE_AUTH = import.meta.env.VITE_USE_AUTH === 'true'
const PREVIEW = new URLSearchParams(window.location.search).get('preview')
const PAGE_PARAM = new URLSearchParams(window.location.search).get('page')
const signToken = new URLSearchParams(window.location.search).get('sign')

// ── Startup diagnostics (remove after confirming fix) ─────────────────────────
console.log('[RF] BUILD OK — App module loaded')
console.log('[RF] USE_AUTH:', USE_AUTH, '| VITE_USE_AUTH raw:', import.meta.env.VITE_USE_AUTH)
console.log('[RF] VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL ? '✓ set' : '✗ MISSING')
console.log('[RF] VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ set' : '✗ MISSING')

export default function App() {
  const [page, setPage] = useState(PAGE_PARAM || 'dashboard')
  const [restitutionContract, setRestitutionContract] = useState(null)
  const [prefilledLead, setPrefilledLead] = useState(null)
  const [authState, setAuthState] = useState('loading')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const resolvingRef = useRef(false)
  const initialSessionHandled = useRef(false)
  const passwordRecoveryRef = useRef(false)

  useEffect(() => {
    console.log('[RF] useEffect — USE_AUTH:', USE_AUTH)
    if (!USE_AUTH) {
      console.log('[RF] Auth disabled — going straight to ready')
      initDefaultAccounts()
      setAuthState('ready')
      return
    }

    let subscription = null

    const init = async () => {
      console.log('[RF] init() started')
      const timeout = setTimeout(() => {
        console.warn('[RF] Auth timeout (5s) — forcing unauthenticated')
        setAuthState('unauthenticated')
      }, 5000)

      // 1. Subscribe first so we never miss an event
      console.log('[RF] Subscribing to onAuthStateChange...')
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[RF] onAuthStateChange event:', event, '| session:', session ? 'present' : 'null')

        if (event === 'PASSWORD_RECOVERY') {
          clearTimeout(timeout)
          passwordRecoveryRef.current = true
          setAuthState('password-recovery')
          return
        }

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setAuthState('unauthenticated')
          return
        }

        // Skip INITIAL_SESSION — handled below via getSession()
        if (event === 'INITIAL_SESSION') {
          return
        }

        if (session?.user) {
          clearTimeout(timeout)
          if (!passwordRecoveryRef.current) await resolveUser(session.user)
        } else {
          clearTimeout(timeout)
          if (!passwordRecoveryRef.current) setAuthState('unauthenticated')
        }
      })
      subscription = data.subscription

      // 2. Check existing session once
      try {
        console.log('[RF] Calling getSession()...')
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
        console.log('[RF] getSession result:', session ? `user=${session.user?.email}` : 'no session', sessionErr ? `err=${sessionErr.message}` : '')
        clearTimeout(timeout)
        if (passwordRecoveryRef.current) {
          // PASSWORD_RECOVERY event already handled — don't override with resolveUser
        } else if (session?.user) {
          await resolveUser(session.user)
        } else {
          setAuthState('unauthenticated')
        }
      } catch (err) {
        console.error('[RF] getSession threw:', err)
        clearTimeout(timeout)
        setAuthState('unauthenticated')
      } finally {
        initialSessionHandled.current = true
        console.log('[RF] init() complete — authState will update')
      }
    }

    init()
    return () => subscription?.unsubscribe()
  }, [])

  async function resolveUser(u) {
    console.log('[RF] resolveUser called — id:', u?.id, 'email:', u?.email)
    if (resolvingRef.current) { console.warn('[RF] resolveUser already in progress, skipping'); return }
    resolvingRef.current = true
    setUser(u)
    try {
      console.log('[RF] Fetching profile from Supabase...')
      // Race the query against a 6-second timeout to prevent infinite hang
      const profilePromise = supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, agency_id')
        .eq('id', u.id)
        .maybeSingle()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timed out after 6s')), 6000)
      )
      const { data: prof, error: profErr } = await Promise.race([profilePromise, timeoutPromise])

      console.log('[RF] Profile result:', prof ? `role=${prof.role} agency=${prof.agency_id}` : 'null', profErr ? `err=${profErr.message}` : '')

      // Fetch agency separately to avoid join hanging on RLS
      if (prof?.agency_id) {
        try {
          const { data: agency } = await Promise.race([
            supabase.from('agencies').select('*').eq('id', prof.agency_id).maybeSingle(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Agency query timed out')), 4000)),
          ])
          if (agency) prof.agencies = agency
          console.log('[RF] Agency result:', agency ? `plan=${agency.plan}` : 'null')
        } catch (agErr) {
          console.warn('[RF] Agency fetch failed (non-fatal):', agErr.message)
        }
      }
      if (prof) {
        setProfile(prof)
        setAuthState('ready')
        console.log('[RF] → ready')
      } else {
        setAuthState('onboarding')
        console.log('[RF] → onboarding (no profile)')
      }
    } catch (err) {
      console.error('[RF] resolveUser threw:', err)
      // On query error/timeout, go to ready with null profile (admin fallback)
      // rather than sending an existing user back through onboarding
      setAuthState('ready')
    } finally {
      resolvingRef.current = false
    }
  }

  const handleRestitution = (contract) => {
    setRestitutionContract(contract)
    setPage('restitution')
  }

  const handleNav = (target, state = {}) => {
    if (state.prefilledLead !== undefined) setPrefilledLead(state.prefilledLead)
    setPage(target)
  }

  // When auth is enabled and profile hasn't loaded, default to least-privileged role
  const role = profile?.role ?? (USE_AUTH ? 'staff' : 'admin')
  const isAdmin = role === 'admin'
  const isPremium = profile?.agencies?.plan === 'premium'

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNav={setPage} />
      case 'new-rental': return <NewRental
        onDone={() => { setPrefilledLead(null); setPage('dashboard') }}
        prefilledLead={prefilledLead}
      />
      case 'contracts': return <Contracts onRestitution={handleRestitution} />
      case 'invoices': return <Invoices />
      case 'clients': return <Clients />
      case 'fleet': return <Fleet />
      case 'accounting':
        if (!isAdmin) { setTimeout(() => setPage('dashboard'), 0); return null }
        return <Accounting />
      case 'settings':
        if (!isAdmin) { setTimeout(() => setPage('dashboard'), 0); return null }
        return <Settings />
      case 'migrate': return <MigrateData />
      case 'basket':
        if (!isPremium) { setTimeout(() => setPage('dashboard'), 0); return null }
        return <Basket onNavigate={handleNav} />
      case 'restitution-picker':
        return <RestitutionPicker onPick={handleRestitution} onCancel={() => setPage('contracts')} />
      case 'restitution':
        if (!restitutionContract) { setTimeout(() => setPage('restitution-picker'), 0); return null }
        return <Restitution
          contract={restitutionContract}
          onDone={() => { setRestitutionContract(null); setPage('contracts') }}
        />
      default: return <Dashboard onNav={setPage} />
    }
  }

  if (signToken) return <SignContract token={signToken} />

  if (PREVIEW === 'onboarding')
    return <OnboardingPage user={{ id: 'preview', email: 'preview@rentaflow.ma' }} />

  if (authState === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div className="auth-logo">RF</div>
      <p style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</p>
    </div>
  )

  if (authState === 'unauthenticated') return <AuthPage />
  if (authState === 'onboarding') return <OnboardingPage user={user} onDone={() => setAuthState('welcome')} />
  if (authState === 'welcome') return <WelcomeScreen onDone={() => setAuthState('ready')} />
  if (authState === 'password-recovery') return (
    <PasswordResetForm onSuccess={async () => {
      passwordRecoveryRef.current = false
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) await resolveUser(session.user)
        else setAuthState('ready')
      } catch {
        setAuthState('ready')
      }
    }} />
  )

  return (
    <UserContext.Provider value={{ user, profile, role, isAdmin, isPremium }}>
      <div className="app-shell">
        <Sidebar
          active={page}
          onNav={setPage}
          user={user}
          profile={profile}
          isAdmin={isAdmin}
          onSignOut={USE_AUTH ? () => supabase.auth.signOut() : null}
        />
        <main className="main">{renderPage()}</main>
      </div>
    </UserContext.Provider>
  )
}
