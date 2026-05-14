import 'dotenv/config'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { encrypt, isEncryptionConfigured, isEncryptedBlob } from '../lib/encryption.js'

/**
 * Phase 5a: one-time backfill of the new ciphertext columns from the legacy
 * plaintext columns.
 *
 * Reads every client row in batches and, for each of the three sensitive
 * fields (id_number / driving_license_num / date_of_birth), copies the
 * plaintext into the matching `_enc` column AFTER encrypting it. The
 * plaintext columns are NOT cleared by this script — they remain authoritative
 * until ENCRYPT_PII is flipped on and we've finished the 2-week soak.
 *
 * Idempotent: rows whose `_enc` columns are already populated (and look like
 * ciphertext) are skipped. Safe to run multiple times. Safe to interrupt and
 * resume.
 *
 * REQUIREMENT: `ENCRYPTION_KEY` env var must be set, otherwise the dev
 * fallback would write plaintext to the `_enc` columns. We fail loudly if not.
 */

const BATCH = 200

export async function migrateClientsEncryption(db = supabaseAdmin) {
  if (!isEncryptionConfigured()) {
    throw new Error('ENCRYPTION_KEY is not set — refusing to run (would write plaintext)')
  }

  let from = 0
  let processed = 0
  let encrypted = 0
  let skipped = 0
  let nullified = 0

  // Paginate through clients with .range() — Supabase caps each select.
  for (;;) {
    const { data: rows, error } = await db
      .from('clients')
      .select('id, id_number, driving_license_num, date_of_birth, id_number_enc, driving_license_num_enc, date_of_birth_enc')
      .order('id', { ascending: true })
      .range(from, from + BATCH - 1)

    if (error) throw new Error(`fetch clients: ${error.message}`)
    if (!rows?.length) break

    for (const row of rows) {
      processed++
      const patch = {}

      // For each sensitive field: encrypt the plaintext IF (a) there IS plaintext
      // AND (b) the _enc column is not already a valid ciphertext blob.
      const triples = [
        ['id_number',           'id_number_enc'],
        ['driving_license_num', 'driving_license_num_enc'],
        ['date_of_birth',       'date_of_birth_enc'],
      ]
      let touched = false
      let nulled  = false

      for (const [plainCol, encCol] of triples) {
        const plain = row[plainCol]
        const existing = row[encCol]

        if (isEncryptedBlob(existing)) {
          // Already encrypted — leave alone.
          continue
        }

        if (plain == null || plain === '') {
          // No plaintext to encrypt; ensure _enc is null (defensive cleanup).
          if (existing != null) { patch[encCol] = null; nulled = true }
          continue
        }

        patch[encCol] = encrypt(String(plain))
        touched = true
      }

      if (Object.keys(patch).length === 0) { skipped++; continue }

      const { error: updErr } = await db
        .from('clients').update(patch).eq('id', row.id)
      if (updErr) { console.warn(`[migrate] update failed for ${row.id}:`, updErr.message); continue }

      if (touched) encrypted++
      if (nulled)  nullified++
    }

    if (rows.length < BATCH) break
    from += BATCH
  }

  return { processed, encrypted, skipped, nullified }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  migrateClientsEncryption()
    .then(({ processed, encrypted, skipped, nullified }) => {
      console.log(`Encryption migration complete:`)
      console.log(`  processed: ${processed}`)
      console.log(`  encrypted: ${encrypted}`)
      console.log(`  skipped (already encrypted): ${skipped}`)
      console.log(`  nullified stale _enc columns: ${nullified}`)
      process.exit(0)
    })
    .catch(err => {
      console.error('Migration failed:', err.message)
      process.exit(1)
    })
}
