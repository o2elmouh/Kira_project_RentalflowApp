#!/usr/bin/env node
/**
 * schemaCheck.js — fail-fast probe that every column / table the code
 * references actually exists on the configured Supabase project.
 *
 * Run via `npm run schema:check` before push or in CI. Catches the class
 * of regression that bit v1.15.0: an explicit `.select('col1,col2,...')`
 * (or an `.update({ col: x })`) where one of the columns doesn't exist
 * on the live schema → PostgREST returns 42703 and the whole query fails.
 * Vitest mocks the supabase client, so this kind of bug only surfaces
 * against a real DB.
 *
 * What it does:
 *   - Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY
 *     if service_role isn't set — anon is enough because we only ever
 *     do `select=<col>&limit=1`, which still returns the 42703 error
 *     even when RLS blocks the row data).
 *   - For each (table, column) below, hits
 *     `/rest/v1/<table>?select=<column>&limit=1` and inspects the response.
 *   - Logs ✓ or ✗ for each. Exits with code 1 if ANY missing.
 *
 * MAINTENANCE: when you add a new column to a migration, add the
 * (table, column) pair here too. The list is intentionally explicit so
 * "code references column X" is auditable in one place.
 */

const TABLE_COLUMNS = {
  agencies: [
    'id', 'name', 'city', 'ice', 'rc', 'plan', 'seat_limit',
    'contract_template_url',
    'retention_years',
    'config',
  ],
  profiles: [
    'id', 'full_name', 'phone', 'role', 'agency_id',
  ],
  vehicles: [
    'id', 'agency_id', 'brand', 'model', 'year', 'color',
    'plate_number', 'vin', 'fuel_type', 'transmission',
    'seats', 'doors', 'mileage', 'status',
    'daily_rate', 'deposit_amount',
    'purchase_price', 'residual_value', 'purchase_date',
    'expected_lifespan_years',
    'insurance_expiry', 'vignette_expiry', 'control_tech_expiry',
    'notes', 'created_at',
    // NOTE: 'category' is a frontend-only default in vehicleFromDb — NOT
    // a real DB column. Do NOT add it here.
  ],
  clients: [
    'id', 'agency_id', 'first_name', 'last_name', 'phone', 'email',
    'id_number', 'driving_license_num', 'driving_license_expiry',
    'date_of_birth', 'nationality',
    'id_number_enc', 'driving_license_num_enc', 'date_of_birth_enc',
    'flag_category', 'flag_note',
    'anonymized_at', 'created_at',
  ],
  contracts: [
    'id', 'agency_id', 'contract_number', 'status',
    'client_id', 'vehicle_id',
    'pickup_date', 'return_date', 'actual_return_date',
    'pickup_location', 'return_location',
    'daily_rate', 'total_days', 'extra_fees', 'total_amount',
    'deposit_amount', 'deposit_returned',
    'payment_method', 'payment_status', 'amount_paid',
    'mileage_start', 'mileage_end',
    'fuel_level_start', 'fuel_level_end',
    'signature_url',
    // Signing flow (v1.7.0):
    'signature_status', 'signing_token', 'signing_token_expires_at',
    'unsigned_pdf_path', 'signed_at', 'signed_pdf_path',
    // Finalize (v1.12.0):
    'finalized_at',
    // Prolongation reverse-link (already in prod baseline):
    'prolonged_from_id',
    'created_at',
  ],
  invoices: [
    'id', 'agency_id', 'contract_id', 'client_id',
    'invoice_number', 'contract_number',
    'total_ht', 'tva', 'total_ttc',
    'status', 'created_at',
  ],
  pending_demands: [
    'id', 'agency_id', 'sender_id', 'source', 'status',
    'extracted_data', 'raw_payload', 'media_urls',
    'confidence_scores', 'match_score', 'merged_with_id',
    'offered_vehicle_id', 'offered_price_total', 'last_client_note',
    // Triage (v1.2.0):
    'classification',
    // Acceptance + docs (v1.12.1 / v1.12.x):
    'accepted_at', 'docs_completed_at',
    // Gmail dedup (v1.14.8):
    'gmail_message_id',
    // Prolongation linkage (v1.13.8):
    'prolongation_target_contract_id',
    'created_at', 'updated_at',
  ],
  reservations: [
    'id', 'agency_id', 'customer_name', 'customer_contact',
    'car_model', 'vehicle_id', 'client_id',
    'start_date', 'end_date',
    'total_price', 'currency',
    'source_channel', 'status', 'source_metadata',
    'lead_id', 'contract_id',
    'created_at', 'updated_at',
  ],
  audit_log: [
    'id', 'agency_id', 'actor_user_id', 'action',
    'target_table', 'target_id', 'metadata',
    'created_at',
  ],
  whatsapp_sessions: [
    'agency_id', 'connected_at', 'phone',
  ],
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[schema-check] SUPABASE_URL and a key (service_role or anon) must be set in env')
  process.exit(2)
}

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

async function probeColumn(table, column) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=1`
  try {
    const res  = await fetch(url, { headers })
    const text = await res.text()
    // PGRST205 = table missing; 42703 = column missing
    if (text.includes('PGRST205')) return { ok: false, kind: 'table-missing', detail: text.slice(0, 120) }
    if (text.includes('42703') || text.includes('does not exist')) return { ok: false, kind: 'col-missing', detail: text.slice(0, 120) }
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      // Anon-key + RLS commonly returns 401/403 with empty body — still proves the column exists.
      // Anything else (5xx, etc.) is suspicious.
      return { ok: false, kind: 'http-error', detail: `${res.status} ${text.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, kind: 'fetch-error', detail: err.message }
  }
}

async function main() {
  console.log(`[schema-check] probing ${SUPABASE_URL}`)
  const failures = []
  let total = 0

  for (const [table, cols] of Object.entries(TABLE_COLUMNS)) {
    for (const col of cols) {
      total++
      const r = await probeColumn(table, col)
      if (!r.ok) {
        failures.push({ table, col, ...r })
        console.log(`✗ ${table}.${col} — ${r.kind} — ${r.detail || ''}`)
      }
    }
  }

  console.log('')
  console.log(`[schema-check] ${total - failures.length}/${total} columns OK`)
  if (failures.length) {
    console.log(`[schema-check] ${failures.length} MISSING:`)
    for (const f of failures) console.log(`  - ${f.table}.${f.col}  [${f.kind}]`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('[schema-check] fatal:', err)
  process.exit(2)
})
