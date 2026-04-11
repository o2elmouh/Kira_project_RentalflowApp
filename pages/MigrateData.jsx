/**
 * MigrateData.jsx — one-time migration from localStorage → Supabase
 *
 * Visit this page while logged in. It reads all local data, converts
 * non-UUID IDs to proper UUIDs, remaps all foreign keys, then upserts
 * everything into Supabase.
 */
import { useState } from 'react'
import {
  saveVehicle, saveClient, saveContract, saveInvoice,
  saveRepair, saveFleetConfig, saveAccount, saveTransaction,
  saveJournalEntry, saveDeposit, saveSnapshot, saveGeneralConfig,
  saveAgency, saveTelemetryConfig,
} from '../lib/db'

const KEYS = {
  fleet:          'rf_fleet',
  clients:        'rf_clients',
  contracts:      'rf_contracts',
  invoices:       'rf_invoices',
  repairs:        'rf_repairs',
  fleetConfig:    'rf_fleet_config',
  accounts:       'rf_accounts',
  transactions:   'rf_transactions',
  journalEntries: 'rf_journal_entries',
  deposits:       'rf_deposits',
  snapshots:      'rf_snapshots',
  agency:         'rf_agency',
  generalConfig:  'rf_general_config',
  telemetryMap:   'rf_telemetry_map',
}

function readLocal(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) }
  catch { return fallback }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(str) {
  return UUID_RE.test(str)
}

function newUUID() {
  return crypto.randomUUID()
}

/**
 * Build an ID map: { oldId → newUUID } for every non-UUID id encountered
 * across all collections. Also preserves existing UUIDs unchanged.
 */
function buildIdMap(collections) {
  const map = {}
  for (const items of Object.values(collections)) {
    for (const item of items) {
      if (item?.id) {
        map[item.id] = isUUID(item.id) ? item.id : newUUID()
      }
    }
  }
  return map
}

/** Replace old non-UUID ids in a record using the map */
function remap(obj, idMap, ...fkFields) {
  const out = { ...obj }
  if (out.id) out.id = idMap[out.id] ?? out.id
  for (const field of fkFields) {
    if (out[field]) out[field] = idMap[out[field]] ?? out[field]
  }
  return out
}

async function migrateCollection(label, items, saveFn, log) {
  if (!items || items.length === 0) { log(`${label}: skipped (empty)`); return }
  let ok = 0, fail = 0
  for (const item of items) {
    try { await saveFn(item); ok++ }
    catch (e) { fail++; log(`${label} ERROR: ${e.message} — id=${item.id}`) }
  }
  log(`${label}: ${ok} migrated${fail > 0 ? `, ${fail} failed` : ''}`)
}

