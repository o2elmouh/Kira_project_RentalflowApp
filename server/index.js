import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { join } from 'path'
import { mkdirSync } from 'fs'

import healthRouter from './routes/health.js'
import agencyRouter from './routes/agency.js'
import contractsRouter, { publicContractsRouter } from './routes/contracts.js'
import emailRouter from './routes/email.js'
import teamRouter from './routes/team.js'
import whatsappRouter from './routes/whatsapp.js'
import aiRouter from './routes/ai.js'
// import telemetryRouter from './routes/telemetry.js' // disabled for v2
import ocrRouter from './routes/ocr.js'
import leadsRouter from './routes/leads.js'
import gmailRouter, { startGmailPoller } from './routes/gmail.js'
import networkRouter from './routes/network.js'
import adminRouter from './routes/admin.js'
import clientsRouter from './routes/clients.js'
import reservationsRouter from './routes/reservations.js'
import { initAllSessions, reapOrphanedSessions } from './lib/baileys/sessionManager.js'
import cron from 'node-cron'
import { cleanupPendingDemands } from './scripts/cleanupPendingDemands.js'
import { purgeSignedPdfs } from './scripts/purgeSignedPdfs.js'
import { enforceRetention } from './scripts/enforceRetention.js'

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

// ── Security headers ─────────────────────────────────────
// Sets X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
// X-XSS-Protection, and other security headers automatically.
app.use(helmet({
  contentSecurityPolicy: false, // CSP can break frontend fetches; enable when ready
  crossOriginEmbedderPolicy: false, // needed for cross-origin images (photos)
}))

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean)

// Optional: allowlist of Vercel preview hosts owned by this project.
// Set VERCEL_PREVIEW_PREFIX to e.g. "rentaflow" so only
// https://rentaflow-*.vercel.app preview URLs are accepted instead of
// every *.vercel.app on the internet.
const VERCEL_PREFIX = process.env.VERCEL_PREVIEW_PREFIX || ''
const vercelHostRe = VERCEL_PREFIX
  ? new RegExp(`^https://${VERCEL_PREFIX}[A-Za-z0-9._-]*\\.vercel\\.app$`)
  : null

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, mobile, curl)
    if (!origin) return cb(null, true)
    // Always allow explicitly configured origins
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    // Allow Vercel preview deployments only when a project-specific prefix
    // is configured (otherwise an attacker could deploy any *.vercel.app
    // and bypass CORS with credentials).
    if (vercelHostRe && vercelHostRe.test(origin)) return cb(null, true)
    // In development, also allow localhost on any port
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return cb(null, true)
    }
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// ── Body parsing ──────────────────────────────────────────
// 15 MB is enough for our largest legitimate payload (base64-encoded PDFs in
// the signing flow are capped at ~15 MB in contractSigning.js). The previous
// 50 MB ceiling allowed cheap DoS via oversized JSON.
app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: false, limit: '256kb' }))

// ── Global rate limit ─────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please retry later.' },
}))

// ── Temp PDF static hosting (for WhatsApp MediaUrl) ───────
const TEMP_DIR = join(process.cwd(), 'tmp_pdfs')
try { mkdirSync(TEMP_DIR, { recursive: true }) } catch { }
app.use('/tmp_pdfs', express.static(TEMP_DIR))

// ── Routes ────────────────────────────────────────────────
app.use('/health', healthRouter)
app.use('/agency', agencyRouter)
// Public token-only signing endpoints MUST be mounted before the auth-gated
// /contracts router so requireAuth doesn't reject the unauthenticated client.
app.use('/contracts', publicContractsRouter)
app.use('/contracts', contractsRouter)
app.use('/email', emailRouter)
app.use('/team', teamRouter)
app.use('/whatsapp', whatsappRouter)
app.use('/ai', aiRouter)
// app.use('/telemetry', telemetryRouter) // disabled for v2
app.use('/ocr', ocrRouter)
app.use('/leads', leadsRouter)
app.use('/gmail', gmailRouter)
app.use('/reservations', reservationsRouter)
app.use('/network', networkRouter)
app.use('/admin', adminRouter)
app.use('/clients', clientsRouter)

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// ── Global error handler ──────────────────────────────────
// SECURITY: Never leak stack traces, file paths, or internal details to clients.
app.use((err, req, res, _next) => {
  console.error('[API Error]', err.message)

  const status = err.status || 500
  // Only forward the error message for expected client errors (4xx).
  // For 5xx, always return a generic message to avoid leaking internals.
  const safeMessage = status < 500
    ? (err.message || 'Bad request')
    : 'Internal server error'

  res.status(status).json({ error: safeMessage })
})

startGmailPoller()

// Daily at 03:00 UTC — Law 09-08 Phase 2 pending demands cleanup
cron.schedule('0 3 * * *', () => {
  cleanupPendingDemands()
    .then(({ anonymized }) => console.log(`[cron] cleanup:pending — ${anonymized} anonymized`))
    .catch(err => console.error('[cron] cleanup:pending failed:', err))
})

// Daily at 04:00 UTC — purge signed contract PDFs older than 30 days
cron.schedule('0 4 * * *', () => {
  purgeSignedPdfs()
    .then(({ purged }) => console.log(`[cron] purge:signed-pdfs — ${purged} removed`))
    .catch(err => console.error('[cron] purge:signed-pdfs failed:', err))
})

// Monthly on the 1st at 04:30 UTC — Law 09-08 Phase 4 retention enforcement
cron.schedule('30 4 1 * *', () => {
  enforceRetention()
    .then(({ anonymized }) => console.log(`[cron] enforce:retention — ${anonymized} anonymized`))
    .catch(err => console.error('[cron] enforce:retention failed:', err))
})

// Every 30 minutes — disconnect Baileys sessions whose agency was deleted
// out-of-band (Supabase dashboard, manual SQL). No backend endpoint deletes
// agencies, so this is the only reliable cleanup path.
cron.schedule('*/30 * * * *', () => {
  reapOrphanedSessions()
    .catch(err => console.error('[cron] baileys:reaper failed:', err.message))
})

app.listen(PORT, () => {
  console.log(`✅ RentaFlow API running on port ${PORT}`)
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
  initAllSessions().catch(err => console.error('[baileys] initAllSessions error:', err.message))
})
