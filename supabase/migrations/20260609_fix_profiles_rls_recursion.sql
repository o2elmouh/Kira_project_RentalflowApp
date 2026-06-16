-- ============================================================
-- Migration 20260609 — Fix infinite recursion in profiles RLS
-- ============================================================
-- Root cause: the profiles_select policy from 003_auth_fix.sql contains
-- a self-referencing subquery:
--
--   USING (
--     agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1)
--     OR id = auth.uid()
--   )
--
-- Postgres re-evaluates the same policy on the inner SELECT → infinite
-- recursion → 42P17 → PostgREST 500. Affects every authenticated table
-- query that joins through profiles (agency_isolation pattern).
--
-- Discovered against the fresh prod Supabase (apzarvjxvwtlphdqirjm) right
-- after the v1.16.2 cutover. Staging had been patched out-of-band at some
-- point but this fix was never captured as a migration file, so the bug
-- only surfaced on the clean prod schema rebuild.
--
-- Fix: extract the subquery into a SECURITY DEFINER helper that bypasses
-- RLS, then rewrite profiles_select to use it.

-- 1. SECURITY DEFINER helper — returns the caller's agency_id without
--    triggering RLS on profiles. Runs as the function owner, so the
--    inner SELECT bypasses the policy entirely.
CREATE OR REPLACE FUNCTION public.user_agency_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT agency_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

-- 2. Drop EVERY existing SELECT/UPDATE policy on profiles. Multiple
--    policies on the same action are OR'd — leaving a recursive one
--    in place still triggers 42P17 even if the others are fixed.
--    Known names from 001_initial_schema.sql and 003_auth_fix.sql:
DROP POLICY IF EXISTS "profiles_same_agency" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- 3. Recreate profiles_select using the helper. Same semantics as the
--    union of profiles_same_agency + profiles_select_own from the old
--    migrations: a user can read their own profile OR any profile in
--    the same agency.
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR agency_id = public.user_agency_id()
  );

-- 4. Recreate profiles_update for the same reason.
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR agency_id = public.user_agency_id()
  );
