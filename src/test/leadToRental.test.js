import { describe, it, expect } from 'vitest'
import { buildRentalPrefill } from '../../utils/leadToRental.js'

const waLead = { id: 'lead-1', source: 'whatsapp', sender_id: '212600123456@s.whatsapp.net' }
const gmailLead = { id: 'lead-2', source: 'gmail', sender_id: 'client@example.com' }
const extracted = {
  firstName: 'Hassan', lastName: 'Alami', documentNumber: 'BE123456',
  expiryDate: '2028-01-01', dateOfBirth: '1990-05-15', issuingCountry: 'MAR',
  rentalIntent: { detected: true, startDate: '2026-05-01', endDate: '2026-05-07', vehicleClass: 'SUV' },
}

describe('buildRentalPrefill', () => {
  it('maps client fields from extractedData', () => {
    const p = buildRentalPrefill(waLead, extracted)
    expect(p.firstName).toBe('Hassan')
    expect(p.cinNumber).toBe('BE123456')
    expect(p.nationality).toBe('Marocain')
    expect(p.leadId).toBe('lead-1')
  })
  it('extracts phone from WhatsApp sender_id', () => {
    const p = buildRentalPrefill(waLead, extracted)
    expect(p.phone).toBe('212600123456')
    expect(p.email).toBe('')
  })
  it('extracts email from Gmail sender_id', () => {
    const p = buildRentalPrefill(gmailLead, extracted)
    expect(p.email).toBe('client@example.com')
    expect(p.phone).toBe('')
  })
  it('maps rentalIntent dates', () => {
    const p = buildRentalPrefill(waLead, extracted)
    expect(p.rentalIntent.startDate).toBe('2026-05-01')
    expect(p.rentalIntent.vehicleClass).toBe('SUV')
  })
  it('handles missing extractedData gracefully', () => {
    const p = buildRentalPrefill(waLead, {})
    expect(p.firstName).toBe('')
    expect(p.nationality).toBe('Marocain')
  })
})
