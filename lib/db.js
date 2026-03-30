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
  const { data: member } = await supabase
    .from('agency_members')
    .select('agency_id')
    .eq('user_id', data.user.id)
    .maybeSingle()
  return member?.agency_id ?? null
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

export async function getClients() {
  if (!isSupabaseEnabled()) return local.getClients()
  return sbSelect('clients')
}

export async function saveClient(client) {
  if (!isSupabaseEnabled()) return local.saveClient(client)
  return sbUpsert('clients', client)
}

export async function deleteClient(id) {
  if (!isSupabaseEnabled()) return
  return sbDelete('clients', id)
}

// ─── Fleet ───────────────────────────────────────────────────

export async function getFleet() {
  if (!isSupabaseEnabled()) return local.getFleet()
  return sbSelect('vehicles')
}

export async function saveVehicle(vehicle) {
  if (!isSupabaseEnabled()) return local.saveVehicle(vehicle)
  return sbUpsert('vehicles', vehicle)
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
  return data
}

// ─── Contracts ───────────────────────────────────────────────

export async function getContracts() {
  if (!isSupabaseEnabled()) return local.getContracts()
  return sbSelect('contracts')
}

export async function saveContract(contract) {
  if (!isSupabaseEnabled()) return local.saveContract(contract)
  return sbUpsert('contracts', contract)
}

export async function updateContract(contract) {
  if (!isSupabaseEnabled()) return local.updateContract(contract)
  return sbUpsert('contracts', contract)
}

// ─── Invoices ────────────────────────────────────────────────

export async function getInvoices() {
  if (!isSupabaseEnabled()) return local.getInvoices()
  return sbSelect('invoices')
}

export async function saveInvoice(invoice) {
  if (!isSupabaseEnabled()) return local.saveInvoice(invoice)
  return sbUpsert('invoices', invoice)
}

export async function updateInvoice(invoice) {
  if (!isSupabaseEnabled()) return local.updateInvoice(invoice)
  return sbUpsert('invoices', invoice)
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
  if (!isSupabaseEnabled()) return local.getRepairs ? local.getRepairs() : []
  const filters = vehicleId ? { vehicle_id: vehicleId } : {}
  return sbSelect('repairs', filters)
}

export async function saveRepair(repair) {
  if (!isSupabaseEnabled()) return
  return sbUpsert('repairs', repair)
}

export async function deleteRepair(id) {
  if (!isSupabaseEnabled()) return
  return sbDelete('repairs', id)
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
  // Delete all fleet_config rows for this agency so they can be re-seeded
  const agencyId = await getAgencyId()
  if (!agencyId) return
  await supabase.from('fleet_config').delete().eq('agency_id', agencyId)
}

export async function getFleetConfigForMake(make) {
  if (!isSupabaseEnabled()) return local.getFleetConfigForMake(make)
  const agencyId = await getAgencyId()
  if (!agencyId) return null
  const { data } = await supabase
    .from('fleet_config')
    .select('*')
    .eq('agency_id', agencyId)
    .ilike('brand', make || '')
    .maybeSingle()
  return data ?? null
}

// ─── Sequence numbers (localStorage compat) ──────────────────
// Supabase handles auto-numbering via DB triggers — these are no-ops when online.

export const getNextContractNumber = () => {
  if (!isSupabaseEnabled()) return local.getNextContractNumber?.() ?? 'CTR-00001'
  return null // assigned by DB trigger
}

export const getNextInvoiceNumber = () => {
  if (!isSupabaseEnabled()) return local.getNextInvoiceNumber?.() ?? 'INV-00001'
  return null // assigned by DB trigger
}
