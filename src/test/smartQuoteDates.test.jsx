import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../../lib/api.js', () => ({ api: { sendQuoteOffer: vi.fn(), sendQuoteOfferEmail: vi.fn() } }))
vi.mock('../../lib/db.js', () => ({ getAvailableVehicles: vi.fn().mockResolvedValue([]) }))

import SmartQuotePanel from '../../components/SmartQuotePanel.jsx'

function dateInputs() {
  // The two date inputs are the only type="date" fields in the panel.
  return document.querySelectorAll('input[type="date"]')
}

describe('SmartQuotePanel — extracted dates pre-fill the devis', () => {
  it('pre-fills from snake_case keys (text/audio routing lead)', () => {
    const lead = {
      id: 'l1', source: 'whatsapp', status: 'waiting',
      extracted_data: { classification: 'new_lead', start_date: '2026-07-01', end_date: '2026-07-05' },
    }
    render(<SmartQuotePanel lead={lead} onSent={() => {}} />)
    const [start, end] = dateInputs()
    expect(start.value).toBe('2026-07-01')
    expect(end.value).toBe('2026-07-05')
  })

  it('pre-fills from rentalIntent camelCase keys (document / OCR vision lead)', () => {
    const lead = {
      id: 'l2', source: 'whatsapp', status: 'waiting',
      extracted_data: { firstName: 'Sara', rentalIntent: { detected: true, startDate: '2026-08-10', endDate: '2026-08-20' } },
    }
    render(<SmartQuotePanel lead={lead} onSent={() => {}} />)
    const [start, end] = dateInputs()
    expect(start.value).toBe('2026-08-10')
    expect(end.value).toBe('2026-08-20')
  })

  it('leaves dates empty when none were extracted', () => {
    const lead = { id: 'l3', source: 'whatsapp', status: 'waiting', extracted_data: { classification: 'new_lead' } }
    render(<SmartQuotePanel lead={lead} onSent={() => {}} />)
    const [start, end] = dateInputs()
    expect(start.value).toBe('')
    expect(end.value).toBe('')
  })
})
