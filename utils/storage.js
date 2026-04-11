// Keys
const KEYS = {
  clients:        'rf_clients',
  contracts:      'rf_contracts',
  fleet:          'rf_fleet',
  invoices:       'rf_invoices',
  agency:         'rf_agency',
  repairs:        'rf_repairs',
  accounts:       'rf_accounts',
  transactions:   'rf_transactions',
  journalEntries: 'rf_journal_entries',
  deposits:       'rf_deposits',
  snapshots:      'rf_snapshots',
  telemetryMap:   'rf_telemetry_map',    // deviceId ↔ vehicleId mapping + provider config
}

const read  = k => JSON.parse(localStorage.getItem(k) || '[]')
const readO = k => JSON.parse(localStorage.getItem(k) || '{}')
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// ── Agency ──────────────────────────────────────────────
export const getAgency = () => readO(KEYS.agency)
export const saveAgency = (data) => write(KEYS.agency, data)

// ── General Config ───────────────────────────────────────
export const getGeneralConfig = () => JSON.parse(localStorage.getItem('rf_general_config') || '{}')
export const saveGeneralConfig = (data) => localStorage.setItem('rf_general_config', JSON.stringify(data))

// ── Clients ──────────────────────────────────────────────
export const getClients = () => read(KEYS.clients)
export const saveClient = (client) => {
  const list = read(KEYS.clients)
  const existing = list.findIndex(c => c.id === client.id)
  if (existing >= 0) list[existing] = client
  else list.unshift({ ...client, id: client.id || uid(), createdAt: new Date().toISOString() })
  write(KEYS.clients, list)
  return list[existing >= 0 ? existing : 0]
}
export const getClient = (id) => read(KEYS.clients).find(c => c.id === id)
export const deleteClient = (id) => write(KEYS.clients, read(KEYS.clients).filter(c => c.id !== id))

// ── Fleet ────────────────────────────────────────────────
export const getFleet = () => read(KEYS.fleet)
export const saveVehicle = (vehicle) => {
  const list = read(KEYS.fleet)
  const idx = list.findIndex(v => v.id === vehicle.id)
  if (idx >= 0) list[idx] = vehicle
  else list.unshift({ ...vehicle, id: vehicle.id || uid(), addedAt: new Date().toISOString() })
  write(KEYS.fleet, list)
}
export const getVehicle = (id) => read(KEYS.fleet).find(v => v.id === id) || null
export const deleteVehicle = (id) => write(KEYS.fleet, read(KEYS.fleet).filter(v => v.id !== id))
export const getAvailableVehicles = (startDate, endDate) => {
  const fleet = read(KEYS.fleet)
  const contracts = read(KEYS.contracts).filter(c => c.status !== 'closed' && c.status !== 'cancelled')
  return fleet.filter(v => {
    const inUse = contracts.some(c => {
      if (c.vehicleId !== v.id) return false
      const cStart = new Date(c.startDate)
      const cEnd   = new Date(c.endDate)
      const rStart = new Date(startDate)
      const rEnd   = new Date(endDate)
      return rStart < cEnd && rEnd > cStart
    })
    return !inUse && v.status !== 'maintenance'
  })
}

// ── Contracts ────────────────────────────────────────────
export const getContracts = () => read(KEYS.contracts)
export const saveContract = (contract) => {
  const list = read(KEYS.contracts)
  const newContract = {
    ...contract,
    id: contract.id || uid(),
    createdAt: new Date().toISOString(),
    contractNumber: contract.contractNumber || (() => {
      const seq = (parseInt(localStorage.getItem('rf_contract_seq') || '0', 10)) + 1
      localStorage.setItem('rf_contract_seq', String(seq))
      return `RF-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
    })(),
  }
  list.unshift(newContract)
  write(KEYS.contracts, list)
  return newContract
}
export const updateContract = (id, data) => {
  const list = read(KEYS.contracts)
  const idx = list.findIndex(c => c.id === id)
  if (idx >= 0) { list[idx] = { ...list[idx], ...data }; write(KEYS.contracts, list) }
}
export const getContract = (id) => read(KEYS.contracts).find(c => c.id === id)

// ── Invoices ─────────────────────────────────────────────
export const getInvoices = () => read(KEYS.invoices)
export const saveInvoice = (invoice) => {
  const list = read(KEYS.invoices)
  const newInv = {
    ...invoice,
    id: invoice.id || uid(),
    createdAt: new Date().toISOString(),
    invoiceNumber: invoice.invoiceNumber || (() => {
      const seq = (parseInt(localStorage.getItem('rf_invoice_seq') || '0', 10)) + 1
      localStorage.setItem('rf_invoice_seq', String(seq))
      return `INV-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
    })(),
    status: invoice.status || 'pending',
  }
  list.unshift(newInv)
  write(KEYS.invoices, list)
  return newInv
}

