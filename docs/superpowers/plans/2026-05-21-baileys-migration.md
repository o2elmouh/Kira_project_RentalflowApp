# Twilio → Baileys Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Twilio WhatsApp with Baileys so each agency connects their existing WhatsApp Business number via a QR scan in Settings, with zero per-message cost, no Meta approval, and no Twilio account required.

**Architecture:** A per-agency `WASocket` (Baileys) runs persistently on the Railway backend. Auth state is stored as JSONB in a new `whatsapp_sessions` Supabase table so sessions survive server restarts without re-scanning. Incoming messages fire Baileys events that call the existing `handleInboundWhatsApp()` pipeline unchanged. Outbound sends (e-sig links, offers, contracts) route through the same session map. The Settings UI polls a status endpoint every 2 s and shows a QR image until the scan completes.

**Tech Stack:** `@whiskeysockets/baileys` (WhatsApp Web), `qrcode` (QR → PNG data URL), `pino` (Baileys logger), `@hapi/boom` (Baileys error types), Supabase JSONB (session persistence), React polling (QR UI)

> **⚠ Risk acknowledgement (read before starting):**
> Baileys is an unofficial reverse-engineered WhatsApp Web client. Meta can ban any number running it, especially under heavy outbound volume (contract dispatches, offers, e-sig links). This plan is being executed with explicit user acceptance of that ban risk. If Meta tightens enforcement, agencies may need to re-scan or rotate numbers. Monitor `[baileys] connection closed code=401` in Railway logs as the ban signal.

### Anti-ban Playbook (baked into this plan)

Five concrete measures reduce ban probability. Each maps to a specific implementation point below — do not silently drop any of them when executing.

