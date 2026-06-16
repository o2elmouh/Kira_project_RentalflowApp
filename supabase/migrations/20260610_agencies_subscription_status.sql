-- Manual-activation gating: new agencies start 'pending' and are flipped to
-- 'active' by the operator in the Supabase table editor. Existing agencies
-- are backfilled to 'active' so nobody currently onboarded gets locked out.
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending'
  CHECK (subscription_status IN ('pending', 'active', 'blocked'));

UPDATE agencies SET subscription_status = 'active';
