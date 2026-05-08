/**
 * Shared helpers for the e-signature dispatch flow.
 *
 * Both /contracts/:id/send-whatsapp and /contracts/:id/send-email run the same
 * core sequence: validate ownership, decode/merge the unsigned PDF, upload it,
 * mint or reuse a signing token, persist it. Only the dispatch (Twilio vs
 * Resend) differs.
 *
 * Centralizing here also fixes the silent-fallback bug in template merge: when
 * an agency has uploaded a custom template and the merge fails, callers get
 * { templateApplied: 'fallback', templateError } and can surface that in logs.
 */

import crypto from 'node:crypto'
import supabaseAdmin from './supabaseAdmin.js'

// pdf-lib is loaded lazily so the module can be imported in environments
// where pdf-lib isn't installed (e.g. the frontend root vitest runner used
// for unit-testing `escapeHtml`).
async function loadPdfLib() {
  // @vite-ignore — pdf-lib is server-only; keeping the import dynamic prevents
  // the frontend's vite import analyzer from trying to resolve it during
  // unit tests run from the repo root.
  const modName = 'pdf-lib'
  const mod = await import(/* @vite-ignore */ modName)
  return mod.PDFDocument
}

export const SIGN_TOKEN_TTL_HOURS = 24
const TOKEN_REUSE_WINDOW_MS = 5 * 60 * 1000   // reuse fresh tokens for 5 min

/** HTML-escape user-controlled values before interpolating into innerHTML. */
export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Append the agency's custom contract PDF after `autoBuffer` if one is set.
 * Returns { buffer, applied: 'merged'|'none'|'fallback', error? }.
 * Never throws — callers always get a usable buffer.
 */
export async function appendAgencyTemplate(autoBuffer, agencyId) {
  if (!agencyId) return { buffer: autoBuffer, applied: 'none' }
  const { data: ag, error } = await supabaseAdmin
    .from('agencies')
    .select('contract_template_url')
    .eq('id', agencyId)
    .maybeSingle()
  if (error) return { buffer: autoBuffer, applied: 'fallback', error: error.message }
  const url = ag?.contract_template_url
  if (!url) return { buffer: autoBuffer, applied: 'none' }

  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      return { buffer: autoBuffer, applied: 'fallback', error: `template fetch ${resp.status}` }
    }
    const tplBytes = new Uint8Array(await resp.arrayBuffer())
    const PDFDocument = await loadPdfLib()
    const merged = await PDFDocument.load(autoBuffer)
    const tpl    = await PDFDocument.load(tplBytes)
    const pages  = await merged.copyPages(tpl, tpl.getPageIndices())
    pages.forEach(p => merged.addPage(p))
    return { buffer: Buffer.from(await merged.save()), applied: 'merged' }
  } catch (err) {
    return { buffer: autoBuffer, applied: 'fallback', error: err.message }
  }
}

/**
 * Common pre-dispatch logic: ownership check, PDF decode + merge + upload,
 * token mint (or reuse), DB write. Returns the token + signing URL.
 *
 * Idempotency: if a `pending` token exists and was minted less than
 * TOKEN_REUSE_WINDOW_MS ago, reuse it. Prevents double-clicks from
 * invalidating the link the customer already received.
 *
 * @returns {Object} { contract, client, agencyId, signUrl, token, expiresAt, templateApplied, templateError }
 * @throws  Error with .status (4xx/5xx) and .body on validation/upload failure
 */
export async function prepareSignableContract({ contractId, pdfBase64, userAgencyId }) {
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw httpError(400, { error: 'pdf_base64 is required' })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select(`
      id, agency_id, client_id, contract_number,
      signature_status, signing_token, signing_token_expires_at,
      clients(email, phone, first_name, last_name)
    `)
    .eq('id', contractId)
    .single()
  if (error || !contract) throw httpError(404, { error: 'Contract not found' })
  if (userAgencyId && contract.agency_id !== userAgencyId) {
    throw httpError(403, { error: 'Forbidden' })
  }

  const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
  const pdfBuffer = Buffer.from(base64Data, 'base64')
  if (pdfBuffer.length === 0) throw httpError(400, { error: 'pdf_base64 decoded to empty buffer' })

  const merge = await appendAgencyTemplate(pdfBuffer, contract.agency_id)

  const unsignedObjectPath = `${contractId}/unsigned.pdf`
  const { error: upErr } = await supabaseAdmin
    .storage.from('signed_contracts')
    .upload(unsignedObjectPath, merge.buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) throw httpError(500, { error: 'pdf_upload_failed', detail: upErr.message })

  // Idempotency: reuse a pending token if it's young enough.
  const now = Date.now()
  let token = contract.signing_token
  let expiresAt = contract.signing_token_expires_at
  const tokenIsFresh =
    contract.signature_status === 'pending' &&
    token &&
    expiresAt &&
    new Date(expiresAt).getTime() - now > 0 &&
    new Date(expiresAt).getTime() - now > (SIGN_TOKEN_TTL_HOURS * 3600_000) - TOKEN_REUSE_WINDOW_MS

  if (!tokenIsFresh) {
    token = crypto.randomUUID()
    expiresAt = new Date(now + SIGN_TOKEN_TTL_HOURS * 3600_000).toISOString()
  }

  const { error: updErr } = await supabaseAdmin
    .from('contracts')
    .update({
      signature_status:        'pending',
      signing_token:           token,
      signing_token_expires_at: expiresAt,
      unsigned_pdf_path:       `signed_contracts/${unsignedObjectPath}`,
    })
    .eq('id', contractId)
  if (updErr) throw httpError(500, { error: 'db_update_failed', detail: updErr.message })

  const baseUrl = (process.env.FRONTEND_URL || 'https://app.rentaflow.local').replace(/\/$/, '')
  const signUrl = `${baseUrl}/?sign=${token}`

  return {
    contract,
    client: contract.clients,
    agencyId: contract.agency_id,
    signUrl,
    token,
    expiresAt,
    reused: tokenIsFresh,
    templateApplied: merge.applied,
    templateError: merge.error,
  }
}

function httpError(status, body) {
  const err = new Error(body?.error || `HTTP ${status}`)
  err.status = status
  err.body = body
  return err
}
