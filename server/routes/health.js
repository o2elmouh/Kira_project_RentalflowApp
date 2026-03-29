import { Router } from 'express'
import supabaseAdmin from '../lib/supabaseAdmin.js'

const router = Router()

// GET /health — Railway uses this for health checks
router.get('/', async (req, res) => {
  let dbOk = false
  try {
    const { error } = await supabaseAdmin.from('agencies').select('id').limit(1)
    dbOk = !error
  } catch {}

  const status = dbOk ? 200 : 503
  res.status(status).json({
    status: dbOk ? 'ok' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      api: 'ok',
      database: dbOk ? 'ok' : 'unreachable',
    },
  })
})

export default router
