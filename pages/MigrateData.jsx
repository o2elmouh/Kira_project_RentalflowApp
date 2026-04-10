/**
 * MigrateData.jsx — one-time migration from localStorage → Supabase
 *
 * Visit this page while logged in to push all local data to Supabase.
 * Remove or restrict access to this page after migration.
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
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

async function migrateCollection(label, items, saveFn, log) {
  if (!items || items.length === 0) {
    log(`${label}: skipped (empty)`)
    return { ok: 0, fail: 0 }
  }
  let ok = 0, fail = 0
  for (const item of items) {
    try {
      await saveFn(item)
      ok++
    } catch (e) {
      fail++
      log(`${label} ERROR: ${e.message} — id=${item.id}`)
    }
  }
  log(`${label}: ${ok} migrated${fail > 0 ? `, ${fail} failed` : ''}`)
  return { ok, fail }
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
      // Agency
      const agency = readLocal(KEYS.agency, {})
      if (agency && Object.keys(agency).length > 0) {
        try { await saveAgency(agency); log('Agency: migrated') }
        catch (e) { log(`Agency ERROR: ${e.message}`) }
      } else {
        log('Agency: skipped (empty)')
      }

      // General config
      const gc = readLocal(KEYS.generalConfig, {})
      if (Object.keys(gc).length > 0) {
        try { await saveGeneralConfig(gc); log('General config: migrated') }
        catch (e) { log(`General config ERROR: ${e.message}`) }
      } else {
        log('General config: skipped (empty)')
      }

      // Telemetry config
      const tc = readLocal(KEYS.telemetryMap, null)
      if (tc) {
        try { await saveTelemetryConfig(tc); log('Telemetry config: migrated') }
        catch (e) { log(`Telemetry config ERROR: ${e.message}`) }
      } else {
        log('Telemetry config: skipped (empty)')
      }

      // Collections
      await migrateCollection('Fleet (vehicles)', readLocal(KEYS.fleet), saveVehicle, log)
      await migrateCollection('Clients', readLocal(KEYS.clients), saveClient, log)
      await migrateCollection('Contracts', readLocal(KEYS.contracts), saveContract, log)
      await migrateCollection('Invoices', readLocal(KEYS.invoices), saveInvoice, log)
      await migrateCollection('Repairs', readLocal(KEYS.repairs), saveRepair, log)
      await migrateCollection('Fleet config', readLocal(KEYS.fleetConfig), saveFleetConfig, log)
      await migrateCollection('Accounts', readLocal(KEYS.accounts), saveAccount, log)
      await migrateCollection('Transactions', readLocal(KEYS.transactions), saveTransaction, log)
      await migrateCollection('Journal entries', readLocal(KEYS.journalEntries), saveJournalEntry, log)
      await migrateCollection('Deposits', readLocal(KEYS.deposits), saveDeposit, log)
      await migrateCollection('Snapshots', readLocal(KEYS.snapshots), saveSnapshot, log)

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
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
        Run this once while logged in. It reads all local data and pushes it to Supabase.
        Existing Supabase records with the same ID will be overwritten.
      </p>

      <button
        onClick={runMigration}
        disabled={running || done}
        style={{
          padding: '10px 24px',
          background: done ? 'var(--success, #22c55e)' : 'var(--primary, #6366f1)',
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
