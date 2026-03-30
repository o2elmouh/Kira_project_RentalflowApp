-- ============================================================
-- RENTAFLOW P1 — Supabase Schema v2
-- Updated: added repairs, contract_photos, documents, fleet_config
-- Changes: amortissement fields, client flags, km limits, signature_url
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- 1. CUSTOM TYPES (ENUMS)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('available', 'rented', 'maintenance', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fuel_type AS ENUM ('gasoline', 'diesel', 'electric', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transmission_type AS ENUM ('manual', 'automatic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('draft', 'active', 'completed', 'cancelled', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE id_document_type AS ENUM ('cin', 'passport', 'driving_license', 'residence_permit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- ----------------------------------------------------------
-- 2.1 agencies
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agencies (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT        NOT NULL,
  address             TEXT,
  city                TEXT,
  phone               TEXT,
  email               TEXT,
  website             TEXT,
  logo_url            TEXT,
  ice                 TEXT,                    -- Identifiant Commun de l'Entreprise (Morocco)
  rc                  TEXT,                    -- Registre du Commerce
  if_number           TEXT,                    -- Identifiant Fiscal
  patente             TEXT,                    -- Taxe professionnelle (Moroccan business tax)
  currency            TEXT        NOT NULL DEFAULT 'MAD',
  timezone            TEXT        NOT NULL DEFAULT 'Africa/Casablanca',
  contract_prefix     TEXT        NOT NULL DEFAULT 'CTR',
  next_contract_num   INT         NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.2 profiles (linked to Supabase Auth)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'manager', 'agent')),
  phone       TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.3 vehicles
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                      UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id               UUID              NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  brand                   TEXT              NOT NULL,
  model                   TEXT              NOT NULL,
  year                    INT,
  color                   TEXT,
  plate_number            TEXT              NOT NULL,
  vin                     TEXT,
  fuel_type               fuel_type         NOT NULL DEFAULT 'gasoline',
  transmission            transmission_type NOT NULL DEFAULT 'manual',
  seats                   INT               NOT NULL DEFAULT 5,
  doors                   INT               NOT NULL DEFAULT 4,
  mileage                 INT               NOT NULL DEFAULT 0,
  status                  vehicle_status    NOT NULL DEFAULT 'available',
  daily_rate              DECIMAL(10,2)     NOT NULL DEFAULT 0,
  deposit_amount          DECIMAL(10,2)     NOT NULL DEFAULT 0,
  image_url               TEXT[],                                           -- array of photo URLs
  purchase_price          DECIMAL(10,2),                                    -- prix d'achat
  residual_value          DECIMAL(10,2),                                    -- valeur résiduelle
  purchase_date           DATE,
  expected_lifespan_years INT               NOT NULL DEFAULT 5,
  max_km_enabled          BOOLEAN           NOT NULL DEFAULT FALSE,
  max_km_per_day          INT,
  insurance_policy_num    TEXT,
  insurance_expiry        DATE,
  vignette_expiry         DATE,
  control_tech_expiry     DATE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, plate_number)
);

