import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'

// react-i18next mock: t() returns the key so assertions are locale-independent
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

const { default: PendingActivation } = await import('../../pages/PendingActivation.jsx')

describe('PendingActivation page', () => {
  it('renders the pending variant by default', () => {
    render(<PendingActivation status="pending" onSignOut={() => {}} />)
    expect(screen.getByText('pendingActivation.title')).toBeInTheDocument()
    expect(screen.getByText('pendingActivation.message')).toBeInTheDocument()
  })

  it('renders the blocked variant for status="blocked"', () => {
    render(<PendingActivation status="blocked" onSignOut={() => {}} />)
    expect(screen.getByText('pendingActivation.blockedTitle')).toBeInTheDocument()
    expect(screen.getByText('pendingActivation.blockedMessage')).toBeInTheDocument()
  })

  it('has a WhatsApp contact link and a working sign-out button', async () => {
    const onSignOut = vi.fn()
    render(<PendingActivation status="pending" onSignOut={onSignOut} />)
    const link = screen.getByRole('link', { name: 'pendingActivation.contact' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    screen.getByRole('button', { name: 'signOut' }).click()
    expect(onSignOut).toHaveBeenCalled()
  })
})
