-- ============================================================
-- RentaFlow — Initial Schema Migration
-- File: supabase/migrations/001_initial_schema.sql
--
-- Safe to run on a fresh Supabase project.
-- All CREATE statements use IF NOT EXISTS guards.
-- Run AFTER the Supabase project is created and auth is enabled.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. AGENCIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agencies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  city         text,
  address      text,
  phone        text,
  email        text,
  ice          text,           -- Moroccan tax ID (15 chars)
  rc           text,           -- Registre de commerce
  if_number    text,           -- Identifiant fiscal
  patente      text,
  insurance    text,
  config       jsonb       DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. PROFILES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text,
  email        text,
  phone        text,
  role         text        DEFAULT 'admin' CHECK (role IN ('admin', 'staff')),
  agency_id    uuid        REFERENCES agencies(id),
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. CLIENTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  first_name              text,
  last_name               text,
  email                   text,
  phone                   text,
  phone2                  text,
  nationality             text        DEFAULT 'MA',
  id_type                 text        DEFAULT 'cin' CHECK (id_type IN ('cin', 'passport')),
  id_number               text,
  id_expiry               date,
  driving_license_num     text,
  driving_license_expiry  date,
  date_of_birth           date,
  address                 text,
  city                    text,
  country                 text        DEFAULT 'MA',
  flag_category           text,
  flag_note               text,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. VEHICLES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  brand                   text,
  model                   text,
  year                    int,
  color                   text,
  plate_number            text        UNIQUE,
  vin                     text,
  fuel_type               text        DEFAULT 'gasoline' CHECK (fuel_type IN ('gasoline', 'diesel', 'electric', 'hybrid')),
  transmission            text        DEFAULT 'manual'   CHECK (transmission IN ('manual', 'automatic')),
  seats                   int         DEFAULT 5,
  doors                   int         DEFAULT 4,
  mileage                 int         DEFAULT 0,
  status                  text        DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'retired')),
  daily_rate              numeric(10,2),
  deposit_amount          numeric(10,2) DEFAULT 0,
  purchase_price          numeric(12,2),
  residual_value          numeric(12,2),
  purchase_date           date,
  expected_lifespan_years int         DEFAULT 5,
  insurance_expiry        date,
  vignette_expiry         date,
  control_tech_expiry     date,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. CONTRACTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contracts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id            uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_number      text        UNIQUE,
  vehicle_id           uuid        REFERENCES vehicles(id),
  client_id            uuid        REFERENCES clients(id),
  status               text        DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  pickup_date          date,
  return_date          date,
  actual_return_date   date,
  pickup_location      text,
  return_location      text,
  daily_rate           numeric(10,2),
  total_days           int,
  extra_fees           numeric(10,2) DEFAULT 0,
  discount             numeric(10,2) DEFAULT 0,
  total_amount         numeric(12,2),
  deposit_amount       numeric(10,2) DEFAULT 0,
  deposit_returned     boolean       DEFAULT false,
  payment_method       text          DEFAULT 'cash',
  payment_status       text          DEFAULT 'pending',
  amount_paid          numeric(12,2) DEFAULT 0,
  mileage_start        int,
  mileage_end          int,
  fuel_level_start     text,
  fuel_level_end       text,
  signature_url        text,
  extra_driver_name    text,
  extra_driver_license text,
  options              jsonb         DEFAULT '{}',
  notes                text,
  created_at           timestamptz   DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. INVOICES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id      uuid        REFERENCES contracts(id),
  client_id        uuid        REFERENCES clients(id),
  invoice_number   text        UNIQUE,
  contract_number  text,
  client_name      text,
  vehicle_name     text,
  total_ht         numeric(12,2),
  tva              numeric(12,2),
  total_ttc        numeric(12,2),
  days             int,
  start_date       date,
  end_date         date,
  status           text        DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 7. REPAIRS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repairs (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  vehicle_id               uuid        REFERENCES vehicles(id),
  date                     date,
  type                     text,
  cost                     numeric(12,2) DEFAULT 0,
  garage                   text,
  mileage                  int,
  description              text,
  -- Sinistre / accident fields (from add_sinistre_to_repairs.sql)
  is_sinistre              boolean       DEFAULT false,
  sinistre_id              text,           -- groups repairs from same accident
  insurance_ref            text,           -- insurer claim reference
  insurance_reimbursement  numeric(12,2)   DEFAULT 0,
  client_franchise         numeric(12,2)   DEFAULT 0,
  contract_id              uuid,           -- optional link to the causative rental
  created_at               timestamptz     DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repairs_sinistre_id_idx ON repairs (sinistre_id) WHERE sinistre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS repairs_vehicle_id_idx  ON repairs (vehicle_id);

-- ─────────────────────────────────────────────────────────────
-- 8. FLEET CONFIG  (warranty / maintenance schedule per make)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fleet_config (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  make                text,
  warranty_general    text,
  warranty_years      int,
  warranty_battery    text,
  control_tech_years  int,
  vidange_km          int,
  courroie_km         int,
  extension           text,
  created_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 9. DOCUMENTS  (OCR results from ID / licence scans)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid,
  client_id   uuid,
  type        text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 10. CONTRACT PHOTOS  (before/after damage photos)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid        REFERENCES contracts(id) ON DELETE CASCADE,
  slot_id     text,       -- e.g. 'front-left', 'dashboard'
  phase       text,       -- 'pickup' | 'return'
  url         text,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 11. ACCOUNTS  (chart of accounts — double-entry bookkeeping)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code           text        NOT NULL,
  name           text        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('asset', 'liability', 'revenue', 'expense')),
  normal_balance text        NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  category       text,
  is_system      boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (agency_id, code)
);

