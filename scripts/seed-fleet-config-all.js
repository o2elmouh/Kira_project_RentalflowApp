/**
 * scripts/seed-fleet-config-all.js
 * One-time migration: seed fleet_config defaults for all existing agencies.
 * Safe to run multiple times — skips agencies that already have rows.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-fleet-config-all.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const FLEET_CONFIG_DEFAULTS = [
  { make: 'Alfa Romeo',    warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',        warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Alpine',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Audi',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'BMW',           warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'BYD',           warrantyYears: 6,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '6 ans ou 150 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non (incluse)' },
  { make: 'Chery / Omoda', warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non' },
  { make: 'Citroën',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Dacia',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 7 ans (programme Zen)" },
  { make: 'DS',            warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Fiat',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Ford',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Geely',         warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non' },
  { make: 'Honda',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '—',                    extension: 'Non' },
  { make: 'Hyundai',       warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non (incluse)' },
  { make: 'Jaguar',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',         warrantyBattery: '—',                    extension: 'Non' },
  { make: 'Jeep',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Kia',           warrantyYears: 7,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '7 ans ou 150 000 km',         warrantyBattery: '7 ans ou 150 000 km',  extension: "Oui — jusqu'à 10 ans (EU)" },
  { make: 'Land Rover',    warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '—',                    extension: 'Non' },
  { make: 'Leapmotor',     warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 150 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non' },
  { make: 'Lexus',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (programme Relax)' },
  { make: 'Mazda',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '—',                    extension: 'Non' },
  { make: 'Mercedes',      warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '10 ans ou 250 000 km', extension: "Oui — jusqu'à 4 ans ou 150 000 km" },
  { make: 'MG',            warrantyYears: 6,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '6 ans ou 150 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non (incluse)' },
  { make: 'MINI',          warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Mitsubishi',    warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non' },
  { make: 'Nissan',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Non' },
  { make: 'Opel',          warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Peugeot',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 8 ans (Stellantis)" },
  { make: 'Renault',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Seat / Cupra',  warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Skoda',         warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Suzuki',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '—',                    extension: 'Non' },
  { make: 'Toyota',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km',  extension: "Oui — jusqu'à 10 ans (programme Relax)" },
  { make: 'Volkswagen',    warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
  { make: 'Volvo',         warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',         warrantyBattery: '8 ans ou 160 000 km',  extension: 'Oui (payante)' },
]

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function seedForAgency(agencyId) {
  const { count } = await supabase
    .from('fleet_config')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)

  if (count > 0) {
    console.log(`  ↳ ${agencyId} — already seeded (${count} rows), skipping`)
    return
  }

  const rows = FLEET_CONFIG_DEFAULTS.map(c => ({
    agency_id:          agencyId,
    brand:              c.make,
    warranty_general:   c.warrantyGeneral,
    warranty_years:     c.warrantyYears,
    warranty_battery:   c.warrantyBattery,
    warranty_extension: c.extension,
    control_tech_years: c.controlTechYears,
    oil_change_km:      c.vidangeKm,
    timing_belt_km:     c.courroieKm,
  }))

  const { error } = await supabase.from('fleet_config').insert(rows)
  if (error) {
    console.error(`  ✗ ${agencyId} — error:`, error.message)
  } else {
    console.log(`  ✓ ${agencyId} — seeded ${rows.length} brands`)
  }
}

async function main() {
  console.log('Fetching all agencies...')
  const { data: agencies, error } = await supabase.from('agencies').select('id, name')
  if (error) { console.error('Failed to fetch agencies:', error.message); process.exit(1) }

  console.log(`Found ${agencies.length} agencies\n`)
  for (const agency of agencies) {
    console.log(`[${agency.name}]`)
    await seedForAgency(agency.id)
  }
  console.log('\nDone.')
}

main()