1. **Only send to expecting recipients.** Outbound is restricted to flows where the user has already engaged: contract dispatch, e-sig link, offer reply, restitution notice. **Never** add bulk/cold-outreach sends through the Baileys path. (Already enforced by the plan's call sites — see Task 6/7.)
2. **Randomised send delay (2–5 s).** `sendMessage()` in `sessionManager.js` wraps every outbound text in a `randomDelay()` before calling `sock.sendMessage`. Implemented in Task 4.
3. **Vary content.** All template messages already interpolate dynamic data (client name, contract number, dates) so payload hashes differ per send. No hard-coded "Hello!" string repeated verbatim is ever introduced.
4. **Warm-up notice on new connections.** The Settings WhatsApp tab shows a warning banner for the first ~3 days after a successful scan, telling the agency to use the number normally (manual chats with staff/clients) before piping heavy automation through it. Implemented in Task 10 + Task 12 (i18n).
5. **Per-agency daily outbound cap.** `sessionManager.sendMessage` increments an in-memory counter per agency-per-UTC-day and throws `Daily WhatsApp send limit reached` past the cap (default 150 sends/day, env-overridable). This is a circuit breaker against a buggy loop or compromised account blasting messages. Implemented in Task 4.

---

## File Map

### Created
| File | Purpose |
|---|---|
| `server/lib/baileys/authState.js` | Supabase-backed Baileys auth state adapter |
| `server/lib/baileys/sessionManager.js` | Per-agency socket map — start/send/status/disconnect/init |
| `pages/settings/WhatsAppTab.jsx` | QR scan + connection status UI |
| `supabase/migrations/20260521_whatsapp_sessions.sql` | New `whatsapp_sessions` table |
| `server/lib/baileys/sessionManager.test.js` | Unit tests for session manager |

### Modified
| File | Change |
|---|---|
| `package.json` | Remove `twilio`, add `@whiskeysockets/baileys` + `qrcode` + `pino` |
| `server/lib/twilioClient.js` | Full rewrite — same exports, Baileys underneath |
| `server/routes/whatsapp.js` | Wire real status/connect/disconnect; add `agencyId` to 5 send calls |
| `server/routes/contracts.js` | Add `req.user.agency_id` to 2 `sendWhatsAppMessage` calls (lines 236, 372) |
| `server/routes/leads.js` | Remove Twilio webhook block (lines 394–493); update header comment |
| `server/index.js` | Import `initAllSessions`; call after `app.listen` |
| `pages/OtherPages.jsx` | Add WhatsApp tab to Settings |
| `public/locales/fr/settings.json` | Add WhatsApp i18n keys |
| `public/locales/ar/settings.json` | Add WhatsApp i18n keys (Arabic) |

---

## Task 0: Pre-flight verification (read-only)

These assumptions must hold for downstream tasks to work. Verify before editing anything.

- [ ] **Step 1: Confirm `req.user.agency_id` shape**

Read `server/middleware/auth.js`. Confirm the middleware attaches `agency_id` directly on `req.user` (not nested under `req.user.profile` or `req.user.user_metadata`). The 7 outbound send sites and 3 new routes in this plan all dereference `req.user.agency_id` — if the actual shape differs, **stop and update every call site in this plan** to match before continuing.

- [ ] **Step 2: Confirm Settings tab wiring pattern in `pages/OtherPages.jsx`**

Read `pages/OtherPages.jsx` and locate how Settings tabs are registered. Tabs may be defined as:
- an array of `{ key, label, component }` objects, OR
- a switch statement on `activeTab`, OR
- a map/object literal.

Record the exact pattern — Task 11 must follow whichever pattern exists, not the array example in this plan.

- [ ] **Step 3: Re-verify line numbers in `server/routes/leads.js`**

Read `server/routes/leads.js` and confirm:
- The Twilio webhook block still spans approximately lines 394–493 (search for `router.post('/webhook/whatsapp'`).
- The `verifyTwilioSignature` and `normalizePhoneDigits` functions are still inside that block.
- The next surviving section starts with `// ── Authenticated routes` (or similar).

If line numbers have drifted, update Task 8 with the correct line range before deleting.

- [ ] **Step 4: Locate the agency-deletion path**

Search the graph (`graphify-out/graph.json`) or read `server/routes/agency.js` (and any admin/agency-management route) to find where an agency row is deleted. Record the file + handler. Task 4b (below) adds a hook there to call `disconnectSession()` before deletion so the in-memory socket doesn't become a zombie.

No commit for Task 0 — this is reconnaissance only.

---

## Task 1: Install packages, remove Twilio

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json**

In `package.json` `"dependencies"`, remove the `"twilio"` entry and add:
```json
"@whiskeysockets/baileys": "^6.7.16",
"@hapi/boom": "^10.0.1",
"qrcode": "^1.5.4",
"pino": "^9.6.0"
```

> `@hapi/boom` is required because `sessionManager.js` does `import { Boom } from '@hapi/boom'` to type-check `lastDisconnect.error`. Baileys depends on it transitively, but we declare it explicitly so the import never silently breaks on a Baileys minor bump.

- [ ] **Step 2: Install and verify**

```bash
npm install
```

Expected: no `twilio` in `node_modules`; `@whiskeysockets/baileys` present.

```bash
ls node_modules/@whiskeysockets/baileys/package.json
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): replace twilio with baileys + qrcode + pino"
```

---

## Task 2: DB migration — `whatsapp_sessions` table

**Files:**
- Create: `supabase/migrations/20260521_whatsapp_sessions.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260521_whatsapp_sessions.sql`:

```sql
-- WhatsApp session state per agency (Baileys auth stored as JSONB).
-- auth_state holds { creds: {...}, keys: { "type:id": value } }
-- serialised with Baileys' BufferJSON replacer (Buffers → { type:'Buffer', data:[...] }).

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  agency_id     uuid        PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  auth_state    jsonb       NOT NULL DEFAULT '{}',
  phone         text,
  connected_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Only service_role may read/write — no RLS row exposure to clients.
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only"
  ON whatsapp_sessions
  USING (false);
```

- [ ] **Step 2: Apply migration**

Run in Supabase SQL editor (or via `supabase db push` if CLI is configured).

- [ ] **Step 3: Verify**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'whatsapp_sessions';
```

Expected: `agency_id`, `auth_state`, `phone`, `connected_at`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260521_whatsapp_sessions.sql
git commit -m "feat(db): add whatsapp_sessions table for Baileys auth persistence"
```

---

## Task 3: Supabase auth state adapter

**Files:**
- Create: `server/lib/baileys/authState.js`

This adapter replaces Baileys' `useMultiFileAuthState` (filesystem-based) with a Supabase JSONB store.

- [ ] **Step 1: Create `server/lib/baileys/authState.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add server/lib/baileys/authState.js
git commit -m "feat(baileys): Supabase auth state adapter"
```

---

## Task 4: Session manager

**Files:**
- Create: `server/lib/baileys/sessionManager.js`

- [ ] **Step 1: Create `server/lib/baileys/sessionManager.js`**

```js
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'
import { useSupabaseAuthState } from './authState.js'
import { handleInboundWhatsApp } from '../../routes/leads.js'
import supabaseAdmin from '../supabaseAdmin.js'

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
 *   connectedAt: string|null,    // ISO timestamp — drives the warm-up banner
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

        const senderJid = msg.key.remoteJid
        const bodyText  =
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
 * Called once at server startup — resumes all saved sessions.
 */
export async function initAllSessions() {
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
```

- [ ] **Step 2: Commit**

```bash
git add server/lib/baileys/sessionManager.js
git commit -m "feat(baileys): per-agency session manager with QR lifecycle and inbound wiring"
```

---

## Task 4b: Hook agency-delete to disconnect the live socket

**Why:** `whatsapp_sessions.agency_id` has `ON DELETE CASCADE`, so deleting an agency drops the DB row — but the in-memory Baileys socket keeps running and tries to upsert to a now-missing FK, producing quiet errors and a zombie WebSocket. We must call `disconnectSession()` *before* the agency row is deleted.

**Files:**
- Modify: the agency-deletion handler identified in Task 0 Step 4

- [ ] **Step 1: Add disconnect call to the agency-delete path**

In the file/handler located in Task 0 Step 4, import `disconnectSession`:

```js
import { disconnectSession } from '../lib/baileys/sessionManager.js'
```

Before the `supabaseAdmin.from('agencies').delete()...` call, add:

```js
// Tear down any live WhatsApp socket before the cascade nukes the session row.
// Best-effort — never block agency deletion on a Baileys cleanup failure.
try {
  await disconnectSession(agencyId)
} catch (err) {
  console.error(`[agency-delete] Baileys cleanup failed agency=${agencyId}:`, err.message)
}
```

If no admin agency-deletion endpoint exists yet in the codebase, document that as a follow-up (TODO comment in `sessionManager.js`) and skip this step — the hook can only exist where the delete actually happens.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

- [ ] **Step 3: Commit**

```bash
git add <modified-file>
git commit -m "feat(baileys): disconnect live socket before agency deletion"
```

---

## Task 5: Replace `server/lib/twilioClient.js`

Same file, same exports — Baileys underneath. No other file's import path changes.

**Files:**
- Modify: `server/lib/twilioClient.js`

- [ ] **Step 1: Overwrite `server/lib/twilioClient.js`**

```js
// WhatsApp client — replaced Twilio with Baileys.
// Export surface is identical so callers need no import changes.
import { sendMessage } from './baileys/sessionManager.js'

/**
 * Normalise any Moroccan phone format to a Baileys JID.
 * Accepts: 06XXXXXXXX · 07XXXXXXXX · +212XXXXXXXXX · 00212XXXXXXXXX · 212XXXXXXXXX
 * Returns: "212XXXXXXXXX@s.whatsapp.net"
 */
export const formatWhatsAppNumber = (phone) => {
  let p = (phone || '').replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('+'))  p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if ((p.startsWith('06') || p.startsWith('07')) && p.length === 10) {
    p = '212' + p.slice(1)
  }
  return `${p}@s.whatsapp.net`
}

/**
 * Send a WhatsApp text message via the agency's Baileys session.
 * @param {string} to        — any Moroccan phone format
 * @param {string} body      — message text
 * @param {string} agencyId  — required (identifies which session to use)
 */
export const sendWhatsAppMessage = async (to, body, agencyId) => {
  if (!agencyId) throw new Error('sendWhatsAppMessage requires agencyId')
  const jid = formatWhatsAppNumber(to)
  await sendMessage(agencyId, jid, body)
  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/lib/twilioClient.js
git commit -m "feat(baileys): replace twilioClient.js — same exports, Baileys underneath"
```

---

## Task 6: Add `agencyId` to `sendWhatsAppMessage` calls in `whatsapp.js`

All 5 existing calls pass `(to, body)` — add `req.user.agency_id` as third arg. Also wire the real status/connect/disconnect stubs.

**Files:**
- Modify: `server/routes/whatsapp.js`

- [ ] **Step 1: Update import block at the top of `whatsapp.js`**

Replace:
```js
import { sendWhatsAppMessage } from '../lib/twilioClient.js'
```
With:
```js
import { sendWhatsAppMessage } from '../lib/twilioClient.js'
import * as sessionManager from '../lib/baileys/sessionManager.js'
```

- [ ] **Step 2: Replace the three stub routes**

Replace the current stub block:
```js
router.get('/status', (req, res) => {
  res.json({ status: 'twilio', connected: true })
})

router.post('/connect', whatsappLimit, (req, res) => {
  res.json({ status: 'twilio', connected: true })
})

router.post('/disconnect', whatsappLimit, (req, res) => {
  res.json({ ok: true })
})
```

With:
```js
router.get('/status', (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  res.json(sessionManager.getStatus(agencyId))
})

router.post('/connect', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  await sessionManager.startSession(agencyId)
  res.json({ started: true })
})

router.post('/disconnect', whatsappLimit, async (req, res) => {
  const agencyId = req.user.agency_id
  if (!agencyId) return res.status(403).json({ error: 'No agency' })
  await sessionManager.disconnectSession(agencyId)
  res.json({ disconnected: true })
})
```

- [ ] **Step 3: Add `agencyId` to the 5 outbound `sendWhatsAppMessage` calls**

In `/contract` handler (line ~52):
```js
// Before:
await sendWhatsAppMessage(to, body)
// After:
await sendWhatsAppMessage(to, body, req.user.agency_id)
```

In `/invoice` handler (line ~66):
```js
await sendWhatsAppMessage(to, body, req.user.agency_id)
```

In `/payment` handler (line ~80):
```js
await sendWhatsAppMessage(to, body, req.user.agency_id)
```

In `/restitution` handler (line ~96):
```js
await sendWhatsAppMessage(to, body, req.user.agency_id)
```

In `/send-offer` handler (line ~145):
```js
// Before:
await sendWhatsAppMessage(phone, body)
// After:
await sendWhatsAppMessage(phone, body, agencyId)   // agencyId is already declared above
```

Also update the file header comment (top of file) — change "Twilio REST API" → "Baileys WhatsApp" and remove the ngrok note.

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected: no failures related to whatsapp routes.

- [ ] **Step 5: Commit**

```bash
git add server/routes/whatsapp.js
git commit -m "feat(baileys): wire whatsapp.js status/connect/disconnect + pass agencyId to sends"
```

---

## Task 7: Add `agencyId` to `sendWhatsAppMessage` calls in `contracts.js`

**Files:**
- Modify: `server/routes/contracts.js`

- [ ] **Step 1: Update call at line 236 (send-whatsapp route)**

```js
// Before:
await sendWhatsAppMessage(phone, body)
// After:
await sendWhatsAppMessage(phone, body, req.user.agency_id)
```

- [ ] **Step 2: Update call at line 372 (send-final route, whatsapp channel)**

```js
// Before:
await sendWhatsAppMessage(
  phone,
  `Bonjour ${fullName}, voici votre contrat finalisé ${contract.contract_number}. Vous trouverez le PDF en pièce jointe.`
)
// After:
await sendWhatsAppMessage(
  phone,
  `Bonjour ${fullName}, voici votre contrat finalisé ${contract.contract_number}. Vous trouverez le PDF en pièce jointe.`,
  req.user.agency_id
)
```

Also remove the comment on line ~376 that says `// Note: Twilio sandbox doesn't accept attachments easily`.

- [ ] **Step 3: Run tests**

```bash
npm run test
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/contracts.js
git commit -m "feat(baileys): pass agencyId to sendWhatsAppMessage in contracts.js"
```

---

## Task 8: Remove Twilio webhook from `leads.js`

**Files:**
- Modify: `server/routes/leads.js`

- [ ] **Step 1: Update the file header comment (lines 1–11)**

Replace:
```js
 * POST /leads/webhook/whatsapp   — Twilio inbound webhook (set in Twilio console)
```
With:
```js
 * (WhatsApp inbound is handled by Baileys sessionManager — no HTTP webhook needed)
```

Remove from the "Required env vars" block:
```
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN  (no longer needed)
```

- [ ] **Step 2: Delete the Twilio webhook block (lines 394–493)**

Delete everything from the comment `// ── POST /leads/webhook/whatsapp — Twilio inbound webhook ─` at line 394 through the closing of the `normalizePhoneDigits` function at line 492 (inclusive). The next line (`// ── Authenticated routes`) at line 495 must remain.

The deleted block contains:
- `verifyTwilioSignature` async function
- `router.post('/webhook/whatsapp', ...)` handler
- `normalizePhoneDigits` function

- [ ] **Step 3: Run tests to verify no breakage**

```bash
npm run test
```

Expected: all tests pass. `handleInboundWhatsApp` export is still present.

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.js
git commit -m "feat(baileys): remove Twilio webhook from leads.js — inbound now via Baileys events"
```

---

## Task 9: Wire `initAllSessions` in `server/index.js`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add import**

After the existing imports block (after `import reservationsRouter`), add:

```js
import { initAllSessions } from './lib/baileys/sessionManager.js'
```

- [ ] **Step 2: Call `initAllSessions` after server starts**

Find the `app.listen(PORT, () => { ... })` call at line 160. Inside its callback, after `startGmailPoller()`, add:

```js
initAllSessions().catch(err => console.error('[baileys] initAllSessions error:', err.message))
```

Result:
```js
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  startGmailPoller()
  initAllSessions().catch(err => console.error('[baileys] initAllSessions error:', err.message))
})
```

- [ ] **Step 3: Run the server locally and confirm startup log**

```bash
node server/index.js
```

Expected log line: `[baileys] resuming 0 session(s)` (0 since no sessions in DB yet).
No crash.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(baileys): call initAllSessions at server startup"
```

