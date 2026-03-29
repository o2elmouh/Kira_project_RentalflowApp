import { createClient } from '@supabase/supabase-js'

// Uses the service_role key — NEVER expose this in the frontend
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export default supabaseAdmin
