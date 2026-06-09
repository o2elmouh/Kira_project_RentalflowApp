-- ─────────────────────────────────────────────────────────────
-- Migration 011 — Booking Hub: Omnichannel Reservations
-- Centralizes confirmed bookings from EMAIL/WHATSAPP/WEBSITE/IN_PERSON
-- ─────────────────────────────────────────────────────────────

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE booking_source AS ENUM ('EMAIL', 'WHATSAPP', 'WEBSITE', 'IN_PERSON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Required extension for fuzzy customer_name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Customer (FK + denormalized for fast list reads, no JOINs needed for table view)
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  customer_name     text NOT NULL,
  customer_contact  text NOT NULL,                          -- email or phone

  -- Vehicle (FK + denormalized)
  vehicle_id        uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  car_model         text NOT NULL,                          -- e.g. "Renault Clio 2024"

  -- Period (UTC; convert to local in UI)
  start_date        timestamptz NOT NULL,
  end_date          timestamptz NOT NULL,

  -- Pricing
  total_price       numeric(10, 2) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'MAD',

  -- Channel + status
  source_channel    booking_source NOT NULL,
  status            reservation_status NOT NULL DEFAULT 'PENDING',

  -- Channel-specific raw context (email subject, WhatsApp number, lead_id, etc.)
  source_metadata   jsonb NOT NULL DEFAULT '{}',

  -- Optional links to upstream (lead) and downstream (contract) records
  lead_id           uuid REFERENCES pending_demands(id) ON DELETE SET NULL,
  contract_id       uuid REFERENCES contracts(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,

  CHECK (end_date > start_date),
  CHECK (total_price >= 0)
);

-- 4. Auto-update updated_at trigger (reuses existing set_updated_at function from migration 006)
DROP TRIGGER IF EXISTS reservations_updated_at ON reservations;
CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Indexes for filter/sort/search performance
CREATE INDEX IF NOT EXISTS reservations_agency_status_idx
  ON reservations (agency_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS reservations_agency_source_idx
  ON reservations (agency_id, source_channel, created_at DESC);

CREATE INDEX IF NOT EXISTS reservations_agency_dates_idx
  ON reservations (agency_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS reservations_customer_name_trgm
  ON reservations USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS reservations_client_id_idx
  ON reservations (client_id);

CREATE INDEX IF NOT EXISTS reservations_vehicle_id_idx
  ON reservations (vehicle_id);

-- 6. RLS — agency isolation
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_isolation_select" ON reservations;
CREATE POLICY "agency_isolation_select" ON reservations
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_insert" ON reservations;
CREATE POLICY "agency_isolation_insert" ON reservations
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_update" ON reservations;
CREATE POLICY "agency_isolation_update" ON reservations
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_delete" ON reservations;
CREATE POLICY "agency_isolation_delete" ON reservations
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- 7. Comments for documentation
COMMENT ON TABLE reservations IS 'Omnichannel bookings — sits between pending_demands (Basket) and contracts (e-signature). Source-channel-aware.';
COMMENT ON COLUMN reservations.source_metadata IS 'Channel-specific raw payload: { email_subject?, whatsapp_number?, website_session_id?, walk_in_notes? }';
COMMENT ON COLUMN reservations.source_channel IS 'EMAIL = inbound webhook; WHATSAPP = lead from WA; WEBSITE = direct from public site; IN_PERSON = walk-in';
