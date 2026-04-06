-- ===== PATCH: Align existing tables + create missing ones =====
-- Safe to run on the existing Supabase project (all IF NOT EXISTS guards)

-- 1. agencies: add config column
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}';

-- 2. profiles: add email column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- 3. repairs: add sinistre fields
ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS is_sinistre             boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS sinistre_id             text,
  ADD COLUMN IF NOT EXISTS insurance_ref           text,
  ADD COLUMN IF NOT EXISTS insurance_reimbursement numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_franchise        numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_id             uuid;

CREATE INDEX IF NOT EXISTS repairs_sinistre_id_idx ON repairs (sinistre_id) WHERE sinistre_id IS NOT NULL;

-- 4. accounts
CREATE TABLE IF NOT EXISTS accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code           text NOT NULL,
  name           text NOT NULL,
  type           text CHECK (type IN ('asset','liability','revenue','expense')),
  normal_balance text CHECK (normal_balance IN ('debit','credit')),
  category       text,
  is_system      boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON accounts
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- 5. transactions
CREATE TABLE IF NOT EXISTS transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  reference    text,
  date         date,
  description  text,
  type         text,
  amount       numeric(12,2),
  account_code text,
  contract_id  uuid,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON transactions
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- 6. journal_entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  date           date,
  description    text,
  account_code   text,
  debit          numeric(12,2) DEFAULT 0,
  credit         numeric(12,2) DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON journal_entries
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- 7. deposits
CREATE TABLE IF NOT EXISTS deposits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id),
  client_id   uuid REFERENCES clients(id),
  amount      numeric(12,2),
  status      text DEFAULT 'held' CHECK (status IN ('held','released','forfeited')),
  held_at     timestamptz,
  released_at timestamptz,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON deposits
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- 8. snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid,
  vehicle_id  uuid REFERENCES vehicles(id),
  phase       text CHECK (phase IN ('start','end')),
  mileage     int,
  fuel        text,
  lat         numeric(10,6),
  lng         numeric(10,6),
  engine_on   boolean,
  dtc_codes   jsonb DEFAULT '[]',
  provider    text,
  taken_at    timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON snapshots
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- 9. vehicle_tco view
CREATE OR REPLACE VIEW vehicle_tco AS
SELECT
  vehicle_id,
  COUNT(*) AS repair_count,
  COALESCE(SUM(cost), 0) AS total_expense,
  COALESCE(SUM(insurance_reimbursement), 0) AS total_insurance,
  COALESCE(SUM(client_franchise), 0) AS total_franchise,
  COALESCE(SUM(cost), 0)
    - COALESCE(SUM(insurance_reimbursement), 0)
    - COALESCE(SUM(client_franchise), 0) AS net_tco
FROM repairs GROUP BY vehicle_id;

-- 10. RPCs
CREATE OR REPLACE FUNCTION get_available_vehicles(p_agency_id uuid, p_start_date date, p_end_date date)
RETURNS SETOF vehicles LANGUAGE sql SECURITY DEFINER AS $$
  SELECT v.* FROM vehicles v
  WHERE v.agency_id = p_agency_id
    AND v.status NOT IN ('maintenance','retired')
    AND v.id NOT IN (
      SELECT c.vehicle_id FROM contracts c
      WHERE c.agency_id = p_agency_id AND c.status = 'active'
        AND c.pickup_date < p_end_date AND c.return_date > p_start_date
    );
$$;

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_agency_id uuid)
RETURNS json LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object(
    'total_vehicles',     (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id),
    'rented_vehicles',    (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id AND status = 'rented'),
    'available_vehicles', (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id AND status = 'available'),
    'active_contracts',   (SELECT COUNT(*) FROM contracts WHERE agency_id = p_agency_id AND status = 'active'),
    'monthly_revenue',    (SELECT COALESCE(SUM(total_amount),0) FROM contracts WHERE agency_id = p_agency_id AND status = 'closed' AND date_trunc('month',created_at) = date_trunc('month',now())),
    'total_clients',      (SELECT COUNT(*) FROM clients WHERE agency_id = p_agency_id)
  );
$$;

CREATE OR REPLACE FUNCTION onboard_new_agency(
  p_user_id uuid, p_agency_name text, p_full_name text,
  p_email text, p_phone text, p_city text, p_ice text, p_rc text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_agency_id uuid;
BEGIN
  INSERT INTO agencies (name, city, ice, rc)
    VALUES (p_agency_name, p_city, p_ice, p_rc)
    RETURNING id INTO v_agency_id;
  INSERT INTO profiles (id, full_name, email, phone, role, agency_id)
    VALUES (p_user_id, p_full_name, p_email, p_phone, 'admin', v_agency_id)
    ON CONFLICT (id) DO UPDATE
      SET full_name = p_full_name, email = p_email, agency_id = v_agency_id, role = 'admin';
  RETURN v_agency_id;
END;$$;
