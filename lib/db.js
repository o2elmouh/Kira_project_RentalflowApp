/**
 * RentaFlow — Unified Data Layer
 *
 * Strategy: Supabase is the source of truth when the user is authenticated.
 * Falls back to localStorage (storage.js) when offline or not yet migrated.
 *
 * To migrate a module: replace imports from '../storage' or '../utils/storage'
 * with imports from '../lib/db'.
 *
 * agency_id is resolved automatically from the authenticated session.
 */

import { supabase, isSupabaseEnabled } from './supabase.js'
import * as local from '../storage.js'

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
  if (!isSupabaseEnabled()) return local.getClients()
  const rows = await sbSelect('clients')
  return rows.map(clientFromDb)
}

export async function saveClient(client) {
  if (!isSupabaseEnabled()) return local.saveClient(client)
  const dbRow = clientToDb(client)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('clients', dbRow)
  return clientFromDb(saved)
}

export async function deleteClient(id) {
  if (!isSupabaseEnabled()) return local.deleteClient ? local.deleteClient(id) : null
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
    purchaseDate:  row.purchase_date,
    lifespan:      row.expected_lifespan_years,
    insuranceEnd:  row.insurance_expiry,
    vignetteEnd:   row.vignette_expiry,
    nextControleTech: row.control_tech_expiry,
    category:     row.category || 'Economy',
  }
}

export async function getFleet() {
  if (!isSupabaseEnabled()) return local.getFleet()
  const rows = await sbSelect('vehicles')
  return rows.map(vehicleFromDb)
}

export async function saveVehicle(vehicle) {
  if (!isSupabaseEnabled()) return local.saveVehicle(vehicle)
  const dbRow = vehicleToDb(vehicle)
  // Remove undefined fields so Supabase doesn't complain about unknown columns
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('vehicles', dbRow)
  return vehicleFromDb(saved)
}

export async function getVehicle(id) {
  if (!isSupabaseEnabled()) return local.getVehicle ? local.getVehicle(id) : null
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? vehicleFromDb(data) : null
}

export async function deleteVehicle(id) {
  if (!isSupabaseEnabled()) return local.deleteVehicle(id)
  return sbDelete('vehicles', id)
}

export async function getAvailableVehicles(startDate, endDate) {
  if (!isSupabaseEnabled()) return local.getAvailableVehicles(startDate, endDate)
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
    payment_method:   c.paymentMethod   || c.payment_method   || 'cash',
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
  if (!isSupabaseEnabled()) return local.getContracts()
  const rows = await sbSelect('contracts')
  return rows.map(contractFromDb)
}

export async function saveContract(contract) {
  if (!isSupabaseEnabled()) return local.saveContract(contract)
  const dbRow = contractToDb(contract)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('contracts', dbRow)
  return contractFromDb(saved)
}

export async function updateContract(contract) {
  if (!isSupabaseEnabled()) return local.updateContract(contract.id, contract)
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
  if (!isSupabaseEnabled()) return local.getInvoices()
  const rows = await sbSelect('invoices')
  return rows.map(invoiceFromDb)
}

export async function saveInvoice(invoice) {
  if (!isSupabaseEnabled()) return local.saveInvoice(invoice)
  const dbRow = invoiceToDb(invoice)
  Object.keys(dbRow).forEach(k => dbRow[k] === undefined && delete dbRow[k])
  const saved = await sbUpsert('invoices', dbRow)
  return invoiceFromDb(saved)
}

export async function updateInvoice(invoice) {
  if (!isSupabaseEnabled()) return local.updateInvoice(invoice)
  return saveInvoice(invoice)
}

// ─── Agency ──────────────────────────────────────────────────

export async function getAgency() {
  if (!isSupabaseEnabled()) return local.getAgency()
  const agencyId = await getAgencyId()
  if (!agencyId) return {}
  const { data } = await supabase.from('agencies').select('*').eq('id', agencyId).maybeSingle()
  return data ?? {}
}

export async function saveAgency(agencyData) {
  if (!isSupabaseEnabled()) return local.saveAgency(agencyData)
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
  if (!isSupabaseEnabled()) return local.getRepairs ? local.getRepairs(vehicleId) : []
  const filters = vehicleId ? { vehicle_id: vehicleId } : {}
  return sbSelect('repairs', filters)
}

export async function saveRepair(repair) {
  if (!isSupabaseEnabled()) return local.saveRepair(repair)
  return sbUpsert('repairs', repair)
}

export async function deleteRepair(id) {
  if (!isSupabaseEnabled()) return local.deleteRepair(id)
  return sbDelete('repairs', id)
}

