const NATIONALITY_MAP = {
  MAR:'Marocain', FRA:'Français', ESP:'Espagnol', ITA:'Italien', DEU:'Allemand',
  GBR:'Britannique', BEL:'Belge', CHE:'Suisse', NLD:'Néerlandais', PRT:'Portugais',
  USA:'Américain', CAN:'Canadien', DZA:'Algérien', TUN:'Tunisien', LBY:'Libyen',
  EGY:'Égyptien', SAU:'Saoudien', ARE:'Émirati', QAT:'Qatarien', KWT:'Koweïtien',
  JOR:'Jordanien', LBN:'Libanais', TUR:'Turc',
}

export function buildRentalPrefill(lead, extractedData) {
  const ex = extractedData || {}
  const countryCode = (ex.issuingCountry || '').toUpperCase()
  const nationality = NATIONALITY_MAP[countryCode] || countryCode || 'Marocain'
  return {
    firstName:            ex.firstName || '',
    lastName:             ex.lastName  || '',
    cinNumber:            ex.documentNumber || '',
    cinExpiry:            ex.expiryDate  || '',
    dateOfBirth:          ex.dateOfBirth || '',
    nationality,
    drivingLicenseNumber: '',
    licenseExpiry:        '',
    phone:  lead.source === 'whatsapp' ? (lead.sender_id || '').replace('whatsapp:', '').replace(/@.*$/, '') : '',
    email:  lead.source === 'gmail'    ? (lead.sender_id || '') : '',
    rentalIntent: {
      detected:       !!(ex.rentalIntent?.detected || ex.start_date || ex.end_date || ex.pickup_location || ex.return_location),
      startDate:      ex.rentalIntent?.startDate || ex.start_date || null,
      endDate:        ex.rentalIntent?.endDate   || ex.end_date   || null,
      vehicleClass:   ex.rentalIntent?.vehicleClass || ex.requested_car || null,
      pickupLocation: ex.pickup_location || null,
      returnLocation: ex.return_location || null,
    },
    // Pass lead origin through so downstream consumers (NewRental wizard,
    // reservation payload builder) can stamp the correct source_channel
    // and preserve the link back to the original lead.
    id:     lead.id,
    source: lead.source,
    leadId: lead.id,
  }
}