---

## Task 10: Settings UI — `WhatsAppTab.jsx`

**Files:**
- Create: `pages/settings/WhatsAppTab.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react'
import supabase from '../../lib/supabase.js'   // hoisted: don't dynamic-import every poll

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Poll fast while the user is mid-scan (QR refreshes every ~20s), slow once
// connected — there's nothing to surface until the user clicks disconnect.
const POLL_FAST_MS = 2000
const POLL_SLOW_MS = 30000

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function WhatsAppTab() {
  const { t } = useTranslation('settings')
  const [status, setStatus] = useState({
    connected: false, qrDataUrl: null, status: 'idle', phone: null,
    connectedAt: null, dailySendCount: 0, dailySendLimit: 150,
  })
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)

  // Anti-ban (4): show a warm-up notice for the first 3 days after a successful scan.
  const WARMUP_DAYS = 3
  const isInWarmup = status.connected && status.connectedAt && (
    (Date.now() - new Date(status.connectedAt).getTime()) < WARMUP_DAYS * 24 * 60 * 60 * 1000
  )

  // Reschedule polling when connection state flips between connected ↔ not.
  useEffect(() => {
    pollStatus()
    const interval = status.connected ? POLL_SLOW_MS : POLL_FAST_MS
    pollRef.current = setInterval(pollStatus, interval)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected])

  async function pollStatus() {
    try {
      const data = await apiFetch('/whatsapp/status')
      setStatus(data)
    } catch (_) {}
  }

  async function handleConnect() {
    setLoading(true)
    try {
      await apiFetch('/whatsapp/connect', { method: 'POST', body: JSON.stringify({}) })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    setLoading(true)
    try {
      await apiFetch('/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({}) })
      setStatus({ connected: false, qrDataUrl: null, status: 'idle', phone: null })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-title">{t('whatsapp.title')}</h3>
      <p className="settings-desc">{t('whatsapp.description')}</p>

      {status.connected ? (
        <div className="wa-connected">
          <div className="wa-badge connected">
            <Wifi size={16} />
            <span>{t('whatsapp.connected')}</span>
          </div>
          {status.phone && (
            <p className="wa-phone">+{status.phone}</p>
          )}

          {isInWarmup && (
            <div className="wa-warmup-notice" role="note">
              <strong>{t('whatsapp.warmupTitle')}</strong>
              <p>{t('whatsapp.warmupBody')}</p>
            </div>
          )}

          <p className="wa-daily-counter">
            {t('whatsapp.dailyCounter', {
              count: status.dailySendCount,
              limit: status.dailySendLimit,
            })}
          </p>

          <button
            className="btn btn-outline btn-sm"
            onClick={handleDisconnect}
            disabled={loading}
          >
            <LogOut size={14} />
            {t('whatsapp.disconnect')}
          </button>
        </div>
      ) : (
        <div className="wa-disconnected">
          <div className="wa-badge disconnected">
            <WifiOff size={16} />
            <span>{t('whatsapp.notConnected')}</span>
          </div>

          {status.qrDataUrl ? (
            <div className="wa-qr-block">
              <p className="wa-qr-hint">{t('whatsapp.scanHint')}</p>
              <img
                src={status.qrDataUrl}
                alt="WhatsApp QR code"
                className="wa-qr-image"
                width={200}
                height={200}
              />
              <p className="wa-qr-expire">{t('whatsapp.qrExpires')}</p>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={loading || status.status === 'connecting'}
            >
              {loading || status.status === 'connecting' ? (
                <RefreshCw size={14} className="spin" />
              ) : null}
              {status.status === 'connecting'
                ? t('whatsapp.connecting')
                : t('whatsapp.connect')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/settings/WhatsAppTab.jsx
git commit -m "feat(ui): WhatsApp QR connect/disconnect tab for Settings"
```