-- ─────────────────────────────────────────────────────────────
-- 12. TRANSACTIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  reference    text,
  date         date,
  description  text,
  type         text,
  amount       numeric(12,2),
  account_code text,
  contract_id  uuid,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 13. JOURNAL ENTRIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  transaction_id uuid        REFERENCES transactions(id) ON DELETE CASCADE,
  date           date,
  description    text,
  account_code   text,
  debit          numeric(12,2) DEFAULT 0,
  credit         numeric(12,2) DEFAULT 0,
  created_at     timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_transaction_idx ON journal_entries (transaction_id);

-- ─────────────────────────────────────────────────────────────
-- 14. DEPOSITS  (rental security deposits)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deposits (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid        REFERENCES contracts(id),
  client_id   uuid        REFERENCES clients(id),
  amount      numeric(12,2),
  status      text        DEFAULT 'held' CHECK (status IN ('held', 'released', 'forfeited')),
  held_at     timestamptz,
  released_at timestamptz,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 15. SNAPSHOTS  (telematics — GPS/OBD snapshots at contract start/end)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid,
  vehicle_id  uuid        REFERENCES vehicles(id),
  phase       text        CHECK (phase IN ('start', 'end')),
  mileage     int,
  fuel        text,
  lat         numeric(10,6),
  lng         numeric(10,6),
  engine_on   boolean,
  dtc_codes   jsonb       DEFAULT '[]',
  provider    text,
  taken_at    timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_contract_idx ON snapshots (contract_id);
CREATE INDEX IF NOT EXISTS snapshots_vehicle_idx  ON snapshots (vehicle_id);

-- ─────────────────────────────────────────────────────────────
-- 16. TCO VIEW  (materialized from repairs — mirrors localStorage getTCO)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vehicle_tco AS
SELECT
  vehicle_id,
  COUNT(*)                                                          AS repair_count,
  COALESCE(SUM(cost), 0)                                            AS total_expense,
  COALESCE(SUM(insurance_reimbursement), 0)                         AS total_insurance,
  COALESCE(SUM(client_franchise), 0)                                AS total_franchise,
  COALESCE(SUM(cost), 0)
    - COALESCE(SUM(insurance_reimbursement), 0)
    - COALESCE(SUM(client_franchise), 0)                            AS net_tco
FROM repairs
GROUP BY vehicle_id;

-- ─────────────────────────────────────────────────────────────
-- 17. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

-- Helper: current user's agency_id (avoids repeating the sub-select)
-- We inline the sub-select in each policy so there is no dependency on a
-- separate function that might not exist yet when the migration runs.

-- agencies: user sees only their own agency row
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_own" ON agencies
  USING (id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- profiles: user sees all profiles in their agency (for team management)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_same_agency" ON profiles
  USING (agency_id = (SELECT agency_id FROM profiles p WHERE p.id = auth.uid()));

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON clients
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- vehicles
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON vehicles
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON contracts
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON invoices
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- repairs
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON repairs
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- fleet_config
ALTER TABLE fleet_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON fleet_config
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON documents
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- contract_photos
ALTER TABLE contract_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON contract_photos
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON accounts
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON transactions
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- journal_entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON journal_entries
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- deposits
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON deposits
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- snapshots
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON snapshots
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 18. RPCs
-- ─────────────────────────────────────────────────────────────

-- ── onboard_new_agency ───────────────────────────────────────
-- Called during Onboarding.jsx after sign-up to create the agency row
-- and bind the user's profile to it in a single transaction.

CREATE OR REPLACE FUNCTION onboard_new_agency(
  p_user_id    uuid,
  p_agency_name text,
  p_full_name  text,
  p_email      text,
  p_phone      text,
  p_city       text,
  p_ice        text,
  p_rc         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agency_id uuid;
BEGIN
  INSERT INTO agencies (name, city, ice, rc)
    VALUES (p_agency_name, p_city, p_ice, p_rc)
    RETURNING id INTO v_agency_id;

  INSERT INTO profiles (id, full_name, email, phone, role, agency_id)
    VALUES (p_user_id, p_full_name, p_email, p_phone, 'admin', v_agency_id)
    ON CONFLICT (id) DO UPDATE
      SET full_name  = EXCLUDED.full_name,
          agency_id  = EXCLUDED.agency_id,
          role       = 'admin';

  RETURN v_agency_id;
END;
$$;

-- ── get_available_vehicles ───────────────────────────────────
-- Returns all vehicles for the agency that are not in maintenance/retired
-- and have no active contract overlapping the requested date range.
-- Called by lib/db.js getAvailableVehicles().

CREATE OR REPLACE FUNCTION get_available_vehicles(
  p_agency_id  uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS SETOF vehicles
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT v.*
  FROM   vehicles v
  WHERE  v.agency_id = p_agency_id
    AND  v.status NOT IN ('maintenance', 'retired')
    AND  v.id NOT IN (
           SELECT c.vehicle_id
           FROM   contracts c
           WHERE  c.agency_id = p_agency_id
             AND  c.status    = 'active'
             AND  c.pickup_date < p_end_date
             AND  c.return_date > p_start_date
         );
$$;

-- ── get_dashboard_stats ──────────────────────────────────────
-- Returns a JSON object with fleet and revenue KPIs for the dashboard.
-- Called by lib/db.js getDashboardStats().

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_agency_id uuid
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_vehicles',     (SELECT COUNT(*)            FROM vehicles  WHERE agency_id = p_agency_id),
    'rented_vehicles',    (SELECT COUNT(*)            FROM vehicles  WHERE agency_id = p_agency_id AND status = 'rented'),
    'available_vehicles', (SELECT COUNT(*)            FROM vehicles  WHERE agency_id = p_agency_id AND status = 'available'),
    'active_contracts',   (SELECT COUNT(*)            FROM contracts WHERE agency_id = p_agency_id AND status = 'active'),
    'monthly_revenue',    (SELECT COALESCE(SUM(total_amount), 0)
                           FROM contracts
                           WHERE agency_id = p_agency_id
                             AND status    = 'closed'
                             AND date_trunc('month', created_at) = date_trunc('month', now())),
    'total_clients',      (SELECT COUNT(*)            FROM clients   WHERE agency_id = p_agency_id)
  );
$$;
