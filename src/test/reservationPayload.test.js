/**
 * Tests for utils/reservationPayload — pure helper consumed by both
 * NewRental.handleDone (finish) and handleFinalized (sign) paths.
 *
 * Regression: before v1.14.3 the sign path skipped reservation insert
 * entirely (ContractStep called onFinalized and never onDone), leaving
 * the Booking Hub empty. The helper now centralizes the payload so the
 * sign path can build the same body.
 */
import { describe, it, expect } from 'vitest'
import { buildReservationPayload } from '../../utils/reservationPayload'

const baseClient = {
  id: 'client-1',
  firstName: 'Otman',
  lastName: 'El Mouhib',
  phone: '+212600000000',
  email: 'o@example.com',
  cinNumber: 'AB123456',
}

const baseRental = {
  startDate: '2026-06-01T10:00:00.000Z',
  endDate:   '2026-06-05T10:00:00.000Z',
  totalPrice: 1200,
  vehicle: { id: 'veh-1', label: 'Dacia Logan 2024' },
  pickupLocation: 'Casablanca Airport',
  returnLocation: 'Marrakech Office',
}

describe('buildReservationPayload', () => {
  it('builds a CONFIRMED IN_PERSON reservation from wizard state with no lead', () => {
    const payload = buildReservationPayload({
      client: baseClient, rental: baseRental, prefilledLead: null,
    })

    expect(payload.client_id).toBe('client-1')
    expect(payload.customer_name).toBe('Otman El Mouhib')
    expect(payload.customer_contact).toBe('+212600000000')
    expect(payload.vehicle_id).toBe('veh-1')
    expect(payload.car_model).toBe('Dacia Logan 2024')
    expect(payload.start_date).toBe('2026-06-01T10:00:00.000Z')
    expect(payload.end_date).toBe('2026-06-05T10:00:00.000Z')
    expect(payload.total_price).toBe(1200)
    expect(payload.currency).toBe('MAD')
    expect(payload.status).toBe('CONFIRMED')
    expect(payload.source_channel).toBe('IN_PERSON')
    expect(payload.lead_id).toBeNull()
    expect(payload.source_metadata.pickup_location).toBe('Casablanca Airport')
    expect(payload.source_metadata.return_location).toBe('Marrakech Office')
    expect(payload.source_metadata.created_via).toBe('new_rental_wizard')
    expect(payload.source_metadata.original_lead).toBeNull()
  })

  it('maps WhatsApp lead source to WHATSAPP channel and stamps lead_id', () => {
    const payload = buildReservationPayload({
      client: baseClient,
      rental: baseRental,
      prefilledLead: { id: 'lead-9', leadId: 'lead-9', source: 'WhatsApp' },
    })
    expect(payload.source_channel).toBe('WHATSAPP')
    expect(payload.lead_id).toBe('lead-9')
    expect(payload.source_metadata.pending_demand_id).toBe('lead-9')
    expect(payload.source_metadata.original_lead).toEqual({ id: 'lead-9', source: 'WhatsApp' })
  })

  it('maps gmail and email lead source to EMAIL channel', () => {
    const gmail = buildReservationPayload({
      client: baseClient, rental: baseRental,
      prefilledLead: { id: 'l1', source: 'gmail' },
    })
    const email = buildReservationPayload({
      client: baseClient, rental: baseRental,
      prefilledLead: { id: 'l2', source: 'EMAIL' },
    })
    expect(gmail.source_channel).toBe('EMAIL')
    expect(email.source_channel).toBe('EMAIL')
  })

  it('falls back to "Client" when client has no name', () => {
    const payload = buildReservationPayload({
      client: { phone: '+1' }, rental: baseRental, prefilledLead: null,
    })
    expect(payload.customer_name).toBe('Client')
    expect(payload.customer_contact).toBe('+1')
  })

  it('falls back to make+model then "Véhicule" for car_model', () => {
    const makeModel = buildReservationPayload({
      client: baseClient,
      rental: { ...baseRental, vehicle: { id: 'v', make: 'Renault', model: 'Clio' } },
      prefilledLead: null,
    })
    const none = buildReservationPayload({
      client: baseClient,
      rental: { ...baseRental, vehicle: { id: 'v' } },
      prefilledLead: null,
    })
    expect(makeModel.car_model).toBe('Renault Clio')
    expect(none.car_model).toBe('Véhicule')
  })

  it('reads totalPrice from rental.total when totalPrice is missing', () => {
    const payload = buildReservationPayload({
      client: baseClient,
      rental: { ...baseRental, totalPrice: undefined, total: 999 },
      prefilledLead: null,
    })
    expect(payload.total_price).toBe(999)
  })

  // v1.14.23 — the NewRental wizard's `rental` object only ever has `totalTTC`;
  // `totalPrice` was a phantom field that always resolved to 0 in production.
  // totalTTC must take precedence over the legacy fallbacks.
  it('reads total_price from rental.totalTTC (the canonical wizard field)', () => {
    const payload = buildReservationPayload({
      client: baseClient,
      rental: { ...baseRental, totalPrice: undefined, total: undefined, totalTTC: 1444 },
      prefilledLead: null,
    })
    expect(payload.total_price).toBe(1444)
  })

  it('prefers rental.totalTTC over totalPrice / total when all three are set', () => {
    // Defensive — if a caller somehow sets all three, the wizard's canonical
    // field wins so we never silently use a stale legacy value.
    const payload = buildReservationPayload({
      client: baseClient,
      rental: { ...baseRental, totalTTC: 2000, totalPrice: 1000, total: 500 },
      prefilledLead: null,
    })
    expect(payload.total_price).toBe(2000)
  })

  it('does not throw when rental and client are empty', () => {
    expect(() =>
      buildReservationPayload({ client: {}, rental: {}, prefilledLead: null })
    ).not.toThrow()
  })
})
