-- ─────────────────────────────────────────────────────────────
-- Test for migrations/20261116_permissions_hardening.sql
-- ─────────────────────────────────────────────────────────────
--
-- Run against an EMPTY scratch database (never staging / prod — it creates
-- stub tables and roles):
--
--   psql -v ON_ERROR_STOP=1 -d <scratch_db> -f supabase/tests/permissions_hardening.sql
--
-- It rebuilds the pre-migration (vulnerable) state with a minimal stub of the
-- Supabase environment, applies the migration twice (idempotency), then
-- asserts each hole is closed and the legitimate flows still work. Any failed
-- assertion raises 'TEST FAILED: …' and aborts with a non-zero exit code.
-- The last line printed on success is "ALL PERMISSION TESTS PASSED".

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-- ── Supabase environment stub ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role'
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- ── Minimal schema (columns the migration and the tests touch) ──

CREATE TABLE agencies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text,
  city                text,
  ice                 text,
  rc                  text,
  email               text,
  phone               text,
  whatsapp_number     text,
  config              jsonb DEFAULT '{}'::jsonb,
  plan                text DEFAULT 'premium',
  seat_limit          integer DEFAULT 2,
  subscription_status text NOT NULL DEFAULT 'pending'
    CHECK (subscription_status IN ('pending', 'active', 'blocked'))
);

CREATE TABLE profiles (
  id         uuid PRIMARY KEY,
  full_name  text,
  email      text,
  phone      text,
  role       text DEFAULT 'admin' CHECK (role IN ('admin', 'staff')),
  agency_id  uuid REFERENCES agencies(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE vehicles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id),
  brand     text,
  model     text,
  status    text DEFAULT 'available'
);

CREATE TABLE clients (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id)
);

CREATE TABLE contracts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid REFERENCES agencies(id),
  vehicle_id   uuid REFERENCES vehicles(id),
  status       text DEFAULT 'active',
  pickup_date  timestamptz,
  return_date  timestamptz,
  total_amount numeric DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ── Pre-migration (vulnerable) state, as left by migrations 001–20260623 ──

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_own" ON agencies
  USING (id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());
-- An out-of-band policy with an unknown name, as staging may carry.
CREATE POLICY "hand patched on staging" ON profiles
  FOR ALL USING (id = auth.uid());

-- Seat-limit trigger from 007 (security invoker).
CREATE FUNCTION check_staff_seat_limit() RETURNS trigger AS $$
DECLARE v_limit integer; v_current integer;
BEGIN
  IF NEW.agency_id IS NULL OR NEW.role IS NULL THEN RETURN NEW; END IF;
  SELECT seat_limit INTO v_limit FROM agencies WHERE id = NEW.agency_id;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_current FROM profiles
   WHERE agency_id = NEW.agency_id AND role IS NOT NULL AND id <> NEW.id;
  IF v_current >= v_limit THEN RAISE EXCEPTION 'SEAT_LIMIT_REACHED'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_check_staff_seat_limit
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION check_staff_seat_limit();

-- Old onboard_new_agency: the 008 signature plus a legacy 3-arg overload.
CREATE FUNCTION onboard_new_agency(
  p_user_id uuid, p_agency_name text, p_full_name text, p_email text,
  p_phone text, p_city text, p_ice text, p_rc text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_agency_id uuid;
BEGIN
  INSERT INTO agencies (name) VALUES (p_agency_name) RETURNING id INTO v_agency_id;
  INSERT INTO profiles (id, full_name, role, agency_id)
    VALUES (p_user_id, p_full_name, 'admin', v_agency_id)
    ON CONFLICT (id) DO UPDATE SET agency_id = EXCLUDED.agency_id, role = 'admin';
  RETURN v_agency_id;
END; $$;
CREATE FUNCTION onboard_new_agency(p_user_id uuid, p_agency_name text, p_full_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_agency_id uuid;
BEGIN
  INSERT INTO agencies (name) VALUES (p_agency_name) RETURNING id INTO v_agency_id;
  INSERT INTO profiles (id, full_name, role, agency_id)
    VALUES (p_user_id, p_full_name, 'admin', v_agency_id)
    ON CONFLICT (id) DO UPDATE SET agency_id = EXCLUDED.agency_id, role = 'admin';
  RETURN v_agency_id;
END; $$;

CREATE FUNCTION get_available_vehicles(p_agency_id uuid, p_start_date date, p_end_date date)
RETURNS SETOF vehicles LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT v.* FROM vehicles v WHERE v.agency_id = p_agency_id;
$$;
CREATE FUNCTION get_dashboard_stats(p_agency_id uuid)
RETURNS json LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('total_vehicles', (SELECT COUNT(*) FROM vehicles WHERE agency_id = p_agency_id));
$$;

-- ── Seed ─────────────────────────────────────────────────────
-- Agencies: A (active), B (active), P (pending). All start with seat_limit 2
-- (the stale column default) so the migration's normalisation is exercised.

INSERT INTO agencies (id, name, subscription_status) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Agency A', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Agency B', 'active'),
  ('cccccccc-0000-0000-0000-000000000000', 'Agency P', 'pending');

INSERT INTO profiles (id, full_name, role, agency_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin A',   'admin', 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('a0000000-0000-0000-0000-000000000002', 'Staff A',   'staff', 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-000000000001', 'Admin B',   'admin', 'bbbbbbbb-0000-0000-0000-000000000000'),
  ('c0000000-0000-0000-0000-000000000001', 'Admin P',   'admin', 'cccccccc-0000-0000-0000-000000000000');
-- d0000000-…-1 = "newbie": signed up, no profile yet.
-- e0000000-…-1 / -2 = invited staff joining through the backend.

INSERT INTO vehicles (id, agency_id, brand, model, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Dacia',   'Logan',  'available'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Renault', 'Clio',   'available'),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Audi',    'A1',     'available');

-- Clio is booked 10–15 June; Agency B has closed revenue this month.
INSERT INTO contracts (agency_id, vehicle_id, status, pickup_date, return_date, total_amount) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002', 'active', '2030-06-10', '2030-06-15', 1000),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'closed', '2030-01-01', '2030-01-05', 5000);

-- ── Test helpers ─────────────────────────────────────────────

CREATE FUNCTION t_assert(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'TEST FAILED: %', msg; END IF;
END $$;
GRANT EXECUTE ON FUNCTION t_assert(boolean, text) TO anon, authenticated, service_role;

-- Sanity: the stub really is vulnerable before the migration (otherwise the
-- assertions below would prove nothing).
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  UPDATE profiles SET role = 'admin' WHERE id = 'a0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 1, 'stub should allow self-promotion before the migration');
  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('bbbbbbbb-0000-0000-0000-000000000000', '2030-01-01', '2030-01-02')) = 1,
                   'stub should leak another agency''s fleet before the migration');
