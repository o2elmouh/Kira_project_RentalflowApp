import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// t() returns the inline default when one is given, else the key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, d) => (typeof d === 'string' ? d : k), i18n: { language: 'fr' } }),
}))

const supabaseMock = {
  auth: {
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut:    vi.fn(),
  },
  from: vi.fn(),
  rpc:  vi.fn(),
}
const acceptInvite = vi.fn()

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock }))
vi.mock('../../lib/api', () => ({ api: { acceptInvite: (...a) => acceptInvite(...a) } }))
vi.mock('../../lib/db', () => ({ seedFleetConfig: vi.fn() }))
vi.mock('../../components/LanguageSelector', () => ({ default: () => null }))

const { default: OnboardingPage } = await import('../../pages/Onboarding.jsx')

const invitedUser = {
  id: 'invitee', email: 'new@example.com',
  app_metadata:  { invited_agency_id: 'agency-a', invited_role: 'staff' },
  user_metadata: { agency_id: 'agency-a', role: 'staff', full_name: 'New Person' },
}

function setPassword(pwd = 'Passw0rd!') {
  const inputs = document.querySelectorAll('input[type="password"]')
  fireEvent.change(inputs[0], { target: { value: pwd } })
  fireEvent.change(inputs[1], { target: { value: pwd } })
  fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
}

beforeEach(() => vi.clearAllMocks())

describe('Onboarding — invited staff', () => {
  it('joins through the backend and never writes profiles from the browser', async () => {
    acceptInvite.mockResolvedValue({ joined: true })
    const onDone = vi.fn()
    render(<OnboardingPage user={invitedUser} onDone={onDone} />)

    setPassword()

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: 'Passw0rd!' })
    expect(acceptInvite).toHaveBeenCalledWith({ full_name: 'New Person' })
    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })

  it('does not join before the password is set', () => {
    render(<OnboardingPage user={invitedUser} onDone={() => {}} />)
    expect(acceptInvite).not.toHaveBeenCalled()
  })

  it('shows the backend error when the join is refused', async () => {
    acceptInvite.mockRejectedValue(new Error('No pending invitation for this account'))
    const onDone = vi.fn()
    render(<OnboardingPage user={invitedUser} onDone={onDone} />)

    setPassword()

    expect(await screen.findByText('No pending invitation for this account')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('Onboarding — invitation sent before the server-side flow', () => {
  const staleUser = {
    id: 'old-invitee', email: 'old@example.com',
    app_metadata:  { provider: 'email' },
    user_metadata: { agency_id: 'agency-a', role: 'admin' },
  }

  it('asks for a new invitation instead of offering to create an agency', () => {
    render(<OnboardingPage user={staleUser} onDone={() => {}} />)

    expect(screen.getByText('staleInvite.title')).toBeInTheDocument()
    expect(screen.queryByText('step1.title')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(acceptInvite).not.toHaveBeenCalled()
  })
})

describe('Onboarding — regular signup', () => {
  it('still shows the create-agency form', () => {
    render(<OnboardingPage user={{ id: 'u1', email: 'owner@example.com', app_metadata: {}, user_metadata: {} }} onDone={() => {}} />)

    expect(screen.getByText('step1.title')).toBeInTheDocument()
    expect(acceptInvite).not.toHaveBeenCalled()
  })
})
