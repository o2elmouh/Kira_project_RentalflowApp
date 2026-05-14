import supabaseAdminDefault from './supabaseAdmin.js'

/**
 * Anonymize a single client row + write an audit_log entry.
 *
 * Shared by:
 *   - POST /admin/clients/:id/anonymize         (manual operator action — Phase 3)
 *   - server/scripts/enforceRetention.js cron   (automatic retention — Phase 4)
 *
 * Idempotent: if the client is already anonymized we return `{ skipped: true }`
 * so the caller can decide whether that's an error (HTTP 409) or a no-op (cron).
 *
 * @param {object}   args
 * @param {string}   args.clientId        UUID of the client row
 * @param {string}   args.agencyId        Agency the actor belongs to — caller is
 *                                        responsible for verifying authorization;
 *                                        we use it only as the audit_log row's
 *                                        agency_id.
 * @param {string}   args.actorUserId     UUID written to audit_log.actor_user_id.
 *                                        For automated cron runs, pass the agency
 *                                        owner's profile id (the agency-bot pattern).
 * @param {string}   args.action          'client.anonymize' (manual) or
 *                                        'client.anonymize.retention' (cron)
 * @param {string?}  args.reason          Free-text reason stored in audit_log
 * @param {object?}  args.metadata        Optional JSON metadata (e.g. retention_years used)
 * @param {object?}  args.db              Override the supabase admin client (for tests)
 * @returns {Promise<{ok:true} | {skipped:true} | {error:string}>}
 */
export async function anonymizeClient({
  clientId,
  agencyId,
  actorUserId,
  action = 'client.anonymize',
  reason = null,
  metadata = null,
  db = supabaseAdminDefault,
}) {
  if (!clientId || !agencyId || !actorUserId) {
    return { error: 'clientId, agencyId, actorUserId required' }
  }

  const { data: client, error: fetchErr } = await db
    .from('clients')
    .select('id, agency_id, anonymized_at')
    .eq('id', clientId)
    .single()

  if (fetchErr || !client) return { error: 'Client not found' }
  if (client.agency_id !== agencyId) return { error: 'Forbidden' }
  if (client.anonymized_at) return { skipped: true }

  const { error: updateErr } = await db
    .from('clients')
    .update({
      id_number:              null,
      id_expiry:              null,
      driving_license_num:    null,
      driving_license_expiry: null,
      date_of_birth:          null,
      email:                  null,
      phone:                  null,
      phone2:                 null,
      address:                null,
      first_name:             '[ANONYMIZED]',
      last_name:              '[ANONYMIZED]',
      anonymized_at:          new Date().toISOString(),
    })
    .eq('id', clientId)

  if (updateErr) return { error: updateErr.message }

  await db.from('audit_log').insert({
    agency_id:    agencyId,
    actor_user_id: actorUserId,
    action,
    target_table: 'clients',
    target_id:    clientId,
    reason,
    metadata,
  })

  return { ok: true }
}
