import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidNormalizedUser,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'
import { useSupabaseAuthState } from './authState.js'
import { handleInboundWhatsApp } from '../../routes/leads.js'
import { transcribeAudio } from '../transcribe.js'
import supabaseAdmin from '../supabaseAdmin.js'

// No backend endpoint deletes agencies — they're removed via Supabase dashboard
// or manual SQL when needed. `reapOrphanedSessions()` (scheduled in server/index.js)
// catches any session whose agency was deleted out-of-band and disconnects the
// in-memory socket so it stops trying to upsert into a cascade-deleted row.

// Logger level is env-driven so prod debugging is possible without a redeploy.
// Default 'warn' surfaces real problems without spamming on every key rotation.
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' })

const MAX_RECONNECT_ATTEMPTS = 6        // ~63s of total back-off before giving up
const BASE_RECONNECT_DELAY_MS = 1000    // 1s, 2s, 4s, 8s, 16s, 32s

// Anti-ban: jitter between 2–5s before every outbound send so we don't look like a bot.
const SEND_DELAY_MIN_MS = 2000
const SEND_DELAY_MAX_MS = 5000

// Anti-ban: hard daily send cap per agency. Overridable via env for high-volume orgs,
// but the floor exists to stop a runaway loop from torching an account.
const DAILY_SEND_LIMIT = Number(process.env.BAILEYS_DAILY_SEND_LIMIT || 150)

/** @type {Map<string, { date: string, count: number }>} */
const sendCounters = new Map()

function todayUtc() {
  return new Date().toISOString().slice(0, 10)   // "YYYY-MM-DD"
}

function bumpDailyCounter(agencyId) {
  const today = todayUtc()
  const entry = sendCounters.get(agencyId)
  if (!entry || entry.date !== today) {
    sendCounters.set(agencyId, { date: today, count: 1 })
    return 1
  }
  entry.count += 1
  return entry.count
}

function randomDelay() {
  const ms = SEND_DELAY_MIN_MS + Math.floor(Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS))
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract a phone number from a Baileys JID, defending against `@lid` / device-id
 * shapes that newer WhatsApp accounts use. Returns null if unparseable.
 * Exported for unit-testing.
 */
export function parsePhoneFromJid(jid) {
  if (!jid || typeof jid !== 'string') return null
  // Strip device suffix ("212600000001:42@s.whatsapp.net" → "212600000001")
  const localPart = jid.split('@')[0]
  const phone = localPart.split(':')[0]
  // Only return if it looks like a phone number (digits only, 10–15 chars)
  return /^\d{10,15}$/.test(phone) ? phone : null
}

/**
 * @typedef {{
 *   sock: object|null,
 *   qrDataUrl: string|null,
 *   status: string,
 *   phone: string|null,
 *   connectedAt: string|null,
 *   reconnectAttempts: number
 * }} SessionEntry
 */

/** @type {Map<string, SessionEntry>} */
const sessions = new Map()

// ── Public API ────────────────────────────────────────────

/**
 * Start (or reconnect) a Baileys session for an agency.
 * Idempotent — calling while already connected is a no-op.
 */
