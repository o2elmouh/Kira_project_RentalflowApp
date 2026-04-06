// Shared rental options constants and loader used by NewRental and Settings

import { getGeneralConfig } from '../storage'

export const DEFAULT_RENTAL_OPTIONS = [
  { id: 'cdw', name: 'CDW — Collision Damage Waiver', pricingType: 'per_day', price: 80, enabled: true },
  { id: 'pai', name: 'PAI — Protection Accident Individuel', pricingType: 'per_day', price: 50, enabled: true },
]

export function getRentalOptions() {
  try {
    const cfg = getGeneralConfig()
    return cfg.rentalOptions && cfg.rentalOptions.length > 0 ? cfg.rentalOptions : DEFAULT_RENTAL_OPTIONS
  } catch {
    return DEFAULT_RENTAL_OPTIONS
  }
}
