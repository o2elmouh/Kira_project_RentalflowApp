import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeadModal from '../../components/LeadModal.jsx'

vi.mock('../../lib/api.js', () => ({
  api: {
    updateLeadExtracted: vi.fn(),
    updateLeadStatus: vi.fn(),
  },
}))

vi.mock('../../components/SmartQuotePanel.jsx', () => ({
  default: () => null,
}))

const baseLead = {
  id: 'lead-1',
  source: 'whatsapp',
  sender_id: '212600000000@s.whatsapp.net',
  status: 'pending',
  extracted_data: { firstName: 'Ali', lastName: 'Benani' },
  confidence_scores: {},
  media_urls: [],
}

describe('LeadModal — Ignorer button', () => {
  it('closes the modal immediately on click without awaiting onStatusChange', () => {
    const onClose = vi.fn()
    // Promise that never resolves — proves close does not wait for the API.
    const onStatusChange = vi.fn(() => new Promise(() => {}))

    render(
      <LeadModal
        lead={baseLead}
        onClose={onClose}
        onConvert={() => {}}
        onStatusChange={onStatusChange}
      />
    )

    fireEvent.click(screen.getByText('Ignorer'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith('lead-1', 'ignored')
  })

  it('still closes the modal when onStatusChange rejects', async () => {
    const onClose = vi.fn()
    const onStatusChange = vi.fn(() => Promise.reject(new Error('network down')))

    render(
      <LeadModal
        lead={baseLead}
        onClose={onClose}
        onConvert={() => {}}
        onStatusChange={onStatusChange}
      />
    )

    fireEvent.click(screen.getByText('Ignorer'))

    expect(onClose).toHaveBeenCalledTimes(1)
    // Flush microtasks so the rejection is observed (and swallowed) by the handler.
    await Promise.resolve()
    await Promise.resolve()
  })
})
