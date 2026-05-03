import 'dotenv/config'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const RETENTION_DAYS = 30

export async function cleanupPendingDemands(db = supabaseAdmin) {
  const { data: demands, error } = await db
    .from('pending_demands')
    .select('id, sender_id, source, agency_id')
    .not('extracted_data', 'is', null)
    .is('anonymized_at', null)

  if (error) throw new Error(`fetch demands: ${error.message}`)
  if (!demands.length) return { anonymized: 0 }

  console.log(`[cleanup] found ${demands.length} demands to check`)
  let anonymized = 0

  for (const demand of demands) {
    const matchField = demand.source === 'gmail' ? 'email' : 'phone'

    const { data: clients, error: clientErr } = await db
      .from('clients')
      .select('id')
      .eq('agency_id', demand.agency_id)
      .eq(matchField, demand.sender_id)

    if (clientErr) { console.warn(`[cleanup] clients query failed for demand ${demand.id}:`, clientErr.message); continue }
    if (!clients?.length) continue

    const clientId = clients[0].id

    const { data: openContracts, error: openErr } = await db
      .from('contracts')
      .select('id')
      .eq('client_id', clientId)
      .neq('status', 'closed')

    if (openErr) { console.warn(`[cleanup] open contracts query failed for client ${clientId}:`, openErr.message); continue }
    if (openContracts?.length) continue

    const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentClosed, error: recentErr } = await db
      .from('contracts')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'closed')
      .gte('closed_at', retentionCutoff)

    if (recentErr) { console.warn(`[cleanup] recent contracts query failed for client ${clientId}:`, recentErr.message); continue }
    if (recentClosed?.length) continue

    const { error: updateErr } = await db
      .from('pending_demands')
      .update({ extracted_data: null, anonymized_at: new Date().toISOString() })
      .eq('id', demand.id)
      .is('anonymized_at', null)

    if (updateErr) { console.warn(`[cleanup] update failed for demand ${demand.id}:`, updateErr.message); continue }

    console.log(`[cleanup] anonymized demand ${demand.id}`)
    anonymized++
  }

  return { anonymized }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  cleanupPendingDemands()
    .then(({ anonymized }) => {
      console.log(`Cleanup complete: ${anonymized} demands anonymized`)
      process.exit(0)
    })
    .catch(err => {
      console.error('Cleanup failed:', err)
      process.exit(1)
    })
}
