/**
 * Gmail IMAP Poller
 *
 * POST /gmail/poll        — Manually trigger a poll for an agency (authenticated + premium)
 * POST /gmail/credentials — Save/update Gmail credentials for the agency (encrypted AES-256)
 * GET  /gmail/status      — Return integration status (connected / last poll time)
 *
 * The poller runs on a timer (startGmailPoller) when the server boots.
 * It calls POST /leads/webhook/gmail internally for each new message.
 *
 * Required env vars:
 *   ENCRYPTION_KEY  — 32-byte hex (openssl rand -hex 32)
 *
 * Required npm package:
 *   imap-simple  (^5.1.0)
 *   mailparser   (^3.7.0)
 */

import { Router } from 'express'
import { createRequire } from 'module'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'
import { encrypt, decrypt } from './leads.js'

const require = createRequire(import.meta.url)

const router = Router()

// Track last-seen UIDs per agency to avoid reprocessing
const lastSeenUid = new Map()

// ── Poll Gmail for a single agency ────────────────────────
async function pollAgency(agency) {
  if (!agency.gmail_address || !agency.gmail_app_password) return

  let imapSimple, simpleParser
  try {
    imapSimple    = require('imap-simple')
    simpleParser  = require('mailparser').simpleParser
  } catch {
    console.warn('[gmail] imap-simple or mailparser not installed — skipping poll')
    return
  }

  const password = decrypt(agency.gmail_app_password)

  const config = {
    imap: {
      user:     agency.gmail_address,
      password,
      host:     'imap.gmail.com',
      port:     993,
      tls:      true,
      tlsOptions: { servername: 'imap.gmail.com' },
      authTimeout: 10000,
    },
  }

  let connection
  try {
    connection = await imapSimple.connect(config)
    await connection.openBox('INBOX')

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24h
    const results = await connection.search(
      ['UNSEEN', ['SINCE', since.toDateString()]],
      { bodies: ['HEADER', 'TEXT', ''], markSeen: false }
    )

    const minUid = lastSeenUid.get(agency.id) || 0
    let maxUid = minUid

    for (const item of results) {
      const uid = item.attributes.uid
      if (uid <= minUid) continue
      if (uid > maxUid) maxUid = uid

      const all    = item.parts.find(p => p.which === '')
      if (!all) continue

      const parsed = await simpleParser(all.body)
      const from   = parsed.from?.value?.[0]?.address || ''
      const subject = parsed.subject || ''
      const bodyText = parsed.text || parsed.html || ''

      // Collect image attachments (base64)
      const attachments = []
      for (const att of (parsed.attachments || [])) {
        if (att.contentType?.startsWith('image/') && att.content) {
          attachments.push({
            filename: att.filename || 'attachment',
            mimeType: att.contentType,
            base64:   att.content.toString('base64'),
          })
        }
      }

      if (!from) continue

      // Forward to leads webhook internally
      try {
        await fetch(
          `http://localhost:${process.env.PORT || 3001}/leads/webhook/gmail`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ agencyId: agency.id, senderEmail: from, subject, bodyText, attachments }),
          }
        )
      } catch (err) {
        console.error('[gmail] internal webhook error:', err.message)
      }
    }

    if (maxUid > minUid) lastSeenUid.set(agency.id, maxUid)

    // Update last_poll_at (best-effort — column may not exist in older schemas)
    await supabaseAdmin
      .from('agencies')
      .update({ gmail_last_polled: new Date().toISOString() })
      .eq('id', agency.id)
      .then(({ error }) => { if (error) console.warn('[gmail] gmail_last_polled update skipped:', error.message) })

    console.log(`[gmail] Polled ${agency.gmail_address} — ${results.length} messages, ${results.filter(i => i.attributes.uid > minUid).length} new`)
  } catch (err) {
    console.error(`[gmail] Poll error for ${agency.gmail_address}:`, err.message)
  } finally {
    connection?.end()
  }
}

// ── Background poller — runs every 5 minutes ─────────────
export function startGmailPoller() {
  const POLL_INTERVAL = 5 * 60 * 1000

  async function pollAll() {
    try {
      const { data: agencies } = await supabaseAdmin
        .from('agencies')
        .select('id, gmail_address, gmail_app_password')
        .eq('plan', 'premium')
        .not('gmail_address', 'is', null)
        .not('gmail_app_password', 'is', null)

      if (!agencies?.length) return

      for (const agency of agencies) {
        await pollAgency(agency)
      }
    } catch (err) {
      console.error('[gmail] pollAll error:', err.message)
    }
  }

  // First poll 30s after startup, then every 5 min
  setTimeout(() => {
    pollAll()
    setInterval(pollAll, POLL_INTERVAL)
  }, 30_000)

  console.log('[gmail] Background poller scheduled (every 5 min)')
}

// ── Authenticated routes ──────────────────────────────────
router.use(requireAuth, requirePremium)

// POST /gmail/credentials — save encrypted Gmail credentials
router.post('/credentials', async (req, res) => {
  const { gmail_address, gmail_app_password } = req.body

  if (!gmail_address || !gmail_app_password) {
    return res.status(400).json({ error: 'gmail_address and gmail_app_password required' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail_address)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const encrypted = encrypt(gmail_app_password)

  const { error } = await supabaseAdmin
    .from('agencies')
    .update({ gmail_address, gmail_app_password: encrypted })
    .eq('id', req.user.agency_id)

  if (error) return res.status(500).json({ error: error.message })

  console.log(`[gmail] Credentials saved for agency ${req.user.agency_id}`)
  res.json({ ok: true, message: 'Gmail credentials saved and encrypted.' })
})

// DELETE /gmail/credentials — remove Gmail integration
router.delete('/credentials', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('agencies')
    .update({ gmail_address: null, gmail_app_password: null })
    .eq('id', req.user.agency_id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// GET /gmail/status — connection status
router.get('/status', async (req, res) => {
  // Select gmail_address first; gmail_last_polled may not exist in older DB schemas
  const { data: agency, error } = await supabaseAdmin
    .from('agencies')
    .select('gmail_address, gmail_last_polled')
    .eq('id', req.user.agency_id)
    .maybeSingle()

  // Column-missing errors (PGRST116 / 42703) — return safe defaults instead of 500
  if (error) {
    if (error.code === '42703' || error.message?.includes('gmail_last_polled')) {
      // Column doesn't exist yet — fall back to address-only query
      const { data: a2, error: e2 } = await supabaseAdmin
        .from('agencies')
        .select('gmail_address')
        .eq('id', req.user.agency_id)
        .maybeSingle()
      if (e2) return res.status(500).json({ error: e2.message })
      return res.json({ connected: !!a2?.gmail_address, gmail_address: a2?.gmail_address || null, last_polled: null })
    }
    return res.status(500).json({ error: error.message })
  }

  res.json({
    connected: !!agency?.gmail_address,
    gmail_address: agency?.gmail_address || null,
    last_polled: agency?.gmail_last_polled || null,
  })
})

// POST /gmail/poll — manual trigger
router.post('/poll', async (req, res) => {
  const { data: agency, error } = await supabaseAdmin
    .from('agencies')
    .select('id, gmail_address, gmail_app_password')
    .eq('id', req.user.agency_id)
    .maybeSingle()

  if (error || !agency) return res.status(500).json({ error: 'Agency not found' })
  if (!agency.gmail_address) return res.status(400).json({ error: 'Gmail not configured' })

  // Run in background, respond immediately
  pollAgency(agency).catch(err => console.error('[gmail/poll] error:', err.message))
  res.json({ ok: true, message: 'Poll triggered' })
})

export default router
