/**
 * Build the POST /reservations body from NewRental wizard state.
 *
 * Pure — no React, no network. Used by both wizard completion paths
 * (handleDone = finish without sign, ContractStep.onFinalized = sign &
 * navigate to success) so the Reservations Booking Hub stays in sync
 * regardless of which path the user takes.
 */
export function buildReservationPayload({ client, rental, prefilledLead }) {
  const sourceFromLead = prefilledLead?.source?.toLowerCase()
  const source_channel =
    sourceFromLead === 'whatsapp' ? 'WHATSAPP' :
    sourceFromLead === 'gmail' || sourceFromLead === 'email' ? 'EMAIL' :
    'IN_PERSON'

  const customer_name    = `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Client'
  const customer_contact = client?.phone || client?.email || client?.cinNumber || '—'
  const car_model =
    rental?.vehicle?.label ||
    [rental?.vehicle?.make, rental?.vehicle?.model].filter(Boolean).join(' ') ||
    'Véhicule'

  const start_date  = rental?.startDate ? new Date(rental.startDate).toISOString() : new Date().toISOString()
  const end_date    = rental?.endDate   ? new Date(rental.endDate).toISOString()   : new Date(Date.now() + 86_400_000).toISOString()
  // The NewRental wizard's `rental` state uses `totalTTC` as the canonical
  // field (see pages/rental/RentalStep.jsx where it's computed). `totalPrice`
  // and `total` are kept as backward-compat fallbacks for any external caller
  // that passes a hand-rolled rental object — but the wizard never sets them,
  // so v1.14.23 prepends totalTTC to the chain. Without this, the reservations
  // table always showed `total: 0`.
  const total_price = Number(rental?.totalTTC ?? rental?.totalPrice ?? rental?.total ?? 0)

  const leadId = prefilledLead?.leadId || prefilledLead?.id || null

  return {
    client_id:        client?.id || null,
    customer_name,
    customer_contact,
    vehicle_id:       rental?.vehicle?.id || null,
    car_model,
    start_date,
    end_date,
    total_price,
    currency:         'MAD',
    source_channel,
    status:           'CONFIRMED',
    source_metadata: {
      pending_demand_id: leadId,
      original_lead:     prefilledLead?.id ? { id: prefilledLead.id, source: prefilledLead.source } : null,
      created_via:       'new_rental_wizard',
      pickup_location:   rental?.pickupLocation || null,
      return_location:   rental?.returnLocation || null,
    },
    lead_id: leadId,
  }
}
