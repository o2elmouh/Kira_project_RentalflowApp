import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import healthRouter    from './routes/health.js'
import agencyRouter    from './routes/agency.js'
import contractsRouter from './routes/contracts.js'
import emailRouter     from './routes/email.js'
import teamRouter      from './routes/team.js'
import whatsappRouter  from './routes/whatsapp.js'
import aiRouter        from './routes/ai.js'

const app  = express()
const PORT = process.env.PORT || 3001

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,         // https://rentaflow.vercel.app
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // allow curl / Postman (no origin) + listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
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

// ── Routes ────────────────────────────────────────────────
app.use('/health',    healthRouter)
app.use('/agency',    agencyRouter)
app.use('/contracts', contractsRouter)
app.use('/email',     emailRouter)
app.use('/team',      teamRouter)
app.use('/whatsapp',  whatsappRouter)
app.use('/ai',        aiRouter)

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
