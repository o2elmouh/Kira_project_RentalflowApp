import { describe, it, expect } from 'vitest'
import { buildRentalPrefill } from '../../utils/leadToRental.js'
import { buildReservationPayload } from '../../utils/reservationPayload.js'

const waLead = { id: 'lead-1', source: 'whatsapp', sender_id: '212600123456@s.whatsapp.net' }
const gmailLead = { id: 'lead-2', source: 'gmail', sender_id: 'client@example.com' }
const extracted = {
  firstName: 'Hassan', lastName: 'Alami',
  cinNumber: 'BE123456', cinExpiry: '2028-01-01', lastDocumentType: 'ID_CARD',
  dateOfBirth: '1990-05-15', issuingCountry: 'MAR',
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

  // ── Regression v1.14.14: driving license & passport must flow through ─
  // Before: drivingLicenseNumber / licenseExpiry were hardcoded to '' and
  // passport numbers were silently coerced into cinNumber. A real client
  // who sent passport + driving license over WhatsApp ended up with an
  // empty Step 1 form (just the cinNumber field, mislabeled).
  describe('typed document fields (v1.14.14)', () => {
    const baseLead = waLead

    it('reads drivingLicenseNumber + licenseExpiry from typed slots', () => {
      const p = buildRentalPrefill(baseLead, {
        firstName: 'Otman', lastName: 'Elmouhib',
        drivingLicenseNumber: 'P-987654', licenseExpiry: '2028-12-31',
        cinNumber: 'AB123456', cinExpiry: '2030-05-01',
      })
      expect(p.drivingLicenseNumber).toBe('P-987654')
      expect(p.licenseExpiry).toBe('2028-12-31')
      expect(p.cinNumber).toBe('AB123456')
      expect(p.cinExpiry).toBe('2030-05-01')
    })

    it('exposes passportNumber + passportExpiry', () => {
      const p = buildRentalPrefill(baseLead, {
        passportNumber: 'AA9988776', passportExpiry: '2031-04-04',
      })
      expect(p.passportNumber).toBe('AA9988776')
      expect(p.passportExpiry).toBe('2031-04-04')
    })

    it('falls back to legacy flat keys when documentType matches CIN', () => {
      const p = buildRentalPrefill(baseLead, {
        documentType: 'ID_CARD', documentNumber: 'LEGACY-CIN', expiryDate: '2029-01-01',
      })
      expect(p.cinNumber).toBe('LEGACY-CIN')
      expect(p.cinExpiry).toBe('2029-01-01')
      expect(p.drivingLicenseNumber).toBe('')
    })

    it('falls back to legacy flat keys when documentType matches DRIVING_LICENSE', () => {
      const p = buildRentalPrefill(baseLead, {
        documentType: 'DRIVING_LICENSE', documentNumber: 'LEGACY-LIC', expiryDate: '2030-01-01',
      })
      expect(p.drivingLicenseNumber).toBe('LEGACY-LIC')
      expect(p.licenseExpiry).toBe('2030-01-01')
      expect(p.cinNumber).toBe('')
    })

    it('does NOT coerce a passport documentNumber into cinNumber (pre-fix bug)', () => {
      const p = buildRentalPrefill(baseLead, {
        documentType: 'PASSPORT', documentNumber: 'AA9988776', expiryDate: '2031-04-04',
      })
      expect(p.cinNumber).toBe('')
      expect(p.passportNumber).toBe('AA9988776')
      expect(p.passportExpiry).toBe('2031-04-04')
    })
  })

  // ── Regression v1.14.4: lead origin must reach the reservation row ────
  // Before this fix, the prefill object dropped lead.source and lead.id, so
  // every lead-converted reservation got stamped IN_PERSON regardless of
  // channel (Gmail leads showed "En personne" in the Booking Hub).
  describe('lead origin pass-through', () => {
    it('forwards source and id from the lead', () => {
      const p = buildRentalPrefill(gmailLead, extracted)
      expect(p.source).toBe('gmail')
      expect(p.id).toBe('lead-2')
    })

    it('drives correct source_channel via buildReservationPayload', () => {
      const rental = { startDate: '2026-06-01', endDate: '2026-06-05', totalPrice: 100, vehicle: { id: 'v', label: 'X' } }
      const client = { firstName: 'A', lastName: 'B', phone: '+1' }

      const gmailRes = buildReservationPayload({
        client, rental, prefilledLead: buildRentalPrefill(gmailLead, extracted),
      })
      const waRes = buildReservationPayload({
        client, rental, prefilledLead: buildRentalPrefill(waLead, extracted),
      })

      expect(gmailRes.source_channel).toBe('EMAIL')
      expect(waRes.source_channel).toBe('WHATSAPP')
    })

    it('preserves original_lead linkage in source_metadata', () => {
      const rental = { startDate: '2026-06-01', endDate: '2026-06-05', totalPrice: 100, vehicle: { id: 'v', label: 'X' } }
      const payload = buildReservationPayload({
        client: { firstName: 'A', lastName: 'B', phone: '+1' },
        rental,
        prefilledLead: buildRentalPrefill(gmailLead, extracted),
      })
      expect(payload.source_metadata.original_lead).toEqual({ id: 'lead-2', source: 'gmail' })
      expect(payload.lead_id).toBe('lead-2')
    })
  })
})
