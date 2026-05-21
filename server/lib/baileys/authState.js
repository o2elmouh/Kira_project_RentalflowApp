import supabaseAdmin from '../supabaseAdmin.js'
import {
  initAuthCreds,
  BufferJSON,
  proto,
} from '@whiskeysockets/baileys'

/**
 * Baileys auth state backed by Supabase `whatsapp_sessions` table.
 * Drop-in replacement for useMultiFileAuthState.
 *
 * @param {string} agencyId
 * @returns {{ state: { creds, keys }, saveCreds: () => Promise<void> }}
 */
export async function useSupabaseAuthState(agencyId) {
  // ── Load existing state from DB ──────────────────────────
  const { data: row } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('auth_state')
    .eq('agency_id', agencyId)
    .maybeSingle()

  const stored = row?.auth_state || {}

  // Restore creds (Buffers serialised as { type:'Buffer', data:[...] })
  const creds = stored.creds
    ? JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver)
    : initAuthCreds()

  // In-memory key cache (restored from DB)
  const keyCache = {}
  for (const [k, v] of Object.entries(stored.keys || {})) {
    keyCache[k] = JSON.parse(JSON.stringify(v), BufferJSON.reviver)
  }

  // ── Persist to DB (serialized — prevents concurrent-write clobbering) ─
  // creds.update and keys.set can fire in overlapping ticks; without a mutex
  // the later write may stomp the earlier one. We chain every persist() onto
  // a single in-flight promise so writes are strictly sequential per agency.
  let writeChain = Promise.resolve()
  function persist() {
    writeChain = writeChain.then(async () => {
      const serialized = {
        creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
        keys:  JSON.parse(JSON.stringify(keyCache, BufferJSON.replacer)),
      }
      const { error } = await supabaseAdmin
        .from('whatsapp_sessions')
        .upsert(
          { agency_id: agencyId, auth_state: serialized, updated_at: new Date().toISOString() },
          { onConflict: 'agency_id' }
        )
      if (error) console.error(`[baileys:auth] persist failed agency=${agencyId}:`, error.message)
    }).catch(err => {
      console.error(`[baileys:auth] persist chain error agency=${agencyId}:`, err?.message || err)
    })
    return writeChain
  }

  // ── Signal key store ──────────────────────────────────────
  const keys = {
    get: async (type, ids) => {
      const result = {}
      for (const id of ids) {
        let value = keyCache[`${type}:${id}`] ?? null
        if (type === 'app-state-sync-key' && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value)
        }
        result[id] = value
      }
      return result
    },
    set: async (data) => {
      for (const [category, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries ?? {})) {
          const key = `${category}:${id}`
          if (value !== null && value !== undefined) {
            keyCache[key] = value
          } else {
            delete keyCache[key]
          }
        }
      }
      await persist()
    },
  }

  return {
    state: { creds, keys },
    saveCreds: persist,
  }
}