---

## Task 11: Add WhatsApp tab to Settings

**Files:**
- Modify: `pages/OtherPages.jsx`

- [ ] **Step 1: Import WhatsAppTab**

Find the settings import block (where `PrivacyTab` is imported). Add:

```js
import WhatsAppTab from './settings/WhatsAppTab.jsx'
```

- [ ] **Step 2: Add tab to the tabs array**

Find the Settings tabs array (contains entries like `{ key: 'agence', label: t('settings:tabs.agence'), ... }`). Add a new entry:

```js
{ key: 'whatsapp', label: t('settings:tabs.whatsapp'), component: <WhatsAppTab /> }
```

- [ ] **Step 3: Run the dev server and check Settings renders the tab**

```bash
npm run dev
```

Navigate to Settings → confirm a "WhatsApp" tab appears and the connect button renders.

- [ ] **Step 4: Commit**

```bash
git add pages/OtherPages.jsx
git commit -m "feat(ui): add WhatsApp tab to Settings"
```

---

## Task 12: i18n keys

**Files:**
- Modify: `public/locales/fr/settings.json`
- Modify: `public/locales/ar/settings.json`

- [ ] **Step 1: Add French keys to `public/locales/fr/settings.json`**

Add inside the root object:

```json
"tabs": {
  "whatsapp": "WhatsApp"
},
"whatsapp": {
  "title": "Connexion WhatsApp",
  "description": "Connectez votre numéro WhatsApp Business pour recevoir les demandes directement dans l'application.",
  "connected": "Connecté",
  "notConnected": "Non connecté",
  "connect": "Connecter WhatsApp",
  "connecting": "Connexion en cours…",
  "disconnect": "Déconnecter",
  "scanHint": "Scannez ce QR code avec votre application WhatsApp Business.",
  "qrExpires": "Le QR code expire après 20 secondes — actualisez si expiré.",
  "warmupTitle": "Période de rodage (3 premiers jours)",
  "warmupBody": "Pour éviter le blocage par WhatsApp, utilisez ce numéro normalement pendant les premiers jours : échangez avec vos collègues, vos clients réguliers, vos proches. Évitez les envois automatisés en masse tant que le compte n'est pas « réchauffé ».",
  "dailyCounter": "Envois aujourd'hui : {{count}} / {{limit}}"
}
```

