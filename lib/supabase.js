import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing env vars — falling back to localStorage only')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Returns true only when Supabase is configured AND auth is explicitly enabled */
export const isSupabaseEnabled = () =>
  !!(supabaseUrl && supabaseAnonKey && import.meta.env.VITE_USE_AUTH === 'true')
