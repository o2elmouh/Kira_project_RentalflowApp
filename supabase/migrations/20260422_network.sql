-- ============================================================
-- RentalFlow Network — Cross-Agency Resource Sharing
-- Migration: 20260422_network.sql
-- ============================================================

-- ── 1. Enum for request lifecycle ────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.network_request_status AS ENUM (
    'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Extend vehicles ────────────────────────────────────────
-- Only the owning agency's admin may flip is_network_visible via the API.
-- network_daily_price is the inter-agency price (can differ from daily_rate).
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_network_visible  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS network_daily_price numeric(10,2);

-- ── 3. Cross-agency requests table ───────────────────────────
CREATE TABLE IF NOT EXISTS public.cross_agency_requests (
  id                    uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  requesting_agency_id  uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  owning_agency_id      uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  vehicle_id            uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  status                public.network_request_status NOT NULL DEFAULT 'PENDING',
  start_date            date        NOT NULL,
  end_date              date        NOT NULL,
  agreed_price          numeric(10,2),
  -- No end-customer PII stored here — this is strictly B2B
  requester_notes       text,
  owner_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT car_different_agency CHECK (requesting_agency_id <> owning_agency_id),
  CONSTRAINT valid_date_range      CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_car_requests_vehicle    ON public.cross_agency_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_car_requests_requesting ON public.cross_agency_requests(requesting_agency_id);
CREATE INDEX IF NOT EXISTS idx_car_requests_owning     ON public.cross_agency_requests(owning_agency_id);
CREATE INDEX IF NOT EXISTS idx_car_requests_status     ON public.cross_agency_requests(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_car_requests_updated_at ON public.cross_agency_requests;
CREATE TRIGGER trg_car_requests_updated_at
  BEFORE UPDATE ON public.cross_agency_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Row-Level Security ─────────────────────────────────────
ALTER TABLE public.cross_agency_requests ENABLE ROW LEVEL SECURITY;

-- Requesting agency: can see and insert their own outgoing requests
CREATE POLICY "network_req_select_requesting"
  ON public.cross_agency_requests FOR SELECT
  USING (
    requesting_agency_id = (
      SELECT agency_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Owning agency: can see incoming requests and update status
CREATE POLICY "network_req_select_owning"
  ON public.cross_agency_requests FOR SELECT
  USING (
    owning_agency_id = (
      SELECT agency_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "network_req_insert"
  ON public.cross_agency_requests FOR INSERT
  WITH CHECK (
    requesting_agency_id = (
      SELECT agency_id FROM public.profiles WHERE id = auth.uid()
    )
    -- API layer also enforces: vehicle.owning_agency_id != requesting_agency_id
  );

-- Status updates are done server-side only (service_role bypasses RLS).
-- The API enforces ownership before calling supabaseAdmin.

-- ── 5. vehicles RLS: is_network_visible toggle ───────────────
-- The API (service_role) handles this; no direct RLS needed for the new column.
-- Existing vehicles RLS remains unchanged.