(If a `tabs` key already exists, add the `whatsapp` entry to it rather than creating a duplicate.)

- [ ] **Step 2: Add Arabic keys to `public/locales/ar/settings.json`**

```json
"tabs": {
  "whatsapp": "واتساب"
},
"whatsapp": {
  "title": "ربط واتساب",
  "description": "ربط رقم واتساب للأعمال لاستقبال الطلبات مباشرة في التطبيق.",
  "connected": "متصل",
  "notConnected": "غير متصل",
  "connect": "ربط واتساب",
  "connecting": "جارٍ الاتصال…",
  "disconnect": "قطع الاتصال",
  "scanHint": "امسح رمز QR باستخدام تطبيق واتساب للأعمال.",
  "qrExpires": "ينتهي رمز QR بعد 20 ثانية — قم بالتحديث إذا انتهت صلاحيته.",
  "warmupTitle": "فترة الإحماء (أول 3 أيام)",
  "warmupBody": "لتجنّب الحظر من واتساب، استخدم هذا الرقم بشكل طبيعي خلال الأيام الأولى: تواصل مع زملائك وعملائك المعتادين وأقاربك. تجنّب الإرسال الآلي المكثّف قبل أن يصبح الحساب «مُحمَّى».",
  "dailyCounter": "الإرسال اليوم: {{count}} / {{limit}}"
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/fr/settings.json public/locales/ar/settings.json
git commit -m "feat(i18n): add WhatsApp tab keys in FR and AR"
```

