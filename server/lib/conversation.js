import supabaseAdmin from './supabaseAdmin.js'

/**
 * Append one event to a lead's conversation log.
 * entry: { role: 'client'|'agent', type: 'message'|'offer', text, vehicleName?, priceTotal? }
 *
 * Uses read-modify-write because Supabase JS has no native JSONB array-append.
 * Leads are low-volume so the window for a race is tiny; the log is advisory,
 * not transactional — a missed entry is not data loss for the rental record itself.
 */
export async function appendConversation(leadId, entry) {
  const ts = new Date().toISOString()
  const { data, error: readErr } = await supabaseAdmin
    .from('pending_demands')
    .select('conversation')
    .eq('id', leadId)
    .maybeSingle()

  if (readErr) {
    console.error('[conversation/append] read error:', readErr.message)
    return
  }

  const existing = Array.isArray(data?.conversation) ? data.conversation : []
  const { error: writeErr } = await supabaseAdmin
    .from('pending_demands')
    .update({ conversation: [...existing, { ...entry, ts }] })
    .eq('id', leadId)

  if (writeErr) console.error('[conversation/append] write error:', writeErr.message)
}
