/**
 * Auto-purge: delete signed contract PDFs older than 30 days.
 *
 * Calls the `purge_expired_signed_pdfs()` Postgres function which atomically
 * nulls signed_pdf_path on stale rows (LIMIT 500 per run) and returns the
 * storage paths to delete. Run daily; if there's a backlog, multiple days
 * will drain it without ever processing more than 500 rows in one shot.
 */

import supabaseAdmin from '../lib/supabaseAdmin.js'

const STORAGE_DELETE_BATCH_SIZE = 500

export async function purgeSignedPdfs() {
  if (!supabaseAdmin) return { purged: 0 }

  const { data, error } = await supabaseAdmin.rpc('purge_expired_signed_pdfs')
  if (error) {
    console.error('[purgeSignedPdfs] RPC failed:', error.message)
    return { purged: 0, error: error.message }
  }

  const rows = data || []
  if (rows.length === 0) return { purged: 0 }

  // The RPC returns bucket-relative paths like "<contractId>/signed.pdf".
  const paths = rows.map(r => r.pdf_path).filter(Boolean)

  // Chunk to stay well under any storage API batch limit.
  const errors = []
  for (let i = 0; i < paths.length; i += STORAGE_DELETE_BATCH_SIZE) {
    const chunk = paths.slice(i, i + STORAGE_DELETE_BATCH_SIZE)
    const { error: delErr } = await supabaseAdmin
      .storage.from('signed_contracts')
      .remove(chunk)
    if (delErr) {
      console.error(`[purgeSignedPdfs] storage chunk ${i / STORAGE_DELETE_BATCH_SIZE} failed: ${delErr.message}`)
      errors.push(delErr.message)
    }
  }

  return { purged: rows.length, paths, errors: errors.length ? errors : undefined }
}
