/**
 * RentaFlow — Supabase Data Layer
 *
 * Single source of truth: Supabase (PostgreSQL via Supabase JS client).
 * localStorage is no longer used.
 *
 * agency_id is resolved automatically from the authenticated session.
 */

import { supabase } from './supabase.js'
import { FLEET_CONFIG_DEFAULTS } from './fleetConfigDefaults.js'

// ─── Auth helpers ────────────────────────────────────────────

export const getSession = () => supabase.auth.getSession()
export const getUser    = () => supabase.auth.getUser()

export async function getAgencyId() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id')
    .eq('id', data.user.id)
    .maybeSingle()
  return profile?.agency_id ?? null
}

// ─── Generic helpers ─────────────────────────────────────────

async function sbSelect(table, filters = {}) {
  const agencyId = await getAgencyId()
  if (!agencyId) return []
  let q = supabase.from(table).select('*').eq('agency_id', agencyId)
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v) })
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) { console.error(`[db] ${table} select error`, error); return [] }
  return data
}

async function sbUpsert(table, row) {
  const agencyId = await getAgencyId()
  if (!agencyId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from(table)
    .upsert({ ...row, agency_id: agencyId }, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

async function sbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

// ─── Clients ─────────────────────────────────────────────────

function clientToDb(c) {
  return {
    id:                      c.id,
    first_name:              c.firstName   || c.first_name,
    last_name:               c.lastName    || c.last_name,
    email:                   c.email       || null,
    phone:                   c.phone       || null,
    phone2:                  c.phone2      || null,
    nationality:             c.nationality || 'MA',
    id_type:                 c.idType      || c.id_type || 'cin',
    id_number:               c.cinNumber   || c.idNumber   || c.id_number,
    id_expiry:               c.cinExpiry   || c.idExpiry   || c.id_expiry   || null,
    driving_license_num:     c.drivingLicenseNumber || c.driving_license_num || null,
    driving_license_expiry:  c.licenseExpiry || c.driving_license_expiry || null,
    date_of_birth:           c.dateOfBirth || c.date_of_birth || null,
    address:                 c.address     || null,
    city:                    c.city        || null,
    country:                 c.country     || 'MA',
    flag_category:           c.flag?.category || c.flagCategory || c.flag_category || null,
    flag_note:               c.flag?.note  || c.flagNote    || c.flag_note    || null,
    notes:                   c.notes       || null,
  }
}

function clientFromDb(row) {
  if (!row) return row
  return {
    ...row,
    firstName:             row.first_name,
    lastName:              row.last_name,
    cinNumber:             row.id_number,
    cinExpiry:             row.id_expiry,
    idType:                row.id_type,
    drivingLicenseNumber:  row.driving_license_num,
    licenseExpiry:         row.driving_license_expiry,
    dateOfBirth:           row.date_of_birth,
    flagCategory:          row.flag_category,
    flagNote:              row.flag_note,
    flag:                  row.flag_category ? { category: row.flag_category, note: row.flag_note } : null,
    createdAt:             row.created_at,
  }
}

export async function getClients() {
  const rows = await sbSelect('clients')
  return rows.map(clientFromDb)
}

export async function saveClient(client) {
  const dbRow = clientToDb(client)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('clients', dbRow)
  return clientFromDb(saved)
}

export async function deleteClient(id) {
  return sbDelete('clients', id)
}

// ─── Fleet ───────────────────────────────────────────────────

// Map frontend camelCase fields → DB snake_case columns
function vehicleToDb(v) {
  const FUEL_MAP = { 'Essence': 'gasoline', 'Diesel': 'diesel', 'Électrique': 'electric', 'Hybride': 'hybrid', gasoline: 'gasoline', diesel: 'diesel', electric: 'electric', hybrid: 'hybrid' }
  const TRANS_MAP = { 'Manuelle': 'manual', 'Automatique': 'automatic', manual: 'manual', automatic: 'automatic' }
  return {
    id:                     v.id,
    brand:                  v.make      || v.brand,
    model:                  v.model,
    year:                   v.year      ? Number(v.year)  : null,
    color:                  v.color     || null,
    plate_number:           v.plate     || v.plate_number,
    vin:                    v.vin       || null,
    fuel_type:              FUEL_MAP[v.fuelType || v.fuel_type] || 'gasoline',
    transmission:           TRANS_MAP[v.transmission] || 'manual',
    seats:                  v.seats     ? Number(v.seats) : 5,
    doors:                  v.doors     ? Number(v.doors) : 4,
    mileage:                v.mileage   ? Number(v.mileage) : 0,
    status:                 v.status    || 'available',
    daily_rate:             v.dailyRate !== undefined ? Number(v.dailyRate) : Number(v.daily_rate || 0),
    deposit_amount:         v.depositAmount !== undefined ? Number(v.depositAmount) : Number(v.deposit_amount || 0),
    purchase_price:         v.purchasePrice !== undefined ? Number(v.purchasePrice) || null : null,
    residual_value:         v.residualValue !== undefined ? Number(v.residualValue) || null : null,
    purchase_date:          v.purchaseDate  || v.purchase_date  || null,
    expected_lifespan_years: v.lifespan !== undefined ? Number(v.lifespan) : Number(v.expected_lifespan_years || 5),
    insurance_expiry:       v.insuranceEnd  || v.insurance_expiry  || null,
    vignette_expiry:        v.vignetteEnd   || v.vignette_expiry   || null,
    control_tech_expiry:    v.nextControleTech || v.control_tech_expiry || null,
    notes:                  v.notes     || null,
    // extra frontend-only fields stored in notes or ignored
    category:               undefined,   // not in DB schema — strip it
  }
}

// Map DB row → frontend shape
function vehicleFromDb(row) {
  if (!row) return row
  const FUEL_MAP = { gasoline: 'Essence', diesel: 'Diesel', electric: 'Électrique', hybrid: 'Hybride' }
  const TRANS_MAP = { manual: 'Manuelle', automatic: 'Automatique' }
  return {
    ...row,
    make:         row.brand,
    plate:        row.plate_number,
    fuelType:     FUEL_MAP[row.fuel_type] || row.fuel_type,
    transmission: TRANS_MAP[row.transmission] || row.transmission,
    dailyRate:    row.daily_rate,
    depositAmount: row.deposit_amount,
    purchasePrice: row.purchase_price,
    residualValue: row.residual_value,
    purchaseDate:  row.purchase_date     || '',
    lifespan:      row.expected_lifespan_years,
    insuranceEnd:  row.insurance_expiry  || '',
    vignetteEnd:   row.vignette_expiry   || '',
    nextControleTech: row.control_tech_expiry || '',
    category:     row.category || 'Economy',
  }
}

export async function getFleet() {
  const rows = await sbSelect('vehicles')
  return rows.map(vehicleFromDb)
}

export async function saveVehicle(vehicle) {
  const dbRow = vehicleToDb(vehicle)
  // Remove undefined fields so Supabase doesn't complain about unknown columns
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('vehicles', dbRow)
  return vehicleFromDb(saved)
}

export async function getVehicle(id) {
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? vehicleFromDb(data) : null
}

export async function deleteVehicle(id) {
  return sbDelete('vehicles', id)
}

export async function getAvailableVehicles(startDate, endDate) {
  const agencyId = await getAgencyId()
  if (!agencyId) return []
  const { data, error } = await supabase
    .rpc('get_available_vehicles', {
      p_agency_id: agencyId,
      p_start_date: startDate,
      p_end_date: endDate,
    })
  if (error) { console.error('[db] getAvailableVehicles', error); return [] }
  return (data || []).map(vehicleFromDb)
}

// ─── Contracts ───────────────────────────────────────────────

const PAYMENT_METHOD_MAP = {
  'Espèces': 'cash', 'espèces': 'cash', 'cash': 'cash',
  'Carte bancaire': 'card', 'Carte': 'card', 'card': 'card',
  'Virement': 'bank_transfer', 'Virement bancaire': 'bank_transfer', 'bank_transfer': 'bank_transfer',
  'Chèque': 'cheque', 'Cheque': 'cheque', 'cheque': 'cheque',
}

function contractToDb(c) {
  return {
    id:               c.id,
    contract_number:  c.contractNumber  || c.contract_number  || null,
    vehicle_id:       c.vehicleId       || c.vehicle_id,
    client_id:        c.clientId        || c.client_id,
    status:           c.status          || 'active',
    pickup_date:      c.startDate       || c.pickup_date,
    return_date:      c.endDate         || c.return_date,
    actual_return_date: c.returnDate || c.actualReturnDate || c.actual_return_date || null,
    pickup_location:  c.pickupLocation  || c.pickup_location  || null,
    return_location:  c.returnLocation  || c.return_location  || null,
    daily_rate:       Number(c.dailyRate    || c.daily_rate    || 0),
    total_days:       Number(c.days         || c.total_days    || 1),
    extra_fees:       Number(c.extraFees    || c.extra_fees    || 0),
    discount:         Number(c.discount     || 0),
    total_amount:     Number(c.totalTTC     || c.total_amount  || 0),
    deposit_amount:   Number(c.deposit      || c.depositAmount || c.deposit_amount || 0),
    deposit_returned: c.depositReturned || c.deposit_returned || false,
    payment_method:   PAYMENT_METHOD_MAP[c.paymentMethod || c.payment_method] || 'cash',
    payment_status:   c.paymentStatus   || c.payment_status   || 'pending',
    amount_paid:      Number(c.amountPaid   || c.amount_paid   || 0),
    mileage_start:    c.mileageOut      || c.mileage_start    || null,
    mileage_end:      c.returnMileage   || c.mileageIn        || c.mileage_end    || null,
    fuel_level_start: c.fuelLevel       || c.fuel_level_start || null,
    fuel_level_end:   c.returnFuelLevel || c.fuelLevelEnd     || c.fuel_level_end || null,
    signature_url:    c.signatureUrl    || c.signature_url    || null,
    extra_driver_name:    c.extraDriverName    || c.extra_driver_name    || null,
    extra_driver_license: c.extraDriverLicense || c.extra_driver_license || null,
    options:          c.options         || {},
    notes:            c.notes           || null,
  }
}

function contractFromDb(row) {
  if (!row) return row
  return {
    ...row,
    contractNumber:  row.contract_number,
    vehicleId:       row.vehicle_id,
    clientId:        row.client_id,
    startDate:       row.pickup_date,
    endDate:         row.return_date,
    actualReturnDate: row.actual_return_date,
    pickupLocation:  row.pickup_location,
    returnLocation:  row.return_location,
    dailyRate:       row.daily_rate,
    days:            row.total_days,
    extraFees:       row.extra_fees,
    totalTTC:        row.total_amount,
    deposit:         row.deposit_amount,
    depositAmount:   row.deposit_amount,
    depositReturned: row.deposit_returned,
    paymentMethod:   row.payment_method,
    paymentStatus:   row.payment_status,
    amountPaid:      row.amount_paid,
    mileageOut:      row.mileage_start,
    startMileage:    row.mileage_start,
    mileageIn:       row.mileage_end,
    fuelLevel:       row.fuel_level_start,
    fuelLevelEnd:    row.fuel_level_end,
    signatureUrl:    row.signature_url,
    createdAt:       row.created_at,
  }
}

export async function getContracts() {
  const rows = await sbSelect('contracts')
  return rows.map(contractFromDb)
}

export async function saveContract(contract) {
  const dbRow = contractToDb(contract)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('contracts', dbRow)
  return contractFromDb(saved)
}

export async function updateContract(contract) {
  return saveContract(contract)
}

// ─── Invoices ────────────────────────────────────────────────

function invoiceToDb(inv) {
  return {
    id:               inv.id,
    contract_id:      inv.contractId      || inv.contract_id,
    client_id:        inv.clientId        || inv.client_id       || null,
    invoice_number:   inv.invoiceNumber   || inv.invoice_number  || null,
    contract_number:  inv.contractNumber  || inv.contract_number || null,
    client_name:      inv.clientName      || inv.client_name     || null,
    vehicle_name:     inv.vehicleName     || inv.vehicle_name    || null,
    total_ht:         Number(inv.totalHT  || inv.total_ht        || 0),
    tva:              Number(inv.tva      || 0),
    total_ttc:        Number(inv.totalTTC || inv.total_ttc       || 0),
    days:             Number(inv.days     || 0),
    start_date:       inv.startDate       || inv.start_date      || null,
    end_date:         inv.endDate         || inv.end_date        || null,
    status:           inv.status          || 'pending',
  }
}

function invoiceFromDb(row) {
  if (!row) return row
  return {
    ...row,
    contractId:     row.contract_id,
    clientId:       row.client_id,
    invoiceNumber:  row.invoice_number,
    contractNumber: row.contract_number,
    clientName:     row.client_name,
    vehicleName:    row.vehicle_name,
    totalHT:        row.total_ht,
    totalTTC:       row.total_ttc,
    startDate:      row.start_date,
    endDate:        row.end_date,
    createdAt:      row.created_at,
  }
}

export async function getInvoices() {
  const rows = await sbSelect('invoices')
  return rows.map(invoiceFromDb)
}

export async function saveInvoice(invoice) {
  const dbRow = invoiceToDb(invoice)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('invoices', dbRow)
  return invoiceFromDb(saved)
}

export async function updateInvoice(invoice) {
  return saveInvoice(invoice)
}

// ─── Agency ──────────────────────────────────────────────────

export async function getAgency() {
  const agencyId = await getAgencyId()
  if (!agencyId) return {}
  const { data } = await supabase.from('agencies').select('*').eq('id', agencyId).maybeSingle()
  return data ?? {}
}

export async function saveAgency(agencyData) {
  const agencyId = await getAgencyId()
  if (!agencyId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('agencies')
    .update(agencyData)
    .eq('id', agencyId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Repairs ─────────────────────────────────────────────────

export async function getRepairs(vehicleId = null) {
  const filters = vehicleId ? { vehicle_id: vehicleId } : {}
  const rows = await sbSelect('repairs', filters)
  return rows.map(repairFromDb)
}

export async function addRepair(vehicleId, repair) {
  const agencyId = await getAgencyId()
  const { error } = await supabase.from('repairs').insert({
    vehicle_id:  vehicleId,
    agency_id:   agencyId,
    repair_type: repair.label,
    description: repair.label,
    repair_date: repair.date,
    cost:        Number(repair.cost) || 0,
  })
  if (error) console.error('[db] addRepair', error)
}

function repairToDb(r) {
  return {
    id:                       r.id,
    vehicle_id:               r.vehicleId    || r.vehicle_id,
    repair_date:              r.date         || r.repair_date,
    repair_type:              r.type         || r.repair_type,
    description:              r.description  || null,
    cost:                     Number(r.cost  || 0),
    mileage_at_repair:        r.mileage      || r.mileage_at_repair || null,
    garage:                   r.garage       || null,
    notes:                    r.notes        || null,
    is_sinistre:              r.isSinistre   || r.is_sinistre   || false,
    sinistre_id:              r.sinistreId   || r.sinistre_id   || null,
    insurance_ref:            r.insuranceRef || r.insurance_ref || null,
    insurance_reimbursement:  Number(r.insuranceReimbursement || r.insurance_reimbursement || 0),
    client_franchise:         Number(r.clientFranchise || r.client_franchise || 0),
    contract_id:              r.contractId   || r.contract_id   || null,
  }
}

function repairFromDb(row) {
  if (!row) return row
  return {
    ...row,
    date:                    row.repair_date,
    type:                    row.repair_type,
    mileage:                 row.mileage_at_repair,
    vehicleId:               row.vehicle_id,
    contractId:              row.contract_id,
    isSinistre:              row.is_sinistre,
    sinistreId:              row.sinistre_id,
    insuranceRef:            row.insurance_ref,
    insuranceReimbursement:  row.insurance_reimbursement,
    clientFranchise:         row.client_franchise,
  }
}

export async function saveRepair(repair) {
  const dbRow = repairToDb(repair)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('repairs', dbRow)
  return repairFromDb(saved)
}

export async function deleteRepair(id) {
  return sbDelete('repairs', id)
}

export async function getTCO(vehicleId) {
  // Supabase path: fetch all repairs for vehicle, compute in JS (avoids heavy aggregation RPC for now)
  const { data, error } = await supabase.from('repairs').select('cost,insurance_reimbursement,client_franchise').eq('vehicle_id', vehicleId)
  if (error) throw error
  const rows = data || []
  const totalExpense   = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0)
  const totalInsurance = rows.reduce((s, r) => s + (Number(r.insurance_reimbursement) || 0), 0)
  const totalFranchise = rows.reduce((s, r) => s + (Number(r.client_franchise) || 0), 0)
  const totalRecovered = totalInsurance + totalFranchise
  return { totalExpense, totalInsurance, totalFranchise, totalRecovered, netTCO: totalExpense - totalRecovered }
}

// ─── Fleet Config ─────────────────────────────────────────────

function fleetConfigToDb(c) {
  return {
    id:                  c.id,
    brand:               c.make         || c.brand,
    warranty_general:    c.warrantyGeneral  || c.warranty_general,
    warranty_years:      c.warrantyYears    ?? c.warranty_years,
    warranty_battery:    c.warrantyBattery  || c.warranty_battery,
    warranty_extension:  c.extension        || c.warranty_extension,
    control_tech_years:  c.controlTechYears ?? c.control_tech_years,
    oil_change_km:       c.vidangeKm        ?? c.oil_change_km,
    timing_belt_km:      c.courroieKm       ?? c.timing_belt_km,
    notes:               c.notes            || null,
  }
}

function fleetConfigFromDb(row) {
  if (!row) return row
  return {
    ...row,
    make:              row.brand,
    warrantyGeneral:   row.warranty_general,
    warrantyYears:     row.warranty_years,
    warrantyBattery:   row.warranty_battery,
    extension:         row.warranty_extension,
    controlTechYears:  row.control_tech_years,
    vidangeKm:         row.oil_change_km,
    courroieKm:        row.timing_belt_km,
  }
}

export async function getFleetConfig() {
  const rows = await sbSelect('fleet_config')
  return rows.map(fleetConfigFromDb)
}

export async function saveFleetConfig(config) {
  const dbRow = fleetConfigToDb(config)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('fleet_config', dbRow)
  return fleetConfigFromDb(saved)
}

// ─── Documents (OCR) ─────────────────────────────────────────

export async function getDocuments(filters = {}) {
  return sbSelect('documents', filters)
}

export async function saveDocument(doc) {
  return sbUpsert('documents', doc)
}

// ─── Contract Photos ──────────────────────────────────────────

export async function getContractPhotos(contractId) {
  const { data, error } = await supabase
    .from('contract_photos')
    .select('*')
    .eq('contract_id', contractId)
  if (error) return []
  return data
}

export async function saveContractPhoto(photo) {
  const agencyId = await getAgencyId()
  const row = {
    id:          photo.id,
    contract_id: photo.contractId || photo.contract_id,
    agency_id:   agencyId,
    phase:       photo.phase,
    slot:        photo.slotId || photo.slot_id || photo.slot,
    storage_path: photo.storagePath || photo.storage_path || null,
    public_url:  photo.url || photo.publicUrl || photo.public_url || null,
  }
  Object.keys(row).forEach(k => row[k] === undefined && delete row[k])
  const { data, error } = await supabase
    .from('contract_photos')
    .upsert(row)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Storage (files) ──────────────────────────────────────────

export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return { path: data.path, publicUrl }
}

// ─── Dashboard stats ──────────────────────────────────────────

export async function getDashboardStats() {
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.rpc('get_dashboard_stats', { p_agency_id: agencyId })
  if (error) { console.error('[db] getDashboardStats', error); return null }
  return data
}

// ─── General Config ───────────────────────────────────────────
// Agency-level settings (signature, rental conditions, etc.) stored in
// the agencies.config JSONB column when online, localStorage when offline.

export async function getGeneralConfig() {
  const agencyId = await getAgencyId()
  if (!agencyId) return {}
  const { data } = await supabase
    .from('agencies')
    .select('config')
    .eq('id', agencyId)
    .maybeSingle()
  return data?.config ?? {}
}

export async function saveGeneralConfig(configData) {
  const agencyId = await getAgencyId()
  if (!agencyId) return
  const existing = await getGeneralConfig()
  const merged = { ...existing, ...configData }
  await supabase.from('agencies').update({ config: merged }).eq('id', agencyId)
}

// ─── Fleet Config helpers ─────────────────────────────────────

export async function resetFleetConfig() {
  const agencyId = await getAgencyId()
  if (!agencyId) return
  await supabase.from('fleet_config').delete().eq('agency_id', agencyId)
  await seedFleetConfig(agencyId)
}

/**
 * Seed the fleet_config table for a given agency with the 36 brand defaults.
 * Called once at onboarding. Skips if the agency already has rows.
 */
export async function seedFleetConfig(agencyId) {
  if (!agencyId) return
  const { count } = await supabase
    .from('fleet_config')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
  if (count > 0) return  // already seeded

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
  await supabase.from('fleet_config').insert(rows)
}

// Async lookup by brand — used in Fleet.jsx for warranty/maintenance info
export async function getFleetConfigForMake(make) {
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data } = await supabase.from('fleet_config').select('*').eq('agency_id', agencyId).eq('brand', make).maybeSingle()
  return data ? fleetConfigFromDb(data) : null
}

// ─── Single-record lookups ────────────────────────────────────

export async function getClient(id) {
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? clientFromDb(data) : null
}

export async function getContract(id) {
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('contracts').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? contractFromDb(data) : null
}

// ─── Accounting — Accounts ────────────────────────────────────

export async function getAccounts() {
  return sbSelect('accounts')
}

export async function saveAccount(account) {
  const row = { ...account }
  delete row.agency_id
  return sbUpsert('accounts', row)
}

export async function initDefaultAccounts() {
  // no-op for Supabase — seeded via migration
}

// ─── Accounting — Transactions ────────────────────────────────

export async function getTransactions() {
  return sbSelect('transactions')
}

export async function saveTransaction(tx) {
  return sbUpsert('transactions', tx)
}

// ─── Accounting — Journal Entries ─────────────────────────────

export async function getJournalEntries() {
  return sbSelect('journal_entries')
}

export async function getEntriesForTransaction(txId) {
  return sbSelect('journal_entries', { transaction_id: txId })
}

export async function saveJournalEntry(entry) {
  return sbUpsert('journal_entries', entry)
}

export async function saveJournalEntries(entries) {
  const agencyId = await getAgencyId()
  if (!agencyId) return
  const rows = entries.map(e => ({ ...e, agency_id: agencyId }))
  const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

// ─── Accounting — Deposits ────────────────────────────────────

export async function getDeposits() {
  return sbSelect('deposits')
}

export async function saveDeposit(deposit) {
  return sbUpsert('deposits', deposit)
}

export async function getDepositByContract(contractId) {
  const rows = await sbSelect('deposits', { contract_id: contractId })
  return rows[0] || null
}

// ─── Telematics — Snapshots ───────────────────────────────────

export async function getSnapshots() {
  return sbSelect('snapshots')
}

export async function saveSnapshot(snapshot) {
  return sbUpsert('snapshots', snapshot)
}

export async function getSnapshotsForContract(contractId) {
  return sbSelect('snapshots', { contract_id: contractId })
}

// ─── Telematics — Config (stored in agencies.config JSONB) ───────────────────

export async function getTelemetryConfig() {
  const agencyId = await getAgencyId()
  if (!agencyId) return { provider: 'mock', mappings: [] }
  const { data } = await supabase.from('agencies').select('config').eq('id', agencyId).maybeSingle()
  return data?.config?.telemetry ?? { provider: 'mock', mappings: [] }
}

export async function saveTelemetryConfig(config) {
  const agencyId = await getAgencyId()
  if (!agencyId) return
  const existing = await getGeneralConfig()
  await supabase.from('agencies').update({ config: { ...existing, telemetry: config } }).eq('id', agencyId)
}

export async function getDeviceForVehicle(vehicleId) {
  const cfg = await getTelemetryConfig()
  const m = (cfg.mappings || []).find(m => m.vehicleId === vehicleId)
  return m ? m.deviceId : null
}