---

## Task 13: Tests

**Files:**
- Create: `server/lib/baileys/sessionManager.test.js`

- [ ] **Step 1: Write unit tests**

Create `server/lib/baileys/sessionManager.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('../../lib/supabaseAdmin.js', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(),
    })),
  },
}))

// Mock Baileys — sessionManager imports `makeWASocket` as the default export
// AND named exports (DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage).
// Both surfaces must be provided. `BufferJSON`, `initAuthCreds`, `proto` are
// only used by authState.js (which is itself mocked below), so they're omitted.
const mockSock = {
  ev: { on: vi.fn() },
  user: { id: '212600000001:1@s.whatsapp.net' },
  sendMessage: vi.fn().mockResolvedValue({}),
  logout: vi.fn().mockResolvedValue({}),
  end: vi.fn(),
  updateMediaMessage: vi.fn(),
}
const makeWASocketMock = vi.fn(() => mockSock)
vi.mock('@whiskeysockets/baileys', () => ({
  default: makeWASocketMock,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3, 0] }),
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('img')),
}))

vi.mock('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    constructor(msg, opts) { super(msg); this.output = { statusCode: opts?.statusCode || 500 } }
  },
}))

vi.mock('./authState.js', () => ({
  useSupabaseAuthState: vi.fn().mockResolvedValue({
    state:     { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
}))

vi.mock('../../routes/leads.js', () => ({
  handleInboundWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,abc') },
}))

vi.mock('pino', () => ({ default: vi.fn(() => ({ level: 'silent', child: vi.fn() })) }))

describe('sessionManager', () => {
  let sessionManager

  beforeEach(async () => {
    vi.resetModules()
    makeWASocketMock.mockClear()
    sessionManager = await import('./sessionManager.js')
  })

  it('getStatus returns idle for unknown agency', () => {
    const result = sessionManager.getStatus('unknown-agency')
    expect(result).toEqual({ connected: false, qrDataUrl: null, status: 'idle', phone: null })
  })

  it('startSession is idempotent — second call while connecting is a no-op', async () => {
    await sessionManager.startSession('agency-1')
    await sessionManager.startSession('agency-1') // second call
    // makeWASocket called only once
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })

  it('sendMessage throws when no active session', async () => {
    await expect(
      sessionManager.sendMessage('no-session-agency', '212600000001@s.whatsapp.net', 'hello')
    ).rejects.toThrow('No active WhatsApp session')
  })

  it('initAllSessions starts sessions for all DB rows', async () => {
    const supabaseAdmin = (await import('../../lib/supabaseAdmin.js')).default
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data:  [{ agency_id: 'a1' }, { agency_id: 'a2' }],
        error: null,
      }),
    })
    await sessionManager.initAllSessions()
    expect(makeWASocketMock).toHaveBeenCalledTimes(2)
  })

  it('parsePhoneFromJid handles device-suffixed and bad JIDs', () => {
    const { parsePhoneFromJid } = sessionManager
    expect(parsePhoneFromJid('212600000001:42@s.whatsapp.net')).toBe('212600000001')
    expect(parsePhoneFromJid('212600000001@s.whatsapp.net')).toBe('212600000001')
    expect(parsePhoneFromJid('abc@lid')).toBe(null)              // @lid (not a phone)
    expect(parsePhoneFromJid(null)).toBe(null)
    expect(parsePhoneFromJid('')).toBe(null)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm run test -- server/lib/baileys/sessionManager.test.js
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/lib/baileys/sessionManager.test.js
git commit -m "test(baileys): unit tests for sessionManager"
```