END $$;
ROLLBACK;

-- ── Apply the migration (twice: must be idempotent) ──────────

\ir ../migrations/20261116_permissions_hardening.sql
\ir ../migrations/20261116_permissions_hardening.sql

SELECT t_assert(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'onboard_new_agency') = 1,
  'exactly one onboard_new_agency overload must remain');
SELECT t_assert(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
               AND policyname NOT IN ('profiles_select', 'profiles_update')),
  'no leftover policy may remain on profiles');
SELECT t_assert(
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agencies') = ARRAY['agencies_select', 'agencies_update_admin'],
  'agencies must carry exactly the select + admin-update policies');
SELECT t_assert((SELECT count(*) FROM agencies WHERE seat_limit IS NOT NULL) = 0,
                'existing agencies must be normalised to unlimited seats');

-- ── 1. profiles ──────────────────────────────────────────────

-- Staff A
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    UPDATE profiles SET role = 'admin' WHERE id = 'a0000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'TEST FAILED: staff self-promotion to admin was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET agency_id = 'bbbbbbbb-0000-0000-0000-000000000000'
     WHERE id = 'a0000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'TEST FAILED: moving own profile to another agency was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE profiles SET full_name = 'Staff A renamed', phone = '0600000000'
   WHERE id = 'a0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 1, 'a user must still be able to edit their own name/phone');

  UPDATE profiles SET full_name = 'hacked' WHERE id = 'a0000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 0, 'a user must not be able to edit a teammate''s profile');

  PERFORM t_assert((SELECT count(*) FROM profiles) = 2, 'a user sees own + teammates'' profiles only');
  PERFORM t_assert((SELECT count(*) FROM agencies) = 1, 'a user sees only their own agency');
END $$;
ROLLBACK;

-- Newbie (no profile) cannot self-insert into an agency
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO profiles (id, agency_id, role)
      VALUES ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin');
    RAISE EXCEPTION 'TEST FAILED: self-inserting a profile into another agency was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO profiles (id) VALUES ('d0000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST FAILED: self-inserting a profile (default role admin) was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

-- ── 2. agencies ──────────────────────────────────────────────

-- Pending agency admin cannot activate itself
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE agencies SET subscription_status = 'active' WHERE id = 'cccccccc-0000-0000-0000-000000000000';
    RAISE EXCEPTION 'TEST FAILED: a pending agency activated itself';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

-- Staff A cannot update or delete the agency
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  UPDATE agencies SET name = 'renamed by staff' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 0, 'staff must not be able to update the agency');

  DELETE FROM agencies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 0, 'staff must not be able to delete the agency');
END $$;
ROLLBACK;

-- Admin A: normal settings saves work, operator columns and delete do not
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  -- AgenceTab saves the whole row back, operator columns included but unchanged.
  UPDATE agencies
     SET name = 'Agency A renamed', city = 'Rabat', config = '{"rentalOptions":[]}'::jsonb,
         subscription_status = 'active', plan = 'premium', seat_limit = NULL
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 1, 'an admin must still be able to save agency settings');

  BEGIN
    UPDATE agencies SET seat_limit = 99 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
    RAISE EXCEPTION 'TEST FAILED: an admin changed seat_limit from the browser';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE agencies SET subscription_status = 'blocked' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
    RAISE EXCEPTION 'TEST FAILED: an admin changed subscription_status from the browser';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE agencies SET name = 'x' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 0, 'an admin must not be able to update another agency');

  DELETE FROM agencies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t_assert(n = 0, 'an admin must not be able to delete the agency from the browser');
