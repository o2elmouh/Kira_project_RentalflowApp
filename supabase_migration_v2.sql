-- ============================================================
-- RentaFlow — Migration v2
-- Run this in Supabase SQL Editor on your existing database
-- (do NOT drop tables — this adds what is missing)
-- ============================================================

-- 1. Add missing invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id        UUID          NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id      UUID          REFERENCES contracts(id) ON DELETE SET NULL,
  client_id        UUID          REFERENCES clients(id)   ON DELETE SET NULL,
  invoice_number   TEXT,
  contract_number  TEXT,
  client_name      TEXT,
  vehicle_name     TEXT,
  total_ht         DECIMAL(10,2) NOT NULL DEFAULT 0,
  tva              DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_ttc        DECIMAL(10,2) NOT NULL DEFAULT 0,
  days             INT           NOT NULL DEFAULT 1,
  start_date       DATE,
  end_date         DATE,
  status           TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices FOR SELECT USING (user_belongs_to_agency(agency_id));
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices FOR UPDATE USING (user_belongs_to_agency(agency_id));
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices FOR DELETE USING (user_belongs_to_agency(agency_id));

CREATE INDEX IF NOT EXISTS idx_invoices_agency_id   ON invoices(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id   ON invoices(client_id);

-- 2. Add missing columns to fleet_config
ALTER TABLE fleet_config ADD COLUMN IF NOT EXISTS warranty_general   TEXT;
ALTER TABLE fleet_config ADD COLUMN IF NOT EXISTS warranty_battery   TEXT;
ALTER TABLE fleet_config ADD COLUMN IF NOT EXISTS warranty_extension TEXT;

-- 3. Add get_available_vehicles RPC (if not already added)
CREATE OR REPLACE FUNCTION get_available_vehicles(
  p_agency_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS SETOF vehicles
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT v.*
    FROM vehicles v
   WHERE v.agency_id = p_agency_id
     AND v.status    = 'available'
     AND v.id NOT IN (
       SELECT c.vehicle_id
         FROM contracts c
        WHERE c.agency_id = p_agency_id
          AND c.status IN ('active','draft')
          AND c.pickup_date::DATE <= p_end_date
          AND c.return_date::DATE >= p_start_date
     )
   ORDER BY v.brand, v.model;
$$;

-- 4. Fix profiles RLS (remove circular dependency)
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select"     ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
DROP POLICY IF EXISTS "profiles_insert"      ON profiles;
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR id = auth.uid()
  );

-- 5. Update onboard_new_agency with ice/rc params
CREATE OR REPLACE FUNCTION onboard_new_agency(
  p_user_id     UUID,
  p_agency_name TEXT,
  p_full_name   TEXT,
  p_email       TEXT DEFAULT NULL,
  p_phone       TEXT DEFAULT NULL,
  p_city        TEXT DEFAULT NULL,
  p_ice         TEXT DEFAULT NULL,
  p_rc          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'Cannot create profile for another user'; END IF;

  SELECT agency_id INTO v_agency_id FROM profiles WHERE id = p_user_id;
  IF v_agency_id IS NOT NULL THEN RETURN v_agency_id; END IF;

  SET LOCAL row_security = off;

  INSERT INTO agencies (name, email, phone, city, ice, rc)
  VALUES (p_agency_name, p_email, p_phone, p_city, p_ice, p_rc)
  RETURNING id INTO v_agency_id;

  INSERT INTO profiles (id, agency_id, full_name, role, phone)
  VALUES (p_user_id, v_agency_id, p_full_name, 'owner', p_phone);

  RETURN v_agency_id;
END;
$$;