export default function MigrateData() {
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const log = (msg) => setLogs(prev => [...prev, msg])

  async function runMigration() {
    setRunning(true)
    setLogs([])
    setDone(false)

    try {
      // ── 1. Load all collections from localStorage ─────────────
      const raw = {
        fleet:          readLocal(KEYS.fleet),
        clients:        readLocal(KEYS.clients),
        contracts:      readLocal(KEYS.contracts),
        invoices:       readLocal(KEYS.invoices),
        repairs:        readLocal(KEYS.repairs),
        fleetConfig:    readLocal(KEYS.fleetConfig),
        accounts:       readLocal(KEYS.accounts),
        transactions:   readLocal(KEYS.transactions),
        journalEntries: readLocal(KEYS.journalEntries),
        deposits:       readLocal(KEYS.deposits),
        snapshots:      readLocal(KEYS.snapshots),
      }

      // ── 2. Build unified ID map across all collections ─────────
      const idMap = buildIdMap(raw)
      const nonUUIDCount = Object.entries(idMap).filter(([k, v]) => k !== v).length
      if (nonUUIDCount > 0) {
        log(`ID remapping: ${nonUUIDCount} non-UUID id(s) will be converted to UUID`)
      }

      // ── 3. Agency + config ────────────────────────────────────
      const agency = readLocal(KEYS.agency, {})
      if (Object.keys(agency).length > 0) {
        try { await saveAgency(agency); log('Agency: migrated') }
        catch (e) { log(`Agency ERROR: ${e.message}`) }
      } else { log('Agency: skipped (empty)') }

      const gc = readLocal(KEYS.generalConfig, {})
      if (Object.keys(gc).length > 0) {
        try { await saveGeneralConfig(gc); log('General config: migrated') }
        catch (e) { log(`General config ERROR: ${e.message}`) }
      } else { log('General config: skipped (empty)') }

      const tc = readLocal(KEYS.telemetryMap, null)
      if (tc) {
        try { await saveTelemetryConfig(tc); log('Telemetry config: migrated') }
        catch (e) { log(`Telemetry config ERROR: ${e.message}`) }
      } else { log('Telemetry config: skipped (empty)') }

      // ── 4. Fleet (vehicles) ───────────────────────────────────
      await migrateCollection(
        'Fleet (vehicles)',
        raw.fleet.map(v => remap(v, idMap)),
        saveVehicle, log
      )

      // ── 5. Clients ────────────────────────────────────────────
      await migrateCollection(
        'Clients',
        raw.clients.map(c => remap(c, idMap)),
        saveClient, log
      )

      // ── 6. Contracts (FK: vehicleId, clientId) ────────────────
      await migrateCollection(
        'Contracts',
        raw.contracts.map(c => remap(c, idMap, 'vehicleId', 'vehicle_id', 'clientId', 'client_id')),
        saveContract, log
      )

      // ── 7. Invoices (FK: contractId, clientId) ────────────────
      await migrateCollection(
        'Invoices',
        raw.invoices.map(i => remap(i, idMap, 'contractId', 'contract_id', 'clientId', 'client_id')),
        saveInvoice, log
      )

      // ── 8. Repairs (FK: vehicleId, contractId) ────────────────
      await migrateCollection(
        'Repairs',
        raw.repairs.map(r => remap(r, idMap, 'vehicleId', 'vehicle_id', 'contractId', 'contract_id')),
        saveRepair, log
      )

      // ── 9. Fleet config ───────────────────────────────────────
      await migrateCollection(
        'Fleet config',
        raw.fleetConfig.map(c => remap(c, idMap)),
        saveFleetConfig, log
      )

      // ── 10. Accounts ──────────────────────────────────────────
      await migrateCollection(
        'Accounts',
        raw.accounts.map(a => remap(a, idMap)),
        saveAccount, log
      )

      // ── 11. Transactions (FK: contractId) ────────────────────
      await migrateCollection(
        'Transactions',
        raw.transactions.map(t => remap(t, idMap, 'contractId', 'contract_id', 'invoiceId', 'invoice_id')),
        saveTransaction, log
      )

      // ── 12. Journal entries (FK: transactionId) ───────────────
      await migrateCollection(
        'Journal entries',
        raw.journalEntries.map(e => remap(e, idMap, 'transactionId', 'transaction_id')),
        saveJournalEntry, log
      )

      // ── 13. Deposits (FK: contractId) ─────────────────────────
      await migrateCollection(
        'Deposits',
        raw.deposits.map(d => remap(d, idMap, 'contractId', 'contract_id', 'transactionId', 'transaction_id', 'releaseTransactionId', 'release_transaction_id')),
        saveDeposit, log
      )

      // ── 14. Snapshots (FK: contractId, vehicleId) ─────────────
      await migrateCollection(
        'Snapshots',
        raw.snapshots.map(s => remap(s, idMap, 'contractId', 'contract_id', 'vehicleId', 'vehicle_id')),
        saveSnapshot, log
      )

      log('✓ Migration complete')
      setDone(true)
    } catch (e) {
      log(`Fatal error: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h2 style={{ marginBottom: 8 }}>Data Migration — localStorage → Supabase</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 8, fontSize: 14 }}>
        Run this once while logged in. Reads all local data, converts short IDs to UUIDs,
        remaps all foreign keys, and pushes everything to Supabase.
      </p>
      <p style={{ color: 'var(--warning, #f59e0b)', marginBottom: 24, fontSize: 13 }}>
        ⚠ Before running: make sure you have run migration <code>005_missing_tables.sql</code> in
        your Supabase Dashboard → SQL Editor.
      </p>

      <button
        onClick={runMigration}
        disabled={running || done}
        style={{
          padding: '10px 24px',
          background: done ? '#22c55e' : 'var(--primary, #6366f1)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: running || done ? 'not-allowed' : 'pointer',
          fontSize: 15,
          marginBottom: 24,
        }}
      >
        {running ? 'Migrating…' : done ? 'Done ✓' : 'Start Migration'}
      </button>

      {logs.length > 0 && (
        <pre style={{
          background: 'var(--surface-2, #1e1e2e)',
          padding: 16,
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.7,
          overflowY: 'auto',
          maxHeight: 400,
          whiteSpace: 'pre-wrap',
        }}>
          {logs.join('\n')}
        </pre>
      )}
    </div>
  )
}