END $$;
ROLLBACK;

-- ── 3. onboard_new_agency ────────────────────────────────────

-- Staff A cannot hijack Admin A's profile
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM onboard_new_agency('a0000000-0000-0000-0000-000000000001', 'Trap', 'x', NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'TEST FAILED: onboard_new_agency accepted another user''s id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM onboard_new_agency('a0000000-0000-0000-0000-000000000002', 'Second agency', 'x', NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'TEST FAILED: an already-onboarded user created a second agency';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

SELECT t_assert(
  (SELECT agency_id FROM profiles WHERE id = 'a0000000-0000-0000-0000-000000000001') = 'aaaaaaaa-0000-0000-0000-000000000000',
  'Admin A must still belong to Agency A');

-- Anonymous callers cannot execute it at all
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM onboard_new_agency('d0000000-0000-0000-0000-000000000001', 'Anon', 'x', NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'TEST FAILED: anon could execute onboard_new_agency';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

-- Newbie onboards normally (kept: committed, used by the seat-limit test below)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := onboard_new_agency('d0000000-0000-0000-0000-000000000001', 'Fresh Agency', 'New Admin',
                             'new@example.com', '0611111111', 'Casablanca', NULL, NULL);
  PERFORM t_assert(v_id IS NOT NULL, 'onboarding must return the new agency id');
  PERFORM t_assert((SELECT role FROM profiles WHERE id = 'd0000000-0000-0000-0000-000000000001') = 'admin',
                   'the onboarding user becomes admin of the new agency');
  PERFORM t_assert((SELECT subscription_status FROM agencies WHERE id = v_id) = 'pending',
                   'a new agency starts pending');
  PERFORM t_assert((SELECT seat_limit FROM agencies WHERE id = v_id) IS NULL,
                   'a new agency has no seat limit');
END $$;
COMMIT;

-- ── 4. Agency-scoped read RPCs ───────────────────────────────

BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('bbbbbbbb-0000-0000-0000-000000000000', '2030-01-01', '2030-01-02')) = 0,
                   'another agency''s fleet must not be readable');
  PERFORM t_assert(get_dashboard_stats('bbbbbbbb-0000-0000-0000-000000000000') IS NULL,
                   'another agency''s dashboard stats must not be readable');

  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('aaaaaaaa-0000-0000-0000-000000000000', '2030-01-01', '2030-01-02')) = 2,
                   'own fleet: both cars free outside the booking');
  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('aaaaaaaa-0000-0000-0000-000000000000', '2030-06-12', '2030-06-13')) = 1,
                   'own fleet: the booked car is excluded during its booking');
  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('aaaaaaaa-0000-0000-0000-000000000000', '2030-06-15', '2030-06-20')) = 2,
                   'own fleet: same-day turnover is still allowed');
  PERFORM t_assert((get_dashboard_stats('aaaaaaaa-0000-0000-0000-000000000000') ->> 'total_vehicles')::int = 2,
                   'own dashboard stats are returned');
END $$;
ROLLBACK;

-- ── Backend (service_role) keeps full control ────────────────

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v_fresh uuid;
BEGIN
  PERFORM t_assert((SELECT count(*) FROM get_available_vehicles('bbbbbbbb-0000-0000-0000-000000000000', '2030-01-01', '2030-01-02')) = 1,
                   'service_role can read any agency''s availability');

  -- PATCH /team/:id/role and DELETE /team/:id
  UPDATE profiles SET role = 'admin' WHERE id = 'a0000000-0000-0000-0000-000000000002';
  UPDATE profiles SET agency_id = NULL, role = NULL WHERE id = 'a0000000-0000-0000-0000-000000000002';
  PERFORM t_assert((SELECT agency_id FROM profiles WHERE id = 'a0000000-0000-0000-0000-000000000002') IS NULL,
                   'service_role can remove a member');

  -- POST /team/accept-invite: a 2nd and 3rd member join the agency created
  -- after the migration (would hit SEAT_LIMIT_REACHED with the old default 2).
  SELECT agency_id INTO v_fresh FROM profiles WHERE id = 'd0000000-0000-0000-0000-000000000001';
  INSERT INTO profiles (id, full_name, role, agency_id) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'Invited 1', 'staff', v_fresh),
    ('e0000000-0000-0000-0000-000000000002', 'Invited 2', 'staff', v_fresh);
  PERFORM t_assert((SELECT count(*) FROM profiles WHERE agency_id = v_fresh) = 3,
                   'invited staff can join through the backend without a seat-limit error');

  -- Operator activation
  UPDATE agencies SET subscription_status = 'active' WHERE id = v_fresh;
END $$;
ROLLBACK;

\echo ALL PERMISSION TESTS PASSED