export async function startSession(agencyId) {
  const existing = sessions.get(agencyId)?.status
  if (existing === 'connected' || existing === 'connecting') return
  // 'reconnecting' falls through — the scheduled setTimeout is what called us

  // Preserve attempt counter across reconnect cycles (don't reset on success here —
  // we reset only when `connection === 'open'` lands).
  const prevAttempts = sessions.get(agencyId)?.reconnectAttempts ?? 0
  sessions.set(agencyId, {
    sock: null, qrDataUrl: null, status: 'connecting', phone: null,
    connectedAt: null, reconnectAttempts: prevAttempts,
  })

  try {
    const { state, saveCreds } = await useSupabaseAuthState(agencyId)
    const { version } = await fetchLatestBaileysVersion()

    // `printQRInTerminal` is deprecated in recent Baileys — we render the QR
    // ourselves from the `qr` payload in connection.update, so it's omitted.
    const sock = makeWASocket({ version, auth: state, logger })
    sessions.get(agencyId).sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      const entry = sessions.get(agencyId)
      if (!entry) return

      if (qr) {
        entry.qrDataUrl = await QRCode.toDataURL(qr)
        entry.status    = 'qr_ready'
      }

      if (connection === 'open') {
        const phone = parsePhoneFromJid(sock.user?.id)
        // Preserve the original connected_at across transient reconnects so the
        // warm-up banner doesn't reset every time Railway restarts the dyno.
        // Only stamp a new connected_at if there isn't one already in the DB.
        const { data: existing } = await supabaseAdmin
          .from('whatsapp_sessions')
          .select('connected_at')
          .eq('agency_id', agencyId)
          .maybeSingle()
        const connectedAt = existing?.connected_at || new Date().toISOString()

        entry.qrDataUrl         = null
        entry.status            = 'connected'
        entry.phone             = phone
        entry.connectedAt       = connectedAt
        entry.reconnectAttempts = 0   // reset back-off on successful connect

        await supabaseAdmin
          .from('whatsapp_sessions')
          .update({ phone, connected_at: connectedAt })
          .eq('agency_id', agencyId)
        console.log(`[baileys] ✓ connected agency=${agencyId} phone=${phone ?? '(unparsed)'}`)
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode
          : 0
        const loggedOut = code === DisconnectReason.loggedOut
        console.log(`[baileys] connection closed agency=${agencyId} code=${code} loggedOut=${loggedOut}`)

        if (loggedOut) {
          // Permanent — Meta invalidated the session. Drop everything.
          await disconnectSession(agencyId)
          return
        }

        // Transient — exponential back-off with a hard cap to avoid hammering
        // WhatsApp's servers (which can itself trigger a ban) on a broken account.
        const attempts = (entry.reconnectAttempts ?? 0) + 1
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          console.error(
            `[baileys] giving up on agency=${agencyId} after ${MAX_RECONNECT_ATTEMPTS} attempts — ` +
            `manual reconnect required from Settings`
          )
          entry.status = 'failed'
          // Keep DB row so user can retry via UI; just drop the dead socket from memory.
          sessions.delete(agencyId)
          return
        }
        const delayMs = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1)
        sessions.set(agencyId, { ...entry, sock: null, status: 'reconnecting', reconnectAttempts: attempts })
        console.log(`[baileys] reconnecting agency=${agencyId} attempt=${attempts}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs}ms`)
        setTimeout(() => startSession(agencyId), delayMs)
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        if (!msg.message)   continue

        const senderJid = jidNormalizedUser(msg.key.remoteJid)
        let bodyText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          ''

        let imageBuffer = null
        let mimeType    = null

        if (msg.message?.imageMessage) {
          try {
            imageBuffer = await downloadMediaMessage(msg, 'buffer', {}, {
              logger,
              reuploadRequest: sock.updateMediaMessage,
            })
            mimeType = msg.message.imageMessage.mimetype || 'image/jpeg'
          } catch (err) {
            console.error(`[baileys] media download failed agency=${agencyId}:`, err.message)
          }
        }

        // Voice notes (ptt) and regular audio attachments — transcribe via Whisper
        // so the text flows through the normal triage + classification pipeline.
        const audioNode = msg.message?.audioMessage || msg.message?.pttMessage
        if (audioNode && !bodyText.trim()) {
          try {
            const audioBuffer = await downloadMediaMessage(msg, 'buffer', {}, {
              logger,
              reuploadRequest: sock.updateMediaMessage,
            })
            const audioMime = audioNode.mimetype || 'audio/ogg'
            console.log(`[baileys] audio received agency=${agencyId} | mime=${audioMime} | bytes=${audioBuffer?.length || 0}`)
            const transcript = await transcribeAudio(audioBuffer, audioMime)
            if (transcript) {
              bodyText = transcript
              console.log(`[baileys] audio transcribed agency=${agencyId} | "${transcript.slice(0, 80)}"`)
            } else {
              console.warn(`[baileys] audio transcription returned empty agency=${agencyId}`)
            }
          } catch (err) {
            console.error(`[baileys] audio download/transcribe failed agency=${agencyId}:`, err.message)
          }
        }

        handleInboundWhatsApp(agencyId, senderJid, imageBuffer, mimeType, bodyText)
          .catch(err => console.error(`[baileys] pipeline error agency=${agencyId}:`, err.message))
      }
    })
  } catch (err) {
    sessions.delete(agencyId)
    console.error(`[baileys] startSession failed agency=${agencyId}:`, err.message)
  }
}

/**
 * Send a WhatsApp message through the agency's active session.
 * @param {string} agencyId
 * @param {string} jid  — e.g. "212XXXXXXXXX@s.whatsapp.net"
 * @param {string} text
 */
