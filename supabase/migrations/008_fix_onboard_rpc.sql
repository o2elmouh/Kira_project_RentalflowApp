-- ─────────────────────────────────────────────────────────────
-- Migration 008 — Fix onboard_new_agency RPC
-- Persists email, phone, and whatsapp_number into agencies;
-- makes profile upsert idempotent for email and phone too.
-- ─────────────────────────────────────────────────────────────

-- Drop the old signature first — CREATE OR REPLACE fails when parameter
-- defaults differ from the existing overload in pg_proc.
DROP FUNCTION IF EXISTS onboard_new_agency(uuid, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION onboard_new_agency(
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
AS $$
DECLARE
  v_agency_id uuid;
BEGIN
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
