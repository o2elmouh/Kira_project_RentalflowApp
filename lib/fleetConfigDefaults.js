/**
 * lib/fleetConfigDefaults.js
 * Default fleet maintenance configuration per brand.
 * Source: Fleet_Config.csv — loaded for every new agency on onboarding.
 */

export const FLEET_CONFIG_DEFAULTS = [
  { make: 'Alfa Romeo',    warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',       warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Alpine',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',         warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Audi',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'BMW',           warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'BYD',           warrantyYears: 6,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '6 ans ou 150 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non (incluse)' },
  { make: 'Chery / Omoda', warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non' },
  { make: 'Citroën',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Dacia',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 7 ans (programme Zen)' },
  { make: 'DS',            warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Fiat',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Ford',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Geely',         warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non' },
  { make: 'Honda',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '—',                   extension: 'Non' },
  { make: 'Hyundai',       warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non (incluse)' },
  { make: 'Jaguar',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',          warrantyBattery: '—',                   extension: 'Non' },
  { make: 'Jeep',          warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Kia',           warrantyYears: 7,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '7 ans ou 150 000 km',          warrantyBattery: '7 ans ou 150 000 km', extension: 'Oui — jusqu\'à 10 ans (EU)' },
  { make: 'Land Rover',    warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '—',                   extension: 'Non' },
  { make: 'Leapmotor',     warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 150 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non' },
  { make: 'Lexus',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (programme Relax)' },
  { make: 'Mazda',         warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '—',                   extension: 'Non' },
  { make: 'Mercedes',      warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '10 ans ou 250 000 km',extension: 'Oui — jusqu\'à 4 ans ou 150 000 km' },
  { make: 'MG',            warrantyYears: 6,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '6 ans ou 150 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non (incluse)' },
  { make: 'MINI',          warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Mitsubishi',    warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non' },
  { make: 'Nissan',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Non' },
  { make: 'Opel',          warrantyYears: 5,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '5 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Peugeot',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 8 ans (Stellantis)' },
  { make: 'Renault',       warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Seat / Cupra',  warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Skoda',         warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Suzuki',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '—',                   extension: 'Non' },
  { make: 'Toyota',        warrantyYears: 3,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '3 ans ou 100 000 km',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui — jusqu\'à 10 ans (programme Relax)' },
  { make: 'Volkswagen',    warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
  { make: 'Volvo',         warrantyYears: 2,  controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, warrantyGeneral: '2 ans · km illimité',          warrantyBattery: '8 ans ou 160 000 km', extension: 'Oui (payante)' },
]

/** Quick sync lookup by make — used in Fleet.jsx, DeadlinesTab, VehicleDetail */
export function getDefaultConfigForMake(make) {
  if (!make) return null
  return FLEET_CONFIG_DEFAULTS.find(c => c.make.toLowerCase() === make.toLowerCase()) || null
}
