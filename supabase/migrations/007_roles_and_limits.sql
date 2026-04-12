-- Migration 007: rename agent→staff, add seat limits, enforce via trigger
-- Run on: Supabase SQL Editor

-- 1. Migrate existing data first (before changing constraint)
UPDATE profiles SET role = 'staff' WHERE role = 'agent';

-- 2. Drop old role constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 3. Add new constraint with 'staff' instead of 'agent'
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff'));

-- 4. Add seat_limit to agencies (plan-based: free=2, premium=unlimited=NULL)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS seat_limit integer DEFAULT 2;

-- Set existing premium agencies to NULL (unlimited)
UPDATE agencies SET seat_limit = NULL WHERE plan = 'premium';

-- 5. Trigger function: enforce seat limit on INSERT/UPDATE to profiles
CREATE OR REPLACE FUNCTION check_staff_seat_limit()
RETURNS trigger AS $$
DECLARE
  v_limit    integer;
  v_current  integer;
BEGIN
  -- Only enforce when assigning an agency_id and a role
  IF NEW.agency_id IS NULL OR NEW.role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the seat limit for this agency
  SELECT seat_limit INTO v_limit
  FROM agencies WHERE id = NEW.agency_id;

  -- NULL means unlimited (premium plan)
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count current members (excluding the row being updated)
  SELECT COUNT(*) INTO v_current
  FROM profiles
  WHERE agency_id = NEW.agency_id
    AND role IS NOT NULL
    AND id <> NEW.id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Agency has reached its seat limit of % members. Upgrade to premium for unlimited seats.', v_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach the trigger
DROP TRIGGER IF EXISTS trg_check_staff_seat_limit ON profiles;
CREATE TRIGGER trg_check_staff_seat_limit
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION check_staff_seat_limit();