-- ----------------------------------------------------------
-- 2.4 clients
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id           UUID            NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  first_name          TEXT            NOT NULL,
  last_name           TEXT            NOT NULL,
  email               TEXT,
  phone               TEXT,
  phone2              TEXT,
  nationality         TEXT            NOT NULL DEFAULT 'MA',
  id_type             id_document_type NOT NULL DEFAULT 'cin',
  id_number           TEXT            NOT NULL,
  id_expiry           DATE,
  driving_license_num TEXT,
  driving_license_expiry DATE,
  date_of_birth       DATE,
  address             TEXT,
  city                TEXT,
  country             TEXT            NOT NULL DEFAULT 'MA',
  flag_category       TEXT            CHECK (flag_category IN ('Impayé','Dommage non remboursé','Litige','Blacklist','Autre')),
  flag_note           TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.5 contracts
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id           UUID            NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_number     TEXT            NOT NULL,
  vehicle_id          UUID            NOT NULL REFERENCES vehicles(id),
  client_id           UUID            NOT NULL REFERENCES clients(id),
  status              contract_status NOT NULL DEFAULT 'draft',

  -- Dates & Times
  pickup_date         TIMESTAMPTZ     NOT NULL,
  return_date         TIMESTAMPTZ     NOT NULL,
  actual_return_date  TIMESTAMPTZ,

  -- Locations
  pickup_location     TEXT,
  return_location     TEXT,

  -- Pricing
  daily_rate          DECIMAL(10,2)   NOT NULL DEFAULT 0,
  total_days          INT             NOT NULL DEFAULT 1,
  extra_fees          DECIMAL(10,2)   NOT NULL DEFAULT 0,
  discount            DECIMAL(10,2)   NOT NULL DEFAULT 0,
  total_amount        DECIMAL(10,2)   NOT NULL DEFAULT 0,
  deposit_amount      DECIMAL(10,2)   NOT NULL DEFAULT 0,
  deposit_returned    BOOLEAN         NOT NULL DEFAULT FALSE,

  -- Payment
  payment_method      payment_method  NOT NULL DEFAULT 'cash',
  payment_status      payment_status  NOT NULL DEFAULT 'pending',
  amount_paid         DECIMAL(10,2)   NOT NULL DEFAULT 0,

  -- Mileage
  mileage_start       INT,
  mileage_end         INT,

  -- Fuel
  fuel_level_start    TEXT,
  fuel_level_end      TEXT,

  -- Signature (stored in Supabase Storage, not inline base64)
  signature_url       TEXT,

  -- Prolongation link
  prolonged_from_id   UUID            REFERENCES contracts(id),

  -- Extra drivers / options
  extra_driver_name   TEXT,
  extra_driver_license TEXT,
  options             JSONB           NOT NULL DEFAULT '{}',

  notes               TEXT,
  created_by          UUID            REFERENCES profiles(id),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  UNIQUE(agency_id, contract_number)
);

-- ----------------------------------------------------------
-- 2.6 payments
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id       UUID            NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id     UUID            NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  amount          DECIMAL(10,2)   NOT NULL,
  method          payment_method  NOT NULL DEFAULT 'cash',
  paid_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  reference       TEXT,
  notes           TEXT,
  created_by      UUID            REFERENCES profiles(id),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.7 fleet_config
-- Stores per-brand maintenance specifications
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_config (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id           UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  brand               TEXT        NOT NULL,
  warranty_years      INT         NOT NULL DEFAULT 3,
  control_tech_years  INT         NOT NULL DEFAULT 5,
  oil_change_km       INT         NOT NULL DEFAULT 10000,
  timing_belt_km      INT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, brand)
);

