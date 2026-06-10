/**
 * Tests for App.jsx subscription gate — ensures pending/blocked agencies
 * are held at PendingActivation instead of rendering the app shell.
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'

// ── Supabase stub builders ────────────────────────────────────

const makeQueryStub = (result) => {
  const stub = { select: () => stub, eq: () => stub, maybeSingle: () => Promise.resolve(result) }
  return stub
}

// ── Module mocks (hoisted before imports) ─────────────────────

let supabaseMock = {
  auth: {
    getSession:        vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut:           vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

vi.mock('../../pages/Dashboard',         () => ({ default: () => <div data-testid="dashboard" /> }))
vi.mock('../../pages/NewRental',         () => ({ default: () => null }))
vi.mock('../../pages/Fleet',             () => ({ default: () => null }))
vi.mock('../../pages/Clients',           () => ({ default: () => null }))
vi.mock('../../pages/Contracts',         () => ({ default: () => null }))
vi.mock('../../pages/Invoices',          () => ({ default: () => null }))
vi.mock('../../pages/Settings',          () => ({ default: () => null }))
vi.mock('../../pages/Restitution',       () => ({ default: () => null }))
vi.mock('../../pages/RestitutionPicker', () => ({ default: () => null }))
vi.mock('../../pages/Auth',              () => ({ default: () => <div data-testid="auth" />, PasswordResetForm: () => null }))
vi.mock('../../pages/Onboarding',        () => ({ default: () => <div data-testid="onboarding" /> }))
vi.mock('../../pages/WelcomeScreen',     () => ({ default: () => null }))
vi.mock('../../pages/SignContract',      () => ({ default: () => null }))
vi.mock('../../pages/ContractSuccess',   () => ({ default: () => null }))
vi.mock('../../pages/Accounting',        () => ({ default: () => null }))
vi.mock('../../pages/Documents',         () => ({ default: () => null }))
vi.mock('../../pages/Calendar',          () => ({ default: () => null }))
vi.mock('../../pages/Basket',            () => ({ default: () => null }))
vi.mock('../../pages/Network',           () => ({ default: () => null }))
vi.mock('../../pages/Reservations',      () => ({ default: () => null }))
vi.mock('../../pages/legal/PrivacyPolicy', () => ({ default: () => null }))
vi.mock('../../pages/Confidentialite',   () => ({ default: () => null }))
vi.mock('../../components/Sidebar',      () => ({ default: () => null }))
vi.mock('../../pages/PendingActivation', () => ({
  default: ({ status }) => <div data-testid="pending-activation" data-status={status} />,
}))
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }) => children,
  useQuery: () => ({}),
}))
vi.mock('../../src/lib/queryClient', () => ({ queryClient: {} }))

const { default: App } = await import('../../App.jsx')

// ── Helpers ───────────────────────────────────────────────────

const sessionWith = (agency) => {
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-123', email: 't@e.com' } } },
  })
  supabaseMock.from.mockImplementation((table) => {
    if (table === 'profiles') return makeQueryStub({
      data: { id: 'user-123', full_name: 'T', email: 't@e.com', phone: '06', role: 'admin', agency_id: agency ? 'agency-abc' : null },
    })
    if (table === 'agencies') return makeQueryStub({ data: agency })
    return makeQueryStub({ data: null })
  })
}

// ── Tests ─────────────────────────────────────────────────────

describe('App.jsx subscription gate', () => {
  afterEach(() => cleanup())

  it('renders the app for an active agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'active' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument())
    expect(screen.queryByTestId('pending-activation')).toBeNull()
  })

  it('renders PendingActivation for a pending agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'pending' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('pending-activation')).toBeInTheDocument())
    expect(screen.getByTestId('pending-activation').dataset.status).toBe('pending')
  })

  it('renders PendingActivation (blocked variant) for a blocked agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'blocked' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('pending-activation')).toBeInTheDocument())
    expect(screen.getByTestId('pending-activation').dataset.status).toBe('blocked')
  })

  it('does NOT gate when the agency row could not be fetched (fail open on transient errors)', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123', email: 't@e.com' } } },
    })
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'profiles') return makeQueryStub({
        data: { id: 'user-123', full_name: 'T', email: 't@e.com', phone: '06', role: 'admin', agency_id: 'agency-abc' },
      })
      if (table === 'agencies') return makeQueryStub({ data: null })
      return makeQueryStub({ data: null })
    })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument())
  })
})