export async function sendMessage(agencyId, jid, text) {
  const entry = sessions.get(agencyId)
  if (!entry?.sock || entry.status !== 'connected') {
    throw new Error(`No active WhatsApp session for agency ${agencyId}`)
  }

  // Anti-ban (5): daily volume cap — fail loudly before a runaway loop nukes the account.
  const count = bumpDailyCounter(agencyId)
  if (count > DAILY_SEND_LIMIT) {
    throw new Error(
      `Daily WhatsApp send limit reached for agency ${agencyId} (${count}/${DAILY_SEND_LIMIT}). ` +
      `Resets at next UTC midnight.`
    )
  }

  // Anti-ban (2): randomised 2–5s delay so we don't look like a sub-second bot.
  await randomDelay()

  await entry.sock.sendMessage(jid, { text })
}

/**
 * Returns the current session state for an agency.
 * @param {string} agencyId
 * @returns {{
 *   connected: boolean,
 *   qrDataUrl: string|null,
 *   status: string,
 *   phone: string|null,
 *   connectedAt: string|null,
 *   dailySendCount: number,
 *   dailySendLimit: number
 * }}
 */
export function getStatus(agencyId) {
  const entry = sessions.get(agencyId)
  const counter = sendCounters.get(agencyId)
  const dailySendCount = (counter && counter.date === todayUtc()) ? counter.count : 0
  if (!entry) {
    return {
      connected: false, qrDataUrl: null, status: 'idle', phone: null,
      connectedAt: null, dailySendCount, dailySendLimit: DAILY_SEND_LIMIT,
    }
  }
  return {
    connected:      entry.status === 'connected',
    qrDataUrl:      entry.qrDataUrl,
    status:         entry.status,
    phone:          entry.phone,
    connectedAt:    entry.connectedAt,
    dailySendCount,
    dailySendLimit: DAILY_SEND_LIMIT,
  }
}

/**
 * Log out, delete session from DB, remove from memory.
 */
export async function disconnectSession(agencyId) {
  const entry = sessions.get(agencyId)
  if (entry?.sock) {
    try { await entry.sock.logout() } catch (_) {}
    try { entry.sock.end() }          catch (_) {}
  }
  sessions.delete(agencyId)
  await supabaseAdmin
    .from('whatsapp_sessions')
    .delete()
    .eq('agency_id', agencyId)
  console.log(`[baileys] session removed agency=${agencyId}`)
}

/**
 * Reaper — finds in-memory sessions whose agency no longer exists and
 * disconnects them. Called on a cron from server/index.js.
 *
 * Catches the case where an agency is deleted via Supabase dashboard or
 * manual SQL (no backend endpoint exists). The cascade drops the
 * whatsapp_sessions row, but the in-memory socket survives until reaped.
 */
export async function reapOrphanedSessions() {
  if (!supabaseAdmin) return
  if (sessions.size === 0) return

  const inMemoryIds = Array.from(sessions.keys())
  const { data, error } = await supabaseAdmin
    .from('agencies')
    .select('id')
    .in('id', inMemoryIds)
  if (error) {
    console.error('[baileys:reaper] agency lookup failed:', error.message)
    return
  }
  const liveIds = new Set((data || []).map(row => row.id))
  const orphans = inMemoryIds.filter(id => !liveIds.has(id))

  for (const orphanId of orphans) {
    console.warn(`[baileys:reaper] disconnecting orphaned session — agency ${orphanId} no longer exists`)
    await disconnectSession(orphanId).catch(err =>
      console.error(`[baileys:reaper] disconnect failed agency=${orphanId}:`, err.message)
    )
  }
  if (orphans.length > 0) {
    console.log(`[baileys:reaper] reaped ${orphans.length} orphaned session(s)`)
  }
}

/**
 * Called once at server startup — resumes all saved sessions.
 */
export async function initAllSessions() {
  if (!supabaseAdmin) {
    console.warn('[baileys] supabaseAdmin not configured — skipping session restore (dev mode)')
    return
  }
  const { data: rows, error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('agency_id')
  if (error) {
    console.error('[baileys] initAllSessions DB error:', error.message)
    return
  }
  for (const { agency_id } of (rows || [])) {
    startSession(agency_id)
      .catch(err => console.error(`[baileys] init failed agency=${agency_id}:`, err.message))
  }
  console.log(`[baileys] resuming ${(rows || []).length} session(s)`)
}
