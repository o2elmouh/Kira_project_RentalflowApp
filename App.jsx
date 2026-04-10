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
import AuthPage from './pages/Auth'
import OnboardingPage from './pages/Onboarding'
import SignContract from './pages/SignContract'
import { initDefaultAccounts } from './lib/db'
import Accounting from './pages/Accounting'

const USE_AUTH = import.meta.env.VITE_USE_AUTH === 'true'
const PREVIEW  = new URLSearchParams(window.location.search).get('preview')

const signToken = new URLSearchParams(window.location.search).get('sign')

export default function App() {
  const [page, setPage]                               = useState('dashboard')
  const [restitutionContract, setRestitutionContract] = useState(null)
  const [authState, setAuthState]                     = useState('loading')
  const [user, setUser]                               = useState(null)
  const [profile, setProfile]                         = useState(null)
  const resolvingRef                                  = useRef(false)
  const initializedRef                                = useRef(false)

  useEffect(() => {
    if (!USE_AUTH) {
      initDefaultAccounts()
      setAuthState('ready')
      return
    }

    let subscription = null

    const init = async () => {
      // Timeout de sécurité — si tout échoue, on va sur login
      const timeout = setTimeout(() => {
        console.warn('[Auth] timeout — forcing unauthenticated')
        setAuthState('unauthenticated')
      }, 5000)

      try {
        // 1. Vérifier la session existante immédiatement
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('[Auth] getSession:', session ? 'session found' : 'no session', error?.message)

        if (session?.user) {
          clearTimeout(timeout)
          await resolveUser(session.user)
        } else {
          clearTimeout(timeout)
          setAuthState('unauthenticated')
        }
      } catch (err) {
        console.error('[Auth] getSession error:', err)
        clearTimeout(timeout)
        setAuthState('unauthenticated')
      }

      // 2. Écouter les changements suivants (login, logout)
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!initializedRef.current) return // ignorer INITIAL_SESSION déjà géré ci-dessus
        if (!session) {
          setUser(null); setProfile(null); setAuthState('unauthenticated')
        } else {
          await resolveUser(session.user)
        }
      })
      subscription = data.subscription
      initializedRef.current = true
    }

    init()
    return () => subscription?.unsubscribe()
  }, [])

  async function resolveUser(u) {
    if (resolvingRef.current) return
    resolvingRef.current = true
    setUser(u)
    try {
      console.log('[Auth] resolveUser — querying profile for', u.id)
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*, agencies(*)')
        .eq('id', u.id)
        .maybeSingle()

      console.log('[Auth] profile result:', prof ? 'found' : 'not found', error?.message)

      if (prof) {
        setProfile(prof)
        setAuthState('ready')
      } else {
        setAuthState('onboarding')
      }
    } catch (err) {
      console.error('[Auth] resolveUser error:', err)
      setAuthState('onboarding')
    } finally {
      resolvingRef.current = false
    }
  }

  const handleRestitution = (contract) => {
    setRestitutionContract(contract)
    setPage('restitution')
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard onNav={setPage} />
      case 'new-rental': return <NewRental onDone={() => setPage('dashboard')} />
      case 'contracts':  return <Contracts onRestitution={handleRestitution} />
      case 'invoices':   return <Invoices />
      case 'clients':    return <Clients />
      case 'fleet':      return <Fleet />
      case 'accounting': return <Accounting />
      case 'settings':   return <Settings />
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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
      <div className="auth-logo">RF</div>
      <p style={{ color:'var(--text3)', fontSize:13 }}>Chargement…</p>
    </div>
  )

  if (authState === 'unauthenticated') return <AuthPage />
  if (authState === 'onboarding') return <OnboardingPage user={user} />

  const role = profile?.role ?? 'admin' // default admin for localStorage mode

  return (
    <UserContext.Provider value={{ user, profile, role }}>
      <div className="app-shell">
        <Sidebar
          active={page}
          onNav={setPage}
          user={user}
          profile={profile}
          onSignOut={USE_AUTH ? () => supabase.auth.signOut() : null}
        />
        <main className="main">{renderPage()}</main>
      </div>
    </UserContext.Provider>
  )
}
