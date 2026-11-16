-- ─────────────────────────────────────────────────────────────
-- Migration 20261116 — Permissions hardening (profiles / agencies / RPCs)
-- ─────────────────────────────────────────────────────────────
--
-- Closes four holes that let a signed-in user act outside their own agency
-- or role straight from the browser (anon key + their own JWT):
--
--   1. profiles  — the UPDATE/INSERT policies only checked `id = auth.uid()`,
--                  so a user could set their own `role` and `agency_id`.
--   2. agencies  — `agency_own` had no FOR clause (= ALL), so any member could
--                  UPDATE every column (subscription_status, plan, seat_limit)
--                  and DELETE the agency row.
--   3. onboard_new_agency — SECURITY DEFINER, trusted the caller-supplied
--                  p_user_id and re-pointed that profile to a new agency.
--   4. get_available_vehicles / get_dashboard_stats — SECURITY DEFINER,
--                  filtered only on the caller-supplied p_agency_id.
--
-- After this migration `role` and `agency_id` are written only by the backend
-- (service_role: POST /team/accept-invite, PATCH /team/:id/role, DELETE
-- /team/:id) and by onboard_new_agency. The browser can no longer insert a
-- profile at all.
--
-- "End-user session" below means current_user IN ('authenticated','anon') —
-- the roles PostgREST switches to for browser requests. service_role, the SQL
-- editor (postgres) and SECURITY DEFINER functions owned by postgres are not
-- end-user sessions and pass the guards.
--
-- Idempotent: safe to run more than once. Existing policies on profiles and
-- agencies are dropped by lookup (not by name) because staging was patched
-- out-of-band in the past — a single leftover permissive policy would keep
-- the hole open, since policies for the same command are OR'd.

-- ── 0. Helpers ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_agency_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT agency_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_is_agency_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'admin' AND agency_id IS NOT NULL
  )
$$;

-- ── 1. profiles ──────────────────────────────────────────────

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Read: own row + teammates (unchanged semantics).
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR agency_id = public.user_agency_id()
  );

-- Update: own row only. Which columns may change is enforced by the trigger
-- below (RLS cannot compare OLD and NEW).
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT or DELETE policy: profiles are created by onboard_new_agency or
-- by the backend, never directly from the browser.

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.agency_id IS NOT NULL OR NEW.role IS NOT NULL THEN
      RAISE EXCEPTION 'profiles: role and agency_id cannot be set from a client session'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id        IS DISTINCT FROM OLD.id
     OR NEW.role      IS DISTINCT FROM OLD.role
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'profiles: role and agency_id cannot be changed from a client session'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_columns();

-- ── 2. agencies ──────────────────────────────────────────────

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'agencies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.agencies', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencies_select" ON public.agencies
  FOR SELECT USING (id = public.user_agency_id());

-- Every browser-side agencies write comes from an admin-only Settings tab
-- (AgenceTab, SignatureSection, RentalOptionsSection, TelematicsTab).
CREATE POLICY "agencies_update_admin" ON public.agencies
  FOR UPDATE USING (id = public.user_agency_id() AND public.user_is_agency_admin())
  WITH CHECK (id = public.user_agency_id() AND public.user_is_agency_admin());

-- No INSERT or DELETE policy: agencies are created by onboard_new_agency and
-- are never deleted from the browser.

-- Operator-managed columns. Compared through to_jsonb so the guard keeps
-- working on an environment where one of these columns has not been migrated
-- yet (a direct NEW.<col> reference would fail every agencies UPDATE there).
CREATE OR REPLACE FUNCTION public.agencies_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY ARRAY['id', 'subscription_status', 'plan', 'seat_limit']
  LOOP
    IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
      RAISE EXCEPTION 'agencies: % cannot be changed from a client session', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_guard_privileged_columns ON public.agencies;
CREATE TRIGGER trg_agencies_guard_privileged_columns
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_guard_privileged_columns();

-- Seat limit: 20260521b made every existing agency unlimited (NULL) but left
-- the column default at 2. Until now the limit never fired for invited staff,
-- because the seat-limit trigger read agencies under the invited user's RLS
-- and saw no row. Joins now go through the backend (service_role), which does
-- see the row — so without this, every agency created after 20260521b would
-- be capped at 2 members. Align the default with the "unlimited" intent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'seat_limit'
  ) THEN
    ALTER TABLE public.agencies ALTER COLUMN seat_limit SET DEFAULT NULL;
    UPDATE public.agencies SET seat_limit = NULL WHERE seat_limit IS NOT NULL;
  END IF;
