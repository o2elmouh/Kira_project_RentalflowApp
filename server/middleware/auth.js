import { createClient } from '@supabase/supabase-js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

// Verify the JWT the frontend sends in Authorization: Bearer <token>
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

export async function requireAuth(req, res, next) {
  // SECURITY: Never bypass auth in production. In local dev without Supabase
  // configured, allow unauthenticated access only if ALLOW_DEV_BYPASS=true
  // is explicitly set AND NODE_ENV is not production.
  const allowDevBypass = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BYPASS === 'true'

  if (!supabase) {
    if (allowDevBypass) {
      req.user = { id: 'dev-user', role: 'admin', agency_id: null }
      return next()
    }
    return res.status(503).json({ error: 'Auth service not configured' })
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }
  const token = header.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Attach profile (role + agency_id) for downstream middleware
  let profile = null
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('role, agency_id')
      .eq('id', user.id)
      .maybeSingle()
    profile = data
  }

  req.user = { ...user, role: profile?.role ?? 'staff', agency_id: profile?.agency_id }
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

/** Factory: allow any of the listed roles. Usage: requireRole(['admin', 'staff']) */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access requires one of: ${allowedRoles.join(', ')}` })
    }
    next()
  }
}