---

## Task 14: Clean up env vars

**Files:**
- `.claude/STATUS.md` (or Railway dashboard — out of band)

- [ ] **Step 1: Remove Twilio env vars from Railway**

In Railway dashboard, delete:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`

These are no longer referenced anywhere in the codebase.

- [ ] **Step 2: Final regression check (graph-first, per CLAUDE.md)**

CLAUDE.md forbids global `grep`/`find`/`rg` searches. Verify Twilio removal by
inspecting the exact files this migration touched, since only those can still
hold Twilio references:

1. Open `graphify-out/graph.json` (or `GRAPH_REPORT.md`) and confirm no node
   labelled `twilio`, `twilioClient`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   or `TWILIO_WHATSAPP_NUMBER` remains in the dependency graph.
2. Re-read the 4 files modified by this plan and confirm no `twilio`/`TWILIO`
   string survives in any non-comment, non-test line:
   - `server/lib/twilioClient.js` (file body only — the filename itself stays
     for import-stability; see file header comment)
   - `server/routes/whatsapp.js`
   - `server/routes/contracts.js`
   - `server/routes/leads.js`
3. Re-read `server/index.js` and confirm there is no Twilio import line.

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: remove TWILIO env var references from docs and comments"
```

---

## Regression Risk Map

| Feature | Before | After | Risk |
|---|---|---|---|
| E-sig link WhatsApp dispatch | Twilio REST call | Baileys send via agency session | Low — same call signature, agency must be connected |
| Contract/invoice/offer WA sends | Twilio REST call | Baileys send | Low — same |
| Inbound message → Alerte pipeline | Twilio webhook POST | Baileys `messages.upsert` event | None — `handleInboundWhatsApp` unchanged |
| Media (image) inbound | Twilio CDN download with basic auth | Baileys `downloadMediaMessage` | None — result is same Buffer |
| Session persistence across restarts | Stateless (Twilio is external) | Baileys auth state in Supabase | Low — `initAllSessions` handles restores |
| Agency without session sending WA | Would throw if no Twilio creds | Throws `No active WhatsApp session` | Same error path, handled in try/catch |