END $$;

-- ── 3. onboard_new_agency ────────────────────────────────────
-- Drop every overload (001–008 created several signatures; any one left
-- behind stays callable through PostgREST with the old, unchecked body).

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('onboard_new_agency', 'get_available_vehicles', 'get_dashboard_stats')
  LOOP
    EXECUTE 'DROP FUNCTION ' || f.sig;
  END LOOP;
END $$;

CREATE FUNCTION public.onboard_new_agency(
  p_user_id     uuid,
  p_agency_name text,
  p_full_name   text,
  p_email       text,
  p_phone       text,
  p_city        text,
  p_ice         text,
  p_rc          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_agency_id uuid;
  v_existing  uuid;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'onboard_new_agency: p_user_id must be the calling user'
      USING ERRCODE = '42501';
  END IF;

  -- A user who already belongs to an agency must not be re-pointed to a new
  -- one (that would orphan their access to the existing agency's data).
  SELECT agency_id INTO v_existing FROM profiles WHERE id = p_user_id;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ONBOARDED: this account already belongs to an agency'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO agencies (name, city, ice, rc, email, phone, whatsapp_number)
    VALUES (p_agency_name, p_city, p_ice, p_rc, p_email, p_phone, p_phone)
    RETURNING id INTO v_agency_id;

  INSERT INTO profiles (id, full_name, email, phone, role, agency_id)
    VALUES (p_user_id, p_full_name, p_email, p_phone, 'admin', v_agency_id)
    ON CONFLICT (id) DO UPDATE
      SET full_name  = EXCLUDED.full_name,
          email      = EXCLUDED.email,
          phone      = EXCLUDED.phone,
          agency_id  = EXCLUDED.agency_id,
          role       = 'admin';

  RETURN v_agency_id;
END;
$$;

REVOKE ALL ON FUNCTION public.onboard_new_agency(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboard_new_agency(uuid, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onboard_new_agency(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

-- ── 4. Agency-scoped read RPCs ───────────────────────────────
-- Still SECURITY DEFINER (same behaviour for legitimate callers), but rows
-- are returned only when the caller belongs to p_agency_id, or the call
-- comes from the backend with the service_role key.

-- Availability rule is unchanged from 20260623 (period overlap only).
CREATE FUNCTION public.get_available_vehicles(
  p_agency_id  uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS SETOF vehicles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT v.*
    FROM vehicles v
   WHERE v.agency_id = p_agency_id
     AND (p_agency_id = public.user_agency_id() OR auth.role() = 'service_role')
     AND v.status NOT IN ('maintenance', 'retired')
     AND v.id NOT IN (
       SELECT c.vehicle_id
         FROM contracts c
        WHERE c.agency_id = p_agency_id
          AND c.status = 'active'
          AND c.pickup_date::DATE < p_end_date
          AND c.return_date::DATE > p_start_date
     )
   ORDER BY v.brand, v.model;
$$;

CREATE FUNCTION public.get_dashboard_stats(
  p_agency_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN p_agency_id = public.user_agency_id() OR auth.role() = 'service_role' THEN
      json_build_object(
        'total_vehicles',     (SELECT COUNT(*) FROM vehicles  WHERE agency_id = p_agency_id),
        'rented_vehicles',    (SELECT COUNT(*) FROM vehicles  WHERE agency_id = p_agency_id AND status = 'rented'),
        'available_vehicles', (SELECT COUNT(*) FROM vehicles  WHERE agency_id = p_agency_id AND status = 'available'),
        'active_contracts',   (SELECT COUNT(*) FROM contracts WHERE agency_id = p_agency_id AND status = 'active'),
        'monthly_revenue',    (SELECT COALESCE(SUM(total_amount), 0)
                                 FROM contracts
                                WHERE agency_id = p_agency_id
                                  AND status    = 'closed'
                                  AND date_trunc('month', created_at) = date_trunc('month', now())),
        'total_clients',      (SELECT COUNT(*) FROM clients   WHERE agency_id = p_agency_id)
      )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_available_vehicles(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_vehicles(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_vehicles(uuid, date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated, service_role;
