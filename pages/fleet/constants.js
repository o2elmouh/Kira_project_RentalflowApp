import { getFleetConfigForMake } from '../../lib/db'

// ── Car catalogue ─────────────────────────────────────────
export const CAR_CATALOGUE = {
  'Dacia':         ['Logan', 'Sandero', 'Duster', 'Dokker', 'Lodgy', 'Spring'],
  'Renault':       ['Clio', 'Megane', 'Symbol', 'Kadjar', 'Captur', 'Koleos', 'Talisman', 'Scenic'],
  'Peugeot':       ['208', '301', '308', '2008', '3008', '5008', 'Partner', 'Expert'],
  'Citroën':       ['C3', 'C4', 'C5 Aircross', 'Berlingo', 'Jumpy'],
  'Volkswagen':    ['Polo', 'Golf', 'Passat', 'Tiguan', 'T-Roc', 'Touareg', 'Caddy', 'Transporter'],
  'Toyota':        ['Yaris', 'Corolla', 'Camry', 'C-HR', 'RAV4', 'Hilux', 'Land Cruiser', 'Prado'],
  'Hyundai':       ['i10', 'i20', 'i30', 'Tucson', 'Santa Fe', 'Elantra', 'Accent', 'Creta'],
  'Kia':           ['Picanto', 'Rio', 'Cerato', 'Sportage', 'Sorento', 'Stonic', 'Niro'],
  'Ford':          ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'EcoSport', 'Ranger', 'Transit'],
  'Fiat':          ['500', 'Punto', 'Tipo', 'Bravo', 'Doblo', 'Ducato'],
  'Seat':          ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco'],
  'Skoda':         ['Fabia', 'Octavia', 'Superb', 'Karoq', 'Kodiaq'],
  'Opel':          ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Grandland'],
  'Nissan':        ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Navara', 'Patrol'],
  'Mitsubishi':    ['Colt', 'Lancer', 'Outlander', 'Eclipse Cross', 'L200', 'Pajero'],
  'Suzuki':        ['Alto', 'Swift', 'Vitara', 'S-Cross', 'Jimny'],
  'Honda':         ['Jazz', 'Civic', 'Accord', 'CR-V', 'HR-V'],
  'Mazda':         ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-30'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'Classe E', 'Classe S', 'GLA', 'GLC', 'GLE', 'Sprinter', 'Vito'],
  'BMW':           ['Série 1', 'Série 3', 'Série 5', 'X1', 'X3', 'X5', 'X6'],
  'Audi':          ['A1', 'A3', 'A4', 'A6', 'Q2', 'Q3', 'Q5', 'Q7'],
  'Land Rover':    ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque'],
  'Jeep':          ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'],
  'Chevrolet':     ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Trax'],
  'Chery':         ['Tiggo 4', 'Tiggo 7', 'Arrizo 5'],
  'BYD':           ['Atto 3', 'Han', 'Tang', 'Seal'],
  'MG':            ['MG3', 'MG5', 'MG6', 'ZS', 'HS', 'EHS'],
}

export const MAKES = Object.keys(CAR_CATALOGUE).sort()
export const YEARS = Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i)
export const AR_LETTERS = ['أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي']

export const REFERENCE_PHOTO_SLOTS = [
  { id: 'front',    label: 'Avant' },
  { id: 'rear',     label: 'Arrière' },
  { id: 'left',     label: 'Côté gauche' },
  { id: 'right',    label: 'Côté droit' },
  { id: 'interior', label: 'Intérieur' },
  { id: 'detail',   label: 'Détail' },
]

export const REPAIR_TYPES = ['Vidange', 'Courroie de distribution', 'Freins', 'Pneus', 'Batterie', 'Embrayage', 'Suspension', 'Climatisation', 'Électronique', 'Carrosserie', 'Révision générale', 'Autre']
export const EMPTY_REPAIR = { date: new Date().toISOString().split('T')[0], type: 'Vidange', description: '', cost: '', garage: '', mileage: '' }

export const EMPTY_INLINE_REPAIR = {
  date: new Date().toISOString().split('T')[0],
  type: 'Vidange', label: '', cost: '', garage: '', mileage: '',
  isSinistre: false, sinistreId: '', insuranceRef: '',
  insuranceReimbursement: '', clientFranchise: '', contractId: '',
}

export function parsePlate(plate = '') {
  const parts = plate.split('|')
  return { serial: parts[0] || '', letter: parts[1] || 'أ', region: parts[2] || '01' }
}

export function buildPlate(s, l, r) { return `${s}|${l}|${r}` }

export function displayPlate(plate = '') {
  const { serial, letter, region } = parsePlate(plate)
  if (!serial) return plate
  return `${region} ${letter} ${serial}`
}

export function computeDeadlinesFromConfig(vehicle) {
  const config   = getFleetConfigForMake(vehicle.make)
  const mileage  = Number(vehicle.mileage) || 0
  const purchase = vehicle.purchaseDate || (vehicle.year ? `${vehicle.year}-01-01` : null)

  const addYears = (dateStr, n) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    d.setFullYear(d.getFullYear() + n)
    return d.toISOString().split('T')[0]
  }

  return {
    // mileage-based (stored as km targets, not dates)
    nextOilChangeMileage:  vehicle.nextOilChangeMileage  || (mileage + 5000),
    nextTimingBeltMileage: vehicle.nextTimingBeltMileage || (config ? mileage + config.courroieKm : ''),
    // date-based — use vehicle value if set, otherwise compute from config
    warrantyEnd:    vehicle.warrantyEnd    || (config && purchase ? addYears(purchase, config.warrantyYears)        : ''),
    nextControleTech: vehicle.nextControleTech || (config && purchase ? addYears(purchase, config.controlTechYears) : ''),
    nextOilChange:  vehicle.nextOilChange  || '',
    nextTimingBelt: vehicle.nextTimingBelt || '',
    nextRepair:     vehicle.nextRepair     || '',
    plannedSaleDate: vehicle.plannedSaleDate || '',
  }
}