## Post-Launch Notes

- A new agency will see "Not connected" in Settings until they scan the QR.
- If a send is attempted before connecting (e.g. send-whatsapp button), the backend returns 502 — existing frontend retry message handles this correctly.
- QR codes expire after ~20 s — the 2 s polling will surface the refreshed QR automatically.
- Baileys number ban risk: rare for inbound-heavy business use. Monitor via Railway logs for `[baileys] connection closed` with code 401 (logged out = banned).

### Anti-ban operational notes

- **Daily cap env var:** `BAILEYS_DAILY_SEND_LIMIT` (default `150`). Raise per-agency only after the warm-up period and only if the agency has a clean ban-free record. Hitting the cap throws `Daily WhatsApp send limit reached` to the caller — this is a *circuit breaker*, not a soft warning.
- **Random send delay:** every `sendMessage` sleeps 2–5 s before hitting Baileys. Visible side-effect — a button click that previously felt instant now takes a couple of seconds. Document this in user-facing release notes so agencies don't think the app is slow.
- **Warm-up window:** the Settings banner shows for 3 days after the *first* successful scan (not after every Railway restart, since `connected_at` is preserved). After day 3 the banner disappears automatically.
- **Audit trail:** every send is logged with `agencyId`, `dailyCount`, and outcome. Watch for any agency hitting > 100 sends/day repeatedly — that's a candidate for a "you should be on official WhatsApp Business API" conversation.
- **What still triggers bans even with these measures:**
  - Users clicking "Report Spam" or "Block" on your messages (anti-ban measure #1 — *only* send to expecting recipients; never reuse Baileys for marketing/cold outreach).
  - Sending the same exact body to many recipients in a row (anti-ban measure #3 — all templates already interpolate dynamic data; if a new template is added later, ensure it does too).
  - Brand-new numbers blasting on day 1 (anti-ban measure #4 — warm-up banner addresses this; do not remove it).