export const updateInvoice = (id, data) => {
  const list = read(KEYS.invoices)
  const idx = list.findIndex(i => i.id === id)
  if (idx >= 0) { list[idx] = { ...list[idx], ...data }; write(KEYS.invoices, list) }
}

// ── Fleet Config ─────────────────────────────────────────
const DEFAULT_FLEET_CONFIG = [
  { make: 'Alfa Romeo', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Alpine', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Audi', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'BMW', warrantyGeneral: '3 ans · km illimité', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'BYD', warrantyGeneral: '6 ans ou 150 000 km', warrantyYears: 6, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non (incluse)' },
  { make: 'Chery / Omoda', warrantyGeneral: '5 ans ou 100 000 km', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Citroën', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Dacia', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 7 ans (programme Zen)' },
  { make: 'DS', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Fiat', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Ford', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Geely', warrantyGeneral: '5 ans ou 100 000 km', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Honda', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '—', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Hyundai', warrantyGeneral: '5 ans · km illimité', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non (incluse)' },
  { make: 'Jaguar', warrantyGeneral: '3 ans · km illimité', warrantyYears: 3, warrantyBattery: '—', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Jeep', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Kia', warrantyGeneral: '7 ans ou 150 000 km', warrantyYears: 7, warrantyBattery: '7 ans ou 150 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 10 ans (EU)' },
  { make: 'Land Rover', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '—', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Leapmotor', warrantyGeneral: '5 ans ou 150 000 km', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Lexus', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (programme Relax)' },
  { make: 'Mazda', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '—', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Mercedes', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '10 ans ou 250 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 4 ans ou 150 000 km' },
  { make: 'MG', warrantyGeneral: '6 ans ou 150 000 km', warrantyYears: 6, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non (incluse)' },
  { make: 'MINI', warrantyGeneral: '3 ans · km illimité', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Mitsubishi', warrantyGeneral: '5 ans ou 100 000 km', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Nissan', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Opel', warrantyGeneral: '5 ans · km illimité', warrantyYears: 5, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Peugeot', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 8 ans (Stellantis)' },
  { make: 'Renault', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Seat / Cupra', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Skoda', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Suzuki', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '—', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Non' },
  { make: 'Toyota', warrantyGeneral: '3 ans ou 100 000 km', warrantyYears: 3, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui – jusqu\'à 10 ans (programme Relax)' },
  { make: 'Volkswagen', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
  { make: 'Volvo', warrantyGeneral: '2 ans · km illimité', warrantyYears: 2, warrantyBattery: '8 ans ou 160 000 km', controlTechYears: 5, vidangeKm: 10000, courroieKm: 80000, extension: 'Oui (payante)' },
]

export const getFleetConfig = () => {
  const stored = JSON.parse(localStorage.getItem('rf_fleet_config') || 'null')
  return stored || DEFAULT_FLEET_CONFIG
}
export const saveFleetConfig = (data) => localStorage.setItem('rf_fleet_config', JSON.stringify(data))
export const resetFleetConfig = () => { localStorage.removeItem('rf_fleet_config'); return DEFAULT_FLEET_CONFIG }
export const getFleetConfigForMake = (make) => {
  const list = getFleetConfig()
  return list.find(c => c.make.toLowerCase() === (make || '').toLowerCase()) || null
}

// ── Repairs ──────────────────────────────────────────────
// Repair object shape (all sinistre fields are optional — existing records are unaffected):
// {
//   id, vehicleId, date, type, cost, garage, mileage, description,
//   isSinistre: false,            // bool  — flags accident-related repair
//   sinistreId: '',               // string — groups repairs from the same accident
//   insuranceRef: '',             // insurance claim reference number
//   insuranceReimbursement: 0,    // amount reimbursed by insurer  (Credit 758)
//   clientFranchise: 0,           // deductible paid by client     (Credit 411)
//   contractId: null,             // optional link to the rental that caused the accident
// }

export const getRepairs = (vehicleId) => read(KEYS.repairs).filter(r => r.vehicleId === vehicleId)
export const saveRepair = (repair) => {
  const list = read(KEYS.repairs)
  const idx = list.findIndex(r => r.id === repair.id)
  const entry = { ...repair, id: repair.id || uid() }
  if (idx >= 0) list[idx] = entry
  else list.unshift(entry)
  write(KEYS.repairs, list)
  return entry
}
export const deleteRepair = (id) => write(KEYS.repairs, read(KEYS.repairs).filter(r => r.id !== id))

// TCO — Total Cost of Ownership per vehicle
// TCO = Σ repair costs − (Σ insurance reimbursements + Σ client franchises)
export const getTCO = (vehicleId) => {
  const repairs = read(KEYS.repairs).filter(r => r.vehicleId === vehicleId)
  const totalExpense      = repairs.reduce((s, r) => s + (Number(r.cost) || 0), 0)
  const totalInsurance    = repairs.reduce((s, r) => s + (Number(r.insuranceReimbursement) || 0), 0)
  const totalFranchise    = repairs.reduce((s, r) => s + (Number(r.clientFranchise) || 0), 0)
  const totalRecovered    = totalInsurance + totalFranchise
  return { totalExpense, totalInsurance, totalFranchise, totalRecovered, netTCO: totalExpense - totalRecovered }
}

// ── Seed demo data ────────────────────────────────────────
export const seedDemoData = () => {
  if (read(KEYS.fleet).length > 0) return

  saveAgency({ name: 'Atlas Car Rental', city: 'Casablanca', address: '23 Bd Anfa, Casablanca', phone: '+212 522 000 000', ice: '001234567000050', rc: 'RC-12345' })

  const vehicles = [
    { id: 'v1', make: 'Dacia', model: 'Logan', year: 2022, plate: '12345|أ|21', category: 'Economy', dailyRate: 250, status: 'available', mileage: 42000, color: 'White', fuelType: 'Essence' },
    { id: 'v2', make: 'Renault', model: 'Clio', year: 2023, plate: '67890|ب|22', category: 'Economy', dailyRate: 280, status: 'available', mileage: 18000, color: 'Red', fuelType: 'Essence' },
    { id: 'v3', make: 'Dacia', model: 'Duster', year: 2022, plate: '11223|ج|25', category: 'SUV', dailyRate: 450, status: 'available', mileage: 35000, color: 'Grey', fuelType: 'Diesel' },
    { id: 'v4', make: 'Peugeot', model: '208', year: 2023, plate: '44556|د|21', category: 'Economy', dailyRate: 300, status: 'rented', mileage: 22000, color: 'Blue', fuelType: 'Essence' },
    { id: 'v5', make: 'Toyota', model: 'Corolla', year: 2021, plate: '77889|ه|22', category: 'Sedan', dailyRate: 380, status: 'maintenance', mileage: 68000, color: 'Silver', fuelType: 'Hybride' },
  ]
  vehicles.forEach(v => write(KEYS.fleet, [...read(KEYS.fleet), { ...v, addedAt: new Date().toISOString() }]))

  const client = { id: 'c1', firstName: 'Youssef', lastName: 'Bennani', cinNumber: 'AB123456', cinExpiry: '2028-06-15', drivingLicenseNumber: 'P12345678', licenseExpiry: '2027-09-20', phone: '+212 661 000 111', email: 'youssef.bennani@gmail.com', nationality: 'Marocain', createdAt: new Date().toISOString() }
  write(KEYS.clients, [client])

  const demoContract = {
    id: 'cnt1',
    contractNumber: 'RF-2026-0001',
    clientId: 'c1',
    clientName: 'Youssef Bennani',
    vehicleId: 'v1',
    vehicleName: 'Dacia Logan 2022',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    startTime: '09:00',
    endTime: '18:00',
    days: 4,
    dailyRate: 250,
    fuelLevel: 'Plein',
    totalHT: 833,
    tva: 167,
    totalTTC: 1000,
    status: 'closed',
    createdAt: new Date('2026-03-01').toISOString(),
    photos: {},
  }
  write(KEYS.contracts, [demoContract])

  const demoInvoice = {
    id: 'inv1',
    invoiceNumber: 'INV-2026-0001',
    contractId: 'cnt1',
    contractNumber: 'RF-2026-0001',
    clientId: 'c1',
    clientName: 'Youssef Bennani',
    vehicleName: 'Dacia Logan 2022',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    days: 4,
    totalHT: 833,
    tva: 167,
    totalTTC: 1000,
    status: 'paid',
    createdAt: new Date('2026-03-05').toISOString(),
  }
  write(KEYS.invoices, [demoInvoice])

  // Also initialize sequence counters
  localStorage.setItem('rf_contract_seq', '1')
  localStorage.setItem('rf_invoice_seq', '1')

  const activeContract = {
    id: 'cnt2',
    contractNumber: 'RF-2026-0002',
    clientId: 'c1',
    clientName: 'Youssef Bennani',
    vehicleId: 'v4',
    vehicleName: 'Peugeot 208 2023',
    startDate: '2026-03-25',
    endDate: '2026-03-30',
    startTime: '09:00',
    endTime: '18:00',
    days: 5,
    dailyRate: 300,
    fuelLevel: 'Plein',
    totalHT: 1250,
    tva: 250,
    totalTTC: 1500,
    status: 'active',
    createdAt: new Date('2026-03-25').toISOString(),
    photos: {},
  }
  write(KEYS.contracts, [demoContract, activeContract])
  localStorage.setItem('rf_contract_seq', '2')
}

// ── Accounting: Chart of Accounts ────────────────────────
const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Caisse / Espèces',                  type: 'asset',     normalBalance: 'debit',  category: 'Actifs' },
  { code: '1010', name: 'Banque',                             type: 'asset',     normalBalance: 'debit',  category: 'Actifs' },
  { code: '1100', name: 'Créances clients',                   type: 'asset',     normalBalance: 'debit',  category: 'Actifs' },
  { code: '1200', name: 'Dépôts de garantie à recevoir',      type: 'asset',     normalBalance: 'debit',  category: 'Actifs' },
  { code: '1300', name: 'Parc automobile',                    type: 'asset',     normalBalance: 'debit',  category: 'Actifs' },
  { code: '2000', name: 'Dépôts de garantie clients',         type: 'liability', normalBalance: 'credit', category: 'Passifs' },
  { code: '2100', name: 'TVA collectée (20%)',                 type: 'liability', normalBalance: 'credit', category: 'Passifs' },
  { code: '2200', name: 'Fournisseurs',                        type: 'liability', normalBalance: 'credit', category: 'Passifs' },
  { code: '3000', name: "Chiffre d'affaires — Location",       type: 'revenue',   normalBalance: 'credit', category: 'Produits' },
  { code: '3010', name: 'Extras et assurances',                type: 'revenue',   normalBalance: 'credit', category: 'Produits' },
  { code: '3020', name: 'Frais de restitution',                type: 'revenue',   normalBalance: 'credit', category: 'Produits' },
  { code: '3030', name: 'Frais kilométriques supplémentaires', type: 'revenue',   normalBalance: 'credit', category: 'Produits' },
  { code: '4000', name: 'Entretien et réparations',            type: 'expense',   normalBalance: 'debit',  category: 'Charges' },
  { code: '4010', name: 'Carburant',                           type: 'expense',   normalBalance: 'debit',  category: 'Charges' },
  { code: '4020', name: 'Assurances véhicules',                type: 'expense',   normalBalance: 'debit',  category: 'Charges' },
  { code: '4030', name: 'Commission plateforme',               type: 'expense',   normalBalance: 'debit',  category: 'Charges' },
  { code: '4040', name: 'Amortissements',                      type: 'expense',   normalBalance: 'debit',  category: 'Charges' },
]

export const getAccounts = () => read(KEYS.accounts)

export const saveAccount = (account) => {
  const list = read(KEYS.accounts)
  const idx = list.findIndex(a => a.id === account.id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...account }
  } else {
    list.push({ ...account, id: account.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()), createdAt: new Date().toISOString() })
    list.sort((a, b) => a.code.localeCompare(b.code))
  }
  write(KEYS.accounts, list)
}

export const initDefaultAccounts = () => {
  const existing = read(KEYS.accounts)
  if (existing.length > 0) return
  const seeded = DEFAULT_ACCOUNTS.map(a => ({
    ...a,
    id: (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()),
    isSystem: true,
    createdAt: new Date().toISOString(),
  }))
  write(KEYS.accounts, seeded)
}

// ── Accounting: Transactions ──────────────────────────────
export const getTransactions = () => read(KEYS.transactions)

export const saveTransaction = (tx) => {
  const list = read(KEYS.transactions)
  const idx = list.findIndex(t => t.id === tx.id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...tx }
    write(KEYS.transactions, list)
    return list[idx]
  } else {
    const seq = (parseInt(localStorage.getItem('rf_txn_seq') || '0', 10)) + 1
    localStorage.setItem('rf_txn_seq', String(seq))
    const year = new Date().getFullYear()
    const newTx = {
      ...tx,
      id: tx.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()),
      reference: tx.reference || `TXN-${year}-${String(seq).padStart(4, '0')}`,
      createdAt: new Date().toISOString(),
    }
    list.unshift(newTx)
    write(KEYS.transactions, list)
    return newTx
  }
}

// ── Accounting: Journal Entries ───────────────────────────
export const getJournalEntries = () => read(KEYS.journalEntries)

export const getEntriesForTransaction = (txId) =>
  read(KEYS.journalEntries).filter(e => e.transactionId === txId)

export const saveJournalEntry = (entry) => {
  const list = read(KEYS.journalEntries)
  const idx = list.findIndex(e => e.id === entry.id)
  const saved = { ...entry, id: entry.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()), createdAt: new Date().toISOString() }
  if (idx >= 0) list[idx] = saved
  else list.push(saved)
  write(KEYS.journalEntries, list)
  return saved
}

export const saveJournalEntries = (entries) => {
  const list = read(KEYS.journalEntries)
  entries.forEach(entry => {
    const saved = { ...entry, id: entry.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()), createdAt: new Date().toISOString() }
    const idx = list.findIndex(e => e.id === saved.id)
    if (idx >= 0) list[idx] = saved
    else list.push(saved)
  })
  write(KEYS.journalEntries, list)
}

