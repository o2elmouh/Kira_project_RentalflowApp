/**
 * Tests for App.jsx resolveUser — covers the profile-query timeout / retry path.
 *
 * Strategy: mock `lib/supabase` to control what Supabase returns per test.
 * No fake timers — for timeout scenarios we reject immediately (same code path
 * as a real timeout, just faster).
 */
import { render, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Supabase stub builders ────────────────────────────────────

const makeQueryStub = (result) => {
  const stub = { select: () => stub, eq: () => stub, maybeSingle: () => Promise.resolve(result) }
  return stub
}

const makeRejectStub = (msg = 'Profile query timed out') => {
  const stub = { select: () => stub, eq: () => stub, maybeSingle: () => Promise.reject(new Error(msg)) }
  return stub
}

// ── Module mock (hoisted before imports) ─────────────────────

let supabaseMock = {
  auth: {
    getSession:        vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  from: vi.fn(),
}

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock }))

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
vi.mock('../../pages/Accounting',        () => ({ default: () => null }))
vi.mock('../../pages/Basket',            () => ({ default: () => null }))
vi.mock('../../components/Sidebar',      () => ({ default: () => null }))

const { default: App } = await import('../../App.jsx')

// ── Fixtures ──────────────────────────────────────────────────

const getMockUser    = (o = {}) => ({ id: 'user-123', email: 'test@example.com', ...o })
const getMockProfile = (o = {}) => ({ id: 'user-123', full_name: 'Test User', email: 'test@example.com', phone: '0600000000', role: 'admin', agency_id: 'agency-abc', ...o })
const getMockAgency  = (o = {}) => ({ id: 'agency-abc', name: 'Test Agency', ...o })

// ── Tests ─────────────────────────────────────────────────────

describe('resolveUser', () => {
  beforeEach(() => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard when profile and agency load successfully', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: getMockUser() } },
      error: null,
    })
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'profiles') return makeQueryStub({ data: getMockProfile(), error: null })
      if (table === 'agencies') return makeQueryStub({ data: getMockAgency(), error: null })
      return makeQueryStub({ data: null, error: null })
    })

    const { getByTestId } = render(<App />)
    await waitFor(() => getByTestId('dashboard'), { timeout: 5000 })
  })

  it('redirects to onboarding when profile is null (new user)', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: getMockUser() } },
      error: null,
    })
    supabaseMock.from.mockImplementation(() => makeQueryStub({ data: null, error: null }))

    const { getByTestId } = render(<App />)
    await waitFor(() => getByTestId('onboarding'), { timeout: 5000 })
  })

  it('retries once on first timeout and succeeds on retry → dashboard', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: getMockUser() } },
      error: null,
    })

    let profileCallCount = 0
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'profiles') {
        profileCallCount++
        return profileCallCount === 1
          ? makeRejectStub('Profile query timed out')       // first call: timeout
          : makeQueryStub({ data: getMockProfile(), error: null }) // retry: success
      }
      if (table === 'agencies') return makeQueryStub({ data: getMockAgency(), error: null })
      return makeQueryStub({ data: null, error: null })
    })

    const { getByTestId } = render(<App />)
    await waitFor(() => getByTestId('dashboard'), { timeout: 5000 })
    expect(profileCallCount).toBe(2) // confirms retry happened
  })

  it('falls back to onboarding (not broken ready state) when both attempts time out', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: getMockUser() } },
      error: null,
    })
    // Both calls reject immediately — simulates two consecutive timeouts
    supabaseMock.from.mockImplementation(() => makeRejectStub('Profile query timed out'))

    const { getByTestId } = render(<App />)
    await waitFor(() => getByTestId('onboarding'), { timeout: 5000 })
  })

  it('shows auth page when no session exists', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    const { getByTestId } = render(<App />)
    await waitFor(() => getByTestId('auth'), { timeout: 5000 })
  })
})
