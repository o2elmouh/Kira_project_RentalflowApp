import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { join } from 'path'
import { mkdirSync } from 'fs'

import healthRouter from './routes/health.js'
import agencyRouter from './routes/agency.js'
import contractsRouter from './routes/contracts.js'
import emailRouter from './routes/email.js'
import teamRouter from './routes/team.js'
import whatsappRouter from './routes/whatsapp.js'
import aiRouter from './routes/ai.js'
import telemetryRouter from './routes/telemetry.js'
import ocrRouter from './routes/ocr.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://kira-project-rentalflow-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) or if origin is in allowed list
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS not allowed: ${origin}`), false)
    }
  },
  credentials: true,
}))

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '20mb' }))

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
app.use('/contracts', contractsRouter)
app.use('/email', emailRouter)
app.use('/team', teamRouter)
app.use('/whatsapp', whatsappRouter)
app.use('/ai', aiRouter)
app.use('/telemetry', telemetryRouter)
app.use('/ocr', ocrRouter)

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[API Error]', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`✅ RentaFlow API running on port ${PORT}`)
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})
