/**
 * Auto-purge: delete signed contract PDFs older than 30 days.
 *
 * Calls the `purge_expired_signed_pdfs()` Postgres function which atomically
 * nulls signed_pdf_url on stale rows and returns the storage paths to delete.
 * Then we strip the signed-URL prefix to get the bucket-relative object path
 * and remove from Storage.
 */

import supabaseAdmin from '../lib/supabaseAdmin.js'

export async function purgeSignedPdfs() {
  if (!supabaseAdmin) return { purged: 0 }

  const { data, error } = await supabaseAdmin.rpc('purge_expired_signed_pdfs')
  if (error) {
    console.error('[purgeSignedPdfs] RPC failed:', error.message)
    return { purged: 0, error: error.message }
  }

  const rows = data || []
  if (rows.length === 0) return { purged: 0 }

  // Each row.pdf_url is a long-lived signed URL of the form
  //   https://<project>.supabase.co/storage/v1/object/sign/signed_contracts/<id>/signed.pdf?token=...
  // We only need the path inside the bucket: `<id>/signed.pdf`.
  const objectPaths = rows
    .map(r => {
      try {
        const u = new URL(r.pdf_url)
        const m = u.pathname.match(/\/signed_contracts\/(.+)$/)
        return m?.[1] || null
      } catch { return null }
    })
    .filter(Boolean)

  if (objectPaths.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .storage.from('signed_contracts')
      .remove(objectPaths)
    if (delErr) console.warn('[purgeSignedPdfs] storage delete partial:', delErr.message)
  }

  return { purged: rows.length, paths: objectPaths }
}