export async function getTCO(vehicleId) {
  if (!isSupabaseEnabled()) return local.getTCO ? local.getTCO(vehicleId) : { totalExpense: 0, totalInsurance: 0, totalFranchise: 0, totalRecovered: 0, netTCO: 0 }
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

export async function getFleetConfig() {
  if (!isSupabaseEnabled()) return local.getFleetConfig ? local.getFleetConfig() : []
  return sbSelect('fleet_config')
}

export async function saveFleetConfig(config) {
  if (!isSupabaseEnabled()) return local.saveFleetConfig ? local.saveFleetConfig(config) : null
  return sbUpsert('fleet_config', config)
}

// ─── Documents (OCR) ─────────────────────────────────────────

export async function getDocuments(filters = {}) {
  if (!isSupabaseEnabled()) return []
  return sbSelect('documents', filters)
}

export async function saveDocument(doc) {
  if (!isSupabaseEnabled()) return null
  return sbUpsert('documents', doc)
}

// ─── Contract Photos ──────────────────────────────────────────

export async function getContractPhotos(contractId) {
  if (!isSupabaseEnabled()) return []
  const { data, error } = await supabase
    .from('contract_photos')
    .select('*')
    .eq('contract_id', contractId)
  if (error) return []
  return data
}

export async function saveContractPhoto(photo) {
  if (!isSupabaseEnabled()) return null
  const agencyId = await getAgencyId()
  const { data, error } = await supabase
    .from('contract_photos')
    .upsert({ ...photo, agency_id: agencyId })
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
  if (!isSupabaseEnabled()) return null
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
  if (!isSupabaseEnabled()) return local.getGeneralConfig()
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
  if (!isSupabaseEnabled()) return local.saveGeneralConfig(configData)
  const agencyId = await getAgencyId()
  if (!agencyId) return
  const existing = await getGeneralConfig()
  const merged = { ...existing, ...configData }
  await supabase.from('agencies').update({ config: merged }).eq('id', agencyId)
}

// ─── Fleet Config helpers ─────────────────────────────────────

export async function resetFleetConfig() {
  if (!isSupabaseEnabled()) return local.resetFleetConfig()
  const agencyId = await getAgencyId()
  if (!agencyId) return
  await supabase.from('fleet_config').delete().eq('agency_id', agencyId)
}

// Sync — called during render; uses in-memory localStorage cache
export function getFleetConfigForMake(make) {
  return local.getFleetConfigForMake(make)
}

// ─── Single-record lookups ────────────────────────────────────

export async function getClient(id) {
  if (!isSupabaseEnabled()) return local.getClient(id)
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? clientFromDb(data) : null
}

export async function getContract(id) {
  if (!isSupabaseEnabled()) return local.getContract(id)
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data, error } = await supabase.from('contracts').select('*').eq('id', id).eq('agency_id', agencyId).maybeSingle()
  if (error) return null
  return data ? contractFromDb(data) : null
}

// ─── Accounting — Accounts ────────────────────────────────────

export async function getAccounts() {
  if (!isSupabaseEnabled()) return local.getAccounts()
  return sbSelect('accounts')
}

export async function saveAccount(account) {
  if (!isSupabaseEnabled()) return local.saveAccount(account)
  const row = { ...account }
  delete row.agency_id
  return sbUpsert('accounts', row)
}

export async function initDefaultAccounts() {
  if (!isSupabaseEnabled()) return local.initDefaultAccounts()
  // no-op for Supabase — seeded via migration
}

// ─── Accounting — Transactions ────────────────────────────────

export async function getTransactions() {
  if (!isSupabaseEnabled()) return local.getTransactions()
  return sbSelect('transactions')
}

export async function saveTransaction(tx) {
  if (!isSupabaseEnabled()) return local.saveTransaction(tx)
  return sbUpsert('transactions', tx)
}

// ─── Accounting — Journal Entries ─────────────────────────────

export async function getJournalEntries() {
  if (!isSupabaseEnabled()) return local.getJournalEntries()
  return sbSelect('journal_entries')
}

export async function getEntriesForTransaction(txId) {
  if (!isSupabaseEnabled()) return local.getEntriesForTransaction(txId)
  return sbSelect('journal_entries', { transaction_id: txId })
}

export async function saveJournalEntry(entry) {
  if (!isSupabaseEnabled()) return local.saveJournalEntry(entry)
  return sbUpsert('journal_entries', entry)
}

export async function saveJournalEntries(entries) {
  if (!isSupabaseEnabled()) return local.saveJournalEntries(entries)
  const agencyId = await getAgencyId()
  if (!agencyId) return
  const rows = entries.map(e => ({ ...e, agency_id: agencyId }))
  const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

// ─── Accounting — Deposits ────────────────────────────────────

export async function getDeposits() {
  if (!isSupabaseEnabled()) return local.getDeposits()
  return sbSelect('deposits')
}

export async function saveDeposit(deposit) {
  if (!isSupabaseEnabled()) return local.saveDeposit(deposit)
  return sbUpsert('deposits', deposit)
}

export async function getDepositByContract(contractId) {
  if (!isSupabaseEnabled()) return local.getDepositByContract(contractId)
  const rows = await sbSelect('deposits', { contract_id: contractId })
  return rows[0] || null
}

// ─── Telematics — Snapshots ───────────────────────────────────

export async function getSnapshots() {
  if (!isSupabaseEnabled()) return local.getSnapshots()
  return sbSelect('snapshots')
}

export async function saveSnapshot(snapshot) {
  if (!isSupabaseEnabled()) return local.saveSnapshot(snapshot)
  return sbUpsert('snapshots', snapshot)
}

export async function getSnapshotsForContract(contractId) {
  if (!isSupabaseEnabled()) return local.getSnapshotsForContract(contractId)
  return sbSelect('snapshots', { contract_id: contractId })
}

// ─── Sequence numbers (localStorage compat) ──────────────────
// Supabase handles auto-numbering via DB triggers — these are no-ops when online.

// Sequence numbers are handled internally by saveContract / saveInvoice in storage.js
