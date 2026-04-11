-- ─────────────────────────────────────────────────────────────
-- Migration 006 — Premium Basket of Cases
-- Adds: plan field on agencies, pending_demands table,
--       encrypted integration credentials on agencies
-- ─────────────────────────────────────────────────────────────

-- 1. Plan tier on agencies
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'premium'));

-- 2. Integration credentials (AES-256 encrypted blobs)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS whatsapp_number     text,
  ADD COLUMN IF NOT EXISTS gmail_address       text,
  ADD COLUMN IF NOT EXISTS gmail_app_password  text;  -- stored AES-256 encrypted

-- 3. pending_demands — inbound leads from WhatsApp / Gmail
CREATE TABLE IF NOT EXISTS pending_demands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('whatsapp', 'gmail')),
  sender_id       text NOT NULL,          -- phone number or email address
  raw_payload     jsonb NOT NULL DEFAULT '{}',
  extracted_data  jsonb,                  -- AI-extracted identity + rental intent
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processed', 'ignored')),
  media_urls      text[] NOT NULL DEFAULT '{}',
  merged_with_id  uuid REFERENCES pending_demands(id) ON DELETE SET NULL,
  confidence_scores jsonb,               -- per-field confidence { firstName: 0.95, ... }
  match_score     float,                 -- fuzzy name match score if merged
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pending_demands_updated_at ON pending_demands;
CREATE TRIGGER pending_demands_updated_at
  BEFORE UPDATE ON pending_demands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. RLS — agency isolation
ALTER TABLE pending_demands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_isolation" ON pending_demands;
CREATE POLICY "agency_isolation" ON pending_demands
  USING (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 5. Index for fast status queries
CREATE INDEX IF NOT EXISTS pending_demands_agency_status
  ON pending_demands (agency_id, status, created_at DESC);
