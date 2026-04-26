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
import Accounting from './pages/Accounting'
import Basket from './pages/Basket'
import Network from './pages/Network'

const PREVIEW = new URLSearchParams(window.location.search).get('preview')
const PAGE_PARAM = new URLSearchParams(window.location.search).get('page')
const signToken = new URLSearchParams(window.location.search).get('sign')

export default function App() {
  const [page, setPage] = useState(PAGE_PARAM || 'dashboard')
  const [restitutionContract, setRestitutionContract] = useState(null)
  const [prefilledLead, setPrefilledLead] = useState(null)
  const [basketInitialTab, setBasketInitialTab] = useState(null)
  const [authState, setAuthState] = useState('loading')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const resolvingRef = useRef(false)
  const initialSessionHandled = useRef(false)
  const passwordRecoveryRef = useRef(false)
  const isReadyRef = useRef(false)

  useEffect(() => {
    let subscription = null

    const init = async () => {
      const timeout = setTimeout(() => {
        setAuthState('unauthenticated')
      }, 5000)

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          clearTimeout(timeout)
          passwordRecoveryRef.current = true
          setAuthState('password-recovery')
          return
        }

        if (event === 'SIGNED_OUT') {
          isReadyRef.current = false
          setUser(null)
          setProfile(null)
          setAuthState('unauthenticated')
          return
        }

        if (event === 'INITIAL_SESSION') return

        // TOKEN_REFRESHED: token rotated silently — no need to re-fetch profile
        if (event === 'TOKEN_REFRESHED') {
          if (session?.user) setUser(session.user)
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

      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
        clearTimeout(timeout)
        if (passwordRecoveryRef.current) {
          // PASSWORD_RECOVERY already handled
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
      }
    }

    init()
    return () => subscription?.unsubscribe()
  }, [])

  async function resolveUser(u) {
    if (resolvingRef.current) return
    resolvingRef.current = true
    setUser(u)

    const fetchProfile = () =>
      Promise.race([
        supabase.from('profiles').select('id, full_name, email, phone, role, agency_id').eq('id', u.id).maybeSingle(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Profile query timed out')), 8000)),
      ])

    try {
      let result
      try {
        result = await fetchProfile()
      } catch {
        // Retry once before giving up
        console.warn('[RF] resolveUser: profile slow, retrying once…')
        result = await fetchProfile()
      }

      const { data: prof } = result

      if (prof?.agency_id) {
        try {
          const { data: agency } = await Promise.race([
            supabase.from('agencies').select('*').eq('id', prof.agency_id).maybeSingle(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Agency query timed out')), 4000)),
          ])
          if (agency) prof.agencies = agency
        } catch {}
      }

      if (prof) {
        setProfile(prof)
        setAuthState('ready')
        isReadyRef.current = true
      } else {
        if (!isReadyRef.current) setAuthState('onboarding')
      }
    } catch (err) {
      console.error('[RF] resolveUser threw:', err)
      // Only send to onboarding if the user was not already authenticated.
      // A transient timeout during a token refresh must NOT evict a logged-in user.
      if (!isReadyRef.current) setAuthState('onboarding')
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
    setBasketInitialTab(state.initialTab ?? null)
    setPage(target)
  }

  const role = profile?.role ?? 'staff'
  const isAdmin = role === 'admin'
  const isPremium = profile?.agencies?.plan === 'premium'

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNav={handleNav} />
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
      case 'network':  return <Network />
      case 'basket':
        if (!isPremium) { setTimeout(() => setPage('dashboard'), 0); return null }
        return <Basket onNavigate={handleNav} initialTab={basketInitialTab} />
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
          onSignOut={() => supabase.auth.signOut()}
        />
        <main className="main">{renderPage()}</main>
      </div>
    </UserContext.Provider>
  )
}