// ── Accounting: Deposits ──────────────────────────────────
export const getDeposits = () => read(KEYS.deposits)

export const saveDeposit = (deposit) => {
  const list = read(KEYS.deposits)
  const idx = list.findIndex(d => d.id === deposit.id)
  const saved = { ...deposit, id: deposit.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : uid()), createdAt: deposit.createdAt || new Date().toISOString() }
  if (idx >= 0) list[idx] = saved
  else list.unshift(saved)
  write(KEYS.deposits, list)
  return saved
}

export const getDepositByContract = (contractId) =>
  read(KEYS.deposits).find(d => d.contractId === contractId) || null

// ── Telematics: Contract Snapshots ───────────────────────
// Snapshot: { id, contractId, vehicleId, phase:'start'|'end', mileage, fuel,
//             lat, lng, engineOn, dtcCodes, takenAt, provider }
export const getSnapshots = () => read(KEYS.snapshots)

export const saveSnapshot = (snapshot) => {
  const list = read(KEYS.snapshots)
  const saved = { id: uid(), takenAt: new Date().toISOString(), ...snapshot }
  const idx   = list.findIndex(s => s.id === saved.id)
  if (idx >= 0) list[idx] = saved
  else list.unshift(saved)
  write(KEYS.snapshots, list)
  return saved
}

export const getSnapshotsForContract = (contractId) =>
  read(KEYS.snapshots).filter(s => s.contractId === contractId)

// ── Telematics: Device↔Vehicle mapping + provider config ─
export const getTelemetryConfig = () =>
  JSON.parse(localStorage.getItem(KEYS.telemetryMap) || '{"provider":"mock","mappings":[]}')

export const saveTelemetryConfig = (config) =>
  localStorage.setItem(KEYS.telemetryMap, JSON.stringify(config))

// Returns the deviceId mapped to a vehicleId (or null)
export const getDeviceForVehicle = (vehicleId) => {
  const cfg = getTelemetryConfig()
  const m   = (cfg.mappings || []).find(m => m.vehicleId === vehicleId)
  return m ? m.deviceId : null
}