-- ----------------------------------------------------------
-- 2.8 repairs
-- Tracks maintenance and repair events per vehicle
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS repairs (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id         UUID          NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  vehicle_id        UUID          NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  repair_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  description       TEXT          NOT NULL,
  cost              DECIMAL(10,2) NOT NULL DEFAULT 0,
  mileage_at_repair INT,
  repair_type       TEXT          CHECK (repair_type IN ('maintenance','repair','inspection','other')),
  garage            TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.9 contract_photos
-- Stores references to photos taken at vehicle pickup and return
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_photos (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id   UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  agency_id     UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  phase         TEXT        NOT NULL CHECK (phase IN ('pickup','return')),
  slot          TEXT        NOT NULL,  -- e.g. 'front','rear','left','right','interior','damage'
  storage_path  TEXT        NOT NULL,  -- Supabase Storage path
  public_url    TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2.10 documents
-- OCR-ready document storage (CIN, permis, insurance, etc.)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id       UUID        REFERENCES clients(id) ON DELETE CASCADE,
  vehicle_id      UUID        REFERENCES vehicles(id) ON DELETE CASCADE,
  contract_id     UUID        REFERENCES contracts(id) ON DELETE CASCADE,
  document_type   TEXT        NOT NULL CHECK (document_type IN ('cin','passport','driving_license','insurance','inspection','other')),
  storage_path    TEXT        NOT NULL,   -- Supabase Storage path
  public_url      TEXT,
  ocr_status      TEXT        NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','processing','done','failed')),
  ocr_raw         JSONB,                  -- raw OCR output
  ocr_extracted   JSONB,                  -- structured extracted fields
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

-- ============================================================
-- 3. AUTO-NUMBERING (contract_number generation)
-- ============================================================

-- Function: generate next contract number for an agency
CREATE OR REPLACE FUNCTION generate_contract_number(p_agency_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix    TEXT;
  v_num       INT;
  v_padded    TEXT;
BEGIN
  SELECT contract_prefix, next_contract_num
    INTO v_prefix, v_num
    FROM agencies
   WHERE id = p_agency_id
     FOR UPDATE;

  v_padded := LPAD(v_num::TEXT, 5, '0');

  UPDATE agencies
     SET next_contract_num = next_contract_num + 1,
         updated_at        = NOW()
   WHERE id = p_agency_id;

  RETURN v_prefix || '-' || v_padded;
END;
$$;

-- ============================================================
-- 4. HELPER FUNCTIONS
-- ============================================================

-- Check if the calling user belongs to a given agency
CREATE OR REPLACE FUNCTION user_belongs_to_agency(p_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id        = auth.uid()
       AND agency_id = p_agency_id
       AND is_active = TRUE
  );
$$;

-- Get the agency_id for the currently authenticated user
CREATE OR REPLACE FUNCTION my_agency_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Dashboard statistics for an agency
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_agency_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_vehicles',       (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id),
    'available_vehicles',   (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id AND status = 'available'),
    'rented_vehicles',      (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id AND status = 'rented'),
    'maintenance_vehicles', (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id AND status = 'maintenance'),
    'total_clients',        (SELECT COUNT(*) FROM clients WHERE agency_id = p_agency_id),
    'active_contracts',     (SELECT COUNT(*) FROM contracts WHERE agency_id = p_agency_id AND status = 'active'),
    'contracts_today',      (SELECT COUNT(*) FROM contracts
                              WHERE agency_id = p_agency_id
                                AND DATE(pickup_date) = CURRENT_DATE),
    'returns_today',        (SELECT COUNT(*) FROM contracts
                              WHERE agency_id = p_agency_id
                                AND DATE(return_date) = CURRENT_DATE
                                AND status = 'active'),
    'revenue_this_month',   (SELECT COALESCE(SUM(amount), 0) FROM payments
                              WHERE agency_id = p_agency_id
                                AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())),
    'revenue_today',        (SELECT COALESCE(SUM(amount), 0) FROM payments
                              WHERE agency_id = p_agency_id
                                AND DATE(paid_at) = CURRENT_DATE),
    'pending_payments',     (SELECT COUNT(*) FROM contracts
                              WHERE agency_id = p_agency_id
                                AND payment_status IN ('pending','partial')),
    'overdue_repairs',      (SELECT COUNT(DISTINCT v.id)
                              FROM vehicles v
                              LEFT JOIN repairs r
                                ON r.vehicle_id = v.id
                               AND r.repair_date >= CURRENT_DATE - INTERVAL '6 months'
                              LEFT JOIN fleet_config fc
                                ON fc.agency_id = v.agency_id
                               AND fc.brand = v.brand
                              WHERE v.agency_id = p_agency_id
                                AND v.status != 'retired'
                                AND r.id IS NULL
                                AND fc.oil_change_km IS NOT NULL
                                AND v.mileage >= fc.oil_change_km)
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply update_timestamp to all relevant tables
DO $$ BEGIN

  -- agencies
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agencies_updated_at') THEN
    CREATE TRIGGER trg_agencies_updated_at
      BEFORE UPDATE ON agencies
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- profiles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at
      BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- vehicles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vehicles_updated_at') THEN
    CREATE TRIGGER trg_vehicles_updated_at
      BEFORE UPDATE ON vehicles
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- clients
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated_at') THEN
    CREATE TRIGGER trg_clients_updated_at
      BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- contracts
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contracts_updated_at') THEN
    CREATE TRIGGER trg_contracts_updated_at
      BEFORE UPDATE ON contracts
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- fleet_config
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fleet_config_updated_at') THEN
    CREATE TRIGGER trg_fleet_config_updated_at
      BEFORE UPDATE ON fleet_config
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

  -- repairs
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_repairs_updated_at') THEN
    CREATE TRIGGER trg_repairs_updated_at
      BEFORE UPDATE ON repairs
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;

END $$;

-- Trigger: auto-generate contract_number before insert if not provided
CREATE OR REPLACE FUNCTION trg_fn_set_contract_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    NEW.contract_number := generate_contract_number(NEW.agency_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contracts_set_number') THEN
    CREATE TRIGGER trg_contracts_set_number
      BEFORE INSERT ON contracts
      FOR EACH ROW EXECUTE FUNCTION trg_fn_set_contract_number();
  END IF;
END $$;

-- Trigger: update vehicle status when contract changes
CREATE OR REPLACE FUNCTION trg_fn_sync_vehicle_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When a contract becomes active, mark vehicle as rented
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE vehicles SET status = 'rented', updated_at = NOW()
     WHERE id = NEW.vehicle_id;
  END IF;

  -- When a contract is completed, cancelled, or closed, mark vehicle as available
  IF NEW.status IN ('completed','cancelled','closed') AND OLD.status = 'active' THEN
    UPDATE vehicles SET status = 'available', updated_at = NOW()
     WHERE id = NEW.vehicle_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contracts_sync_vehicle_status') THEN
    CREATE TRIGGER trg_contracts_sync_vehicle_status
      AFTER UPDATE ON contracts
      FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_vehicle_status();
  END IF;
END $$;

-- Trigger: update contract payment_status when a payment is inserted
CREATE OR REPLACE FUNCTION trg_fn_update_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   DECIMAL(10,2);
  v_paid    DECIMAL(10,2);
  v_new_status payment_status;
BEGIN
  SELECT total_amount INTO v_total FROM contracts WHERE id = NEW.contract_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE contract_id = NEW.contract_id;

  IF v_paid <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_paid < v_total THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'paid';
  END IF;

  UPDATE contracts
     SET amount_paid    = v_paid,
         payment_status = v_new_status,
         updated_at     = NOW()
   WHERE id = NEW.contract_id;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payments_update_contract') THEN
    CREATE TRIGGER trg_payments_update_contract
      AFTER INSERT ON payments
      FOR EACH ROW EXECUTE FUNCTION trg_fn_update_payment_status();
  END IF;
END $$;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE agencies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE repairs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_photos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents        ENABLE ROW LEVEL SECURITY;

-- ---- agencies ----
DROP POLICY IF EXISTS "agencies_select" ON agencies;
CREATE POLICY "agencies_select" ON agencies
  FOR SELECT USING (user_belongs_to_agency(id));

DROP POLICY IF EXISTS "agencies_update" ON agencies;
CREATE POLICY "agencies_update" ON agencies
  FOR UPDATE USING (user_belongs_to_agency(id));

-- ---- profiles ----
-- Note: cannot use user_belongs_to_agency() here — it queries profiles itself (circular).
-- Instead: a user may see/edit profiles that share their agency_id.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR id = auth.uid()
  );

-- ---- vehicles ----
DROP POLICY IF EXISTS "vehicles_select" ON vehicles;
CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "vehicles_insert" ON vehicles;
CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "vehicles_update" ON vehicles;
CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "vehicles_delete" ON vehicles;
CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- clients ----
DROP POLICY IF EXISTS "clients_select" ON clients;
CREATE POLICY "clients_select" ON clients
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "clients_insert" ON clients;
CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "clients_delete" ON clients;
CREATE POLICY "clients_delete" ON clients
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- contracts ----
DROP POLICY IF EXISTS "contracts_select" ON contracts;
CREATE POLICY "contracts_select" ON contracts
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "contracts_insert" ON contracts;
CREATE POLICY "contracts_insert" ON contracts
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "contracts_update" ON contracts;
CREATE POLICY "contracts_update" ON contracts
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "contracts_delete" ON contracts;
CREATE POLICY "contracts_delete" ON contracts
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- payments ----
DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "payments_update" ON payments;
CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

-- ---- fleet_config ----
DROP POLICY IF EXISTS "fleet_config_select" ON fleet_config;
CREATE POLICY "fleet_config_select" ON fleet_config
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "fleet_config_insert" ON fleet_config;
CREATE POLICY "fleet_config_insert" ON fleet_config
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "fleet_config_update" ON fleet_config;
CREATE POLICY "fleet_config_update" ON fleet_config
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "fleet_config_delete" ON fleet_config;
CREATE POLICY "fleet_config_delete" ON fleet_config
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- repairs ----
DROP POLICY IF EXISTS "repairs_select" ON repairs;
CREATE POLICY "repairs_select" ON repairs
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "repairs_insert" ON repairs;
CREATE POLICY "repairs_insert" ON repairs
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "repairs_update" ON repairs;
CREATE POLICY "repairs_update" ON repairs
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "repairs_delete" ON repairs;
CREATE POLICY "repairs_delete" ON repairs
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- contract_photos ----
DROP POLICY IF EXISTS "contract_photos_select" ON contract_photos;
CREATE POLICY "contract_photos_select" ON contract_photos
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "contract_photos_insert" ON contract_photos;
CREATE POLICY "contract_photos_insert" ON contract_photos
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "contract_photos_delete" ON contract_photos;
CREATE POLICY "contract_photos_delete" ON contract_photos
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ---- documents ----
DROP POLICY IF EXISTS "documents_select" ON documents;
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "documents_insert" ON documents;
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "documents_update" ON documents;
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (user_belongs_to_agency(agency_id));

DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (user_belongs_to_agency(agency_id));

-- ============================================================
-- 7. ONBOARDING
-- ============================================================

-- Function: called after a new user signs up via Supabase Auth.
-- Creates the agency and links the profile atomically.
CREATE OR REPLACE FUNCTION onboard_new_agency(
  p_user_id       UUID,
  p_agency_name   TEXT,
  p_full_name     TEXT,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_city          TEXT DEFAULT NULL,
  p_ice           TEXT DEFAULT NULL,
  p_rc            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Idempotence : si le profil existe déjà, retourner l'agency_id existant
  SELECT agency_id INTO v_agency_id FROM profiles WHERE id = p_user_id;
  IF v_agency_id IS NOT NULL THEN
    RETURN v_agency_id;
  END IF;

  SET LOCAL row_security = off;

  -- Create agency
  INSERT INTO agencies (name, email, phone, city, ice, rc)
  VALUES (p_agency_name, p_email, p_phone, p_city, p_ice, p_rc)
  RETURNING id INTO v_agency_id;

  -- Create owner profile
  INSERT INTO profiles (id, agency_id, full_name, role, phone)
  VALUES (p_user_id, v_agency_id, p_full_name, 'owner', p_phone);

  RETURN v_agency_id;
END;
$$;

-- ============================================================
-- 8. INDEXES
-- ============================================================

-- vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_agency_id    ON vehicles(agency_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status        ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand         ON vehicles(brand);

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_agency_id     ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_id_number     ON clients(id_number);

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_agency_id   ON contracts(agency_id);
CREATE INDEX IF NOT EXISTS idx_contracts_vehicle_id  ON contracts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id   ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status       ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_pickup_date  ON contracts(pickup_date);
CREATE INDEX IF NOT EXISTS idx_contracts_return_date  ON contracts(return_date);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_agency_id    ON payments(agency_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract_id  ON payments(contract_id);

-- fleet_config
CREATE INDEX IF NOT EXISTS idx_fleet_config_agency_id ON fleet_config(agency_id);
CREATE INDEX IF NOT EXISTS idx_fleet_config_brand      ON fleet_config(brand);

-- repairs
CREATE INDEX IF NOT EXISTS idx_repairs_agency_id     ON repairs(agency_id);
CREATE INDEX IF NOT EXISTS idx_repairs_vehicle_id    ON repairs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_repairs_repair_date   ON repairs(repair_date);

-- contract_photos
CREATE INDEX IF NOT EXISTS idx_contract_photos_contract_id ON contract_photos(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_photos_agency_id   ON contract_photos(agency_id);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_agency_id    ON documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id    ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_contract_id  ON documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_vehicle_id   ON documents(vehicle_id);

-- ============================================================
-- 8. DASHBOARD VIEWS
-- ============================================================

-- View: active contracts with vehicle and client details
CREATE OR REPLACE VIEW v_active_contracts AS
SELECT
  c.id,
  c.agency_id,
  c.contract_number,
  c.status,
  c.pickup_date,
  c.return_date,
  c.actual_return_date,
  c.daily_rate,
  c.total_days,
  c.total_amount,
  c.amount_paid,
  c.payment_status,
  c.deposit_amount,
  c.deposit_returned,
  -- Vehicle
  v.brand          AS vehicle_brand,
  v.model          AS vehicle_model,
  v.plate_number   AS vehicle_plate,
  v.color          AS vehicle_color,
  -- Client
  cl.first_name    AS client_first_name,
  cl.last_name     AS client_last_name,
  cl.phone         AS client_phone,
  cl.email         AS client_email,
  cl.id_number     AS client_id_number,
  cl.flag_category AS client_flag
FROM contracts c
JOIN vehicles v  ON v.id  = c.vehicle_id
JOIN clients  cl ON cl.id = c.client_id
WHERE c.status = 'active';

-- View: vehicles with their latest repair info
CREATE OR REPLACE VIEW v_vehicles_maintenance AS
SELECT
  v.id,
  v.agency_id,
  v.brand,
  v.model,
  v.plate_number,
  v.status,
  v.mileage,
  v.insurance_expiry,
  v.vignette_expiry,
  v.control_tech_expiry,
  fc.oil_change_km,
  fc.timing_belt_km,
  fc.warranty_years,
  r_last.repair_date       AS last_repair_date,
  r_last.mileage_at_repair AS last_repair_mileage,
  r_last.repair_type       AS last_repair_type,
  -- Estimated km since last oil change
  CASE
    WHEN r_last.mileage_at_repair IS NOT NULL
    THEN v.mileage - r_last.mileage_at_repair
    ELSE NULL
  END AS km_since_last_repair
FROM vehicles v
LEFT JOIN fleet_config fc
  ON fc.agency_id = v.agency_id AND fc.brand = v.brand
LEFT JOIN LATERAL (
  SELECT repair_date, mileage_at_repair, repair_type
    FROM repairs
   WHERE vehicle_id = v.id
   ORDER BY repair_date DESC
   LIMIT 1
) r_last ON TRUE;

-- View: revenue summary per month per agency
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  agency_id,
  DATE_TRUNC('month', paid_at)::DATE AS month,
  COUNT(*)                            AS payment_count,
  SUM(amount)                         AS total_revenue
FROM payments
GROUP BY agency_id, DATE_TRUNC('month', paid_at)
ORDER BY agency_id, month DESC;

-- View: client risk flags
CREATE OR REPLACE VIEW v_flagged_clients AS
SELECT
  c.id,
  c.agency_id,
  c.first_name,
  c.last_name,
  c.phone,
  c.email,
  c.id_number,
  c.flag_category,
  c.flag_note,
  COUNT(ct.id) AS total_contracts
FROM clients c
LEFT JOIN contracts ct ON ct.client_id = c.id
WHERE c.flag_category IS NOT NULL
GROUP BY c.id;
