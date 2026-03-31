import { createClient } from '@supabase/supabase-js'
import supabaseAdmin from '../lib/supabaseAdmin.js'

// Verify the JWT the frontend sends in Authorization: Bearer <token>
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

export async function requireAuth(req, res, next) {
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
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, agency_id')
    .eq('id', user.id)
    .maybeSingle()

  req.user = { ...user, role: profile?.role, agency_id: profile?.agency_id }
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
