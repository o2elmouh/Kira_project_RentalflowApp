import 'dotenv/config'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { anonymizeClient } from '../lib/anonymize.js'

/**
 * Phase 4: monthly cron job that anonymizes clients whose contracts have all
 * been closed for longer than the agency's configured retention period
 * (`agencies.retention_years`, default 10 — Moroccan accounting law).
 *
 * For each non-anonymized client in an agency:
 *   - skip if any contract is not closed
 *   - skip if any contract has no closed_at (defensive — shouldn't happen)
 *   - skip if the most recent closed_at is more recent than `retention_years` ago
 *   - otherwise → anonymize via the shared helper (writes audit_log)
 *
 * The actor_user_id on audit_log entries is the agency owner's profile id
 * (oldest admin profile in the agency). The action is `client.anonymize.retention`
 * so retention-driven anonymizations are distinguishable from manual ones.
 */
export async function enforceRetention(db = supabaseAdmin) {
  const { data: agencies, error: agencyErr } = await db
    .from('agencies')
    .select('id, retention_years')

  if (agencyErr) throw new Error(`fetch agencies: ${agencyErr.message}`)
  if (!agencies?.length) return { anonymized: 0, byAgency: {} }

  let totalAnonymized = 0
  const byAgency = {}

  for (const agency of agencies) {
    const retentionYears = agency.retention_years ?? 10
    const cutoffMs = Date.now() - retentionYears * 365.25 * 24 * 60 * 60 * 1000
    const cutoffIso = new Date(cutoffMs).toISOString()

    // Pick an admin actor for the audit_log. Oldest admin profile in the agency
    // serves as the "system" actor for automated runs.
    const { data: actor, error: actorErr } = await db
      .from('profiles')
      .select('id')
      .eq('agency_id', agency.id)
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (actorErr || !actor) {
      console.warn(`[retention] no admin found for agency ${agency.id} — skipping`)
      byAgency[agency.id] = { anonymized: 0, skipped: 'no_admin' }
      continue
    }

    const { data: clients, error: clientsErr } = await db
      .from('clients')
      .select('id')
      .eq('agency_id', agency.id)
      .is('anonymized_at', null)

    if (clientsErr) {
      console.warn(`[retention] clients query failed for agency ${agency.id}:`, clientsErr.message)
      byAgency[agency.id] = { anonymized: 0, error: clientsErr.message }
      continue
    }
    if (!clients?.length) {
      byAgency[agency.id] = { anonymized: 0 }
      continue
    }

    let agencyAnonymized = 0

    for (const client of clients) {
      const { data: contracts, error: contractsErr } = await db
        .from('contracts')
        .select('status, closed_at')
        .eq('client_id', client.id)

      if (contractsErr) {
        console.warn(`[retention] contracts query failed for client ${client.id}:`, contractsErr.message)
        continue
      }
      if (!contracts?.length) continue                          // no contracts → not a retention candidate

      const hasOpen = contracts.some(c => c.status !== 'closed')
      if (hasOpen) continue

      const missingDates = contracts.some(c => !c.closed_at)
      if (missingDates) continue                                // can't reason about retention without dates

      const latestClosed = contracts
        .map(c => new Date(c.closed_at).getTime())
        .reduce((a, b) => Math.max(a, b))

      if (latestClosed >= cutoffMs) continue                    // most recent close is within retention window

      const result = await anonymizeClient({
        clientId:    client.id,
        agencyId:    agency.id,
        actorUserId: actor.id,
        action:      'client.anonymize.retention',
        reason:      `Auto-retention: all contracts closed before ${cutoffIso.slice(0, 10)}`,
        metadata:    { retention_years: retentionYears, latest_closed_at: new Date(latestClosed).toISOString() },
        db,
      })

      if (result.ok) {
        agencyAnonymized++
        totalAnonymized++
        console.log(`[retention] anonymized client ${client.id} (agency ${agency.id})`)
      } else if (result.error) {
        console.warn(`[retention] anonymize failed for client ${client.id}:`, result.error)
      }
    }

    byAgency[agency.id] = { anonymized: agencyAnonymized }
  }

  return { anonymized: totalAnonymized, byAgency }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  enforceRetention()
    .then(({ anonymized, byAgency }) => {
      console.log(`Retention complete: ${anonymized} clients anonymized`)
      console.log(JSON.stringify(byAgency, null, 2))
      process.exit(0)
    })
    .catch(err => {
      console.error('Retention failed:', err)
      process.exit(1)
    })
}
