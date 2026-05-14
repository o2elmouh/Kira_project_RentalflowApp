import 'dotenv/config'
import express from 'express'
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
import cron from 'node-cron'
import { cleanupPendingDemands } from './scripts/cleanupPendingDemands.js'
import { purgeSignedPdfs } from './scripts/purgeSignedPdfs.js'
import { enforceRetention } from './scripts/enforceRetention.js'

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean)

app.use(cors({
  origin: true,   // reflect request origin — allows all origins including Vercel previews
  credentials: true,
}))

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: false })) // for Twilio webhooks (form-encoded)

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
app.use((err, req, res, _next) => {
  console.error('[API Error]', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
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

app.listen(PORT, () => {
  console.log(`✅ RentaFlow API running on port ${PORT}`)
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})
