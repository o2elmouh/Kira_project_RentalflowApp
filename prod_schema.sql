


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."contract_status" AS ENUM (
    'draft',
    'active',
    'completed',
    'cancelled',
    'closed'
);


ALTER TYPE "public"."contract_status" OWNER TO "postgres";


CREATE TYPE "public"."fuel_type" AS ENUM (
    'gasoline',
    'diesel',
    'electric',
    'hybrid'
);


ALTER TYPE "public"."fuel_type" OWNER TO "postgres";


CREATE TYPE "public"."id_document_type" AS ENUM (
    'cin',
    'passport',
    'driving_license',
    'residence_permit'
);


ALTER TYPE "public"."id_document_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'cash',
    'card',
    'bank_transfer',
    'cheque'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'partial',
    'paid',
    'refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."transmission_type" AS ENUM (
    'manual',
    'automatic'
);


ALTER TYPE "public"."transmission_type" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_status" AS ENUM (
    'available',
    'rented',
    'maintenance',
    'retired'
);


ALTER TYPE "public"."vehicle_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_staff_seat_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_limit    integer;
  v_current  integer;
BEGIN
  IF NEW.agency_id IS NULL OR NEW.role IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT seat_limit INTO v_limit
  FROM agencies WHERE id = NEW.agency_id;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

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
$$;


ALTER FUNCTION "public"."check_staff_seat_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_contract_number"("p_agency_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."generate_contract_number"("p_agency_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "brand" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year" integer,
    "color" "text",
    "plate_number" "text" NOT NULL,
    "vin" "text",
    "fuel_type" "public"."fuel_type" DEFAULT 'gasoline'::"public"."fuel_type" NOT NULL,
    "transmission" "public"."transmission_type" DEFAULT 'manual'::"public"."transmission_type" NOT NULL,
    "seats" integer DEFAULT 5 NOT NULL,
    "doors" integer DEFAULT 4 NOT NULL,
    "mileage" integer DEFAULT 0 NOT NULL,
    "status" "public"."vehicle_status" DEFAULT 'available'::"public"."vehicle_status" NOT NULL,
    "daily_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "deposit_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "image_url" "text"[],
    "purchase_price" numeric(10,2),
    "residual_value" numeric(10,2),
    "purchase_date" "date",
    "expected_lifespan_years" integer DEFAULT 5 NOT NULL,
    "max_km_enabled" boolean DEFAULT false NOT NULL,
    "max_km_per_day" integer,
    "insurance_policy_num" "text",
    "insurance_expiry" "date",
    "vignette_expiry" "date",
    "control_tech_expiry" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_vehicles"("p_agency_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS SETOF "public"."vehicles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."get_available_vehicles"("p_agency_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("p_agency_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."get_dashboard_stats"("p_agency_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_agency_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT agency_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."my_agency_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Create agency
  INSERT INTO agencies (name, email, phone)
  VALUES (p_agency_name, p_email, p_phone)
  RETURNING id INTO v_agency_id;

  -- Create owner profile
  INSERT INTO profiles (id, agency_id, full_name, role, phone)
  VALUES (p_user_id, v_agency_id, p_full_name, 'owner', p_phone);

  RETURN v_agency_id;
END;
$$;


ALTER FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Sécurité : vérifier que l'appelant est authentifié et correspond à p_user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot create profile for another user';
  END IF;

  -- Idempotence : si le profil existe déjà, retourner l'agency_id existant
  SELECT agency_id INTO v_agency_id FROM profiles WHERE id = p_user_id;
  IF v_agency_id IS NOT NULL THEN
    RETURN v_agency_id;
  END IF;

  -- Désactiver RLS pour les INSERTs de cette transaction
  SET LOCAL row_security = off;

  -- Créer l'agence
  INSERT INTO agencies (name, email, phone, city)
  VALUES (p_agency_name, p_email, p_phone, p_city)
  RETURNING id INTO v_agency_id;

  -- Créer le profil propriétaire
  INSERT INTO profiles (id, agency_id, full_name, role, phone)
  VALUES (p_user_id, v_agency_id, p_full_name, 'owner', p_phone);

  RETURN v_agency_id;
END;
$$;


ALTER FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text", "p_ice" "text", "p_rc" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text", "p_ice" "text", "p_rc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE IF NOT EXISTS AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_set_contract_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    NEW.contract_number := generate_contract_number(NEW.agency_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_set_contract_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_sync_vehicle_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_fn_sync_vehicle_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_update_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_fn_update_payment_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_belongs_to_agency"("p_agency_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id        = auth.uid()
       AND agency_id = p_agency_id
       AND is_active = TRUE
  );
$$;


ALTER FUNCTION "public"."user_belongs_to_agency"("p_agency_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "normal_balance" "text" NOT NULL,
    "category" "text",
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "accounts_normal_balance_check" CHECK (("normal_balance" = ANY (ARRAY['debit'::"text", 'credit'::"text"]))),
    CONSTRAINT "accounts_type_check" CHECK (("type" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'revenue'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "logo_url" "text",
    "ice" "text",
    "rc" "text",
    "if_number" "text",
    "patente" "text",
    "currency" "text" DEFAULT 'MAD'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Casablanca'::"text" NOT NULL,
    "contract_prefix" "text" DEFAULT 'CTR'::"text" NOT NULL,
    "next_contract_num" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "push_token" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "whatsapp_number" "text",
    "gmail_address" "text",
    "gmail_app_password" "text",
    "seat_limit" integer DEFAULT 2,
    "gmail_last_polled" timestamp with time zone,
    CONSTRAINT "agencies_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."agencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "phone2" "text",
    "nationality" "text" DEFAULT 'MA'::"text" NOT NULL,
    "id_type" "public"."id_document_type" DEFAULT 'cin'::"public"."id_document_type" NOT NULL,
    "id_number" "text" NOT NULL,
    "id_expiry" "date",
    "driving_license_num" "text",
    "driving_license_expiry" "date",
    "date_of_birth" "date",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'MA'::"text" NOT NULL,
    "flag_category" "text",
    "flag_note" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clients_flag_category_check" CHECK (("flag_category" = ANY (ARRAY['Impayé'::"text", 'Dommage non remboursé'::"text", 'Litige'::"text", 'Blacklist'::"text", 'Autre'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_photos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "phase" "text" NOT NULL,
    "slot" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_photos_phase_check" CHECK (("phase" = ANY (ARRAY['pickup'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."contract_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "contract_number" "text" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "public"."contract_status" DEFAULT 'draft'::"public"."contract_status" NOT NULL,
    "pickup_date" timestamp with time zone NOT NULL,
    "return_date" timestamp with time zone NOT NULL,
    "actual_return_date" timestamp with time zone,
    "pickup_location" "text",
    "return_location" "text",
    "daily_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_days" integer DEFAULT 1 NOT NULL,
    "extra_fees" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "deposit_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "deposit_returned" boolean DEFAULT false NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'cash'::"public"."payment_method" NOT NULL,
    "payment_status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "mileage_start" integer,
    "mileage_end" integer,
    "fuel_level_start" "text",
    "fuel_level_end" "text",
    "signature_url" "text",
    "prolonged_from_id" "uuid",
    "extra_driver_name" "text",
    "extra_driver_license" "text",
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "client_name" "text",
    "vehicle_name" "text",
    "amount" numeric(12,2),
    "status" "text" DEFAULT 'held'::"text",
    "held_at" "text",
    "released_at" "text",
    "released_amount" numeric(12,2) DEFAULT 0,
    "deductions" "jsonb" DEFAULT '[]'::"jsonb",
    "transaction_id" "uuid",
    "release_transaction_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deposits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "vehicle_id" "uuid",
    "contract_id" "uuid",
    "document_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "ocr_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ocr_raw" "jsonb",
    "ocr_extracted" "jsonb",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['cin'::"text", 'passport'::"text", 'driving_license'::"text", 'insurance'::"text", 'inspection'::"text", 'other'::"text"]))),
    CONSTRAINT "documents_ocr_status_check" CHECK (("ocr_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fleet_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "brand" "text" NOT NULL,
    "warranty_years" integer DEFAULT 3 NOT NULL,
    "control_tech_years" integer DEFAULT 5 NOT NULL,
    "oil_change_km" integer DEFAULT 10000 NOT NULL,
    "timing_belt_km" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "warranty_general" "text",
    "warranty_battery" "text",
    "warranty_extension" "text"
);


ALTER TABLE "public"."fleet_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "client_id" "uuid",
    "invoice_number" "text",
    "contract_number" "text",
    "client_name" "text",
    "vehicle_name" "text",
    "total_ht" numeric(12,2),
    "tva" numeric(12,2),
    "total_ttc" numeric(12,2),
    "days" integer,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "transaction_id" "uuid",
    "transaction_ref" "text",
    "date" "date",
    "description" "text",
    "account_code" "text",
    "account_name" "text",
    "debit" numeric(12,2) DEFAULT 0,
    "credit" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "method" "public"."payment_method" DEFAULT 'cash'::"public"."payment_method" NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_demands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "sender_id" "text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "extracted_data" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "media_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "merged_with_id" "uuid",
    "confidence_scores" "jsonb",
    "match_score" double precision,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "offered_vehicle_id" "uuid",
    "offered_price_total" numeric,
    "last_client_note" "text",
    CONSTRAINT "pending_demands_source_check" CHECK (("source" = ANY (ARRAY['whatsapp'::"text", 'gmail'::"text"]))),
    CONSTRAINT "pending_demands_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'ignored'::"text", 'waiting'::"text", 'offer_sent'::"text", 'accepted'::"text", 'converted'::"text"])))
);


ALTER TABLE "public"."pending_demands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" DEFAULT 'agent'::"text" NOT NULL,
    "phone" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repairs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "repair_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text" NOT NULL,
    "cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "mileage_at_repair" integer,
    "repair_type" "text",
    "garage" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "repairs_repair_type_check" CHECK (("repair_type" = ANY (ARRAY['maintenance'::"text", 'repair'::"text", 'inspection'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "vehicle_id" "uuid",
    "phase" "text",
    "mileage" integer,
    "fuel" "text",
    "lat" numeric(10,6),
    "lng" numeric(10,6),
    "engine_on" boolean,
    "dtc_codes" "jsonb" DEFAULT '[]'::"jsonb",
    "provider" "text",
    "raw_data" "jsonb",
    "taken_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "snapshots_phase_check" CHECK (("phase" = ANY (ARRAY['start'::"text", 'end'::"text"])))
);


ALTER TABLE "public"."snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "reference" "text",
    "date" "date",
    "description" "text",
    "type" "text",
    "amount" numeric(12,2),
    "contract_id" "uuid",
    "invoice_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_active_contracts" AS
 SELECT "c"."id",
    "c"."agency_id",
    "c"."contract_number",
    "c"."status",
    "c"."pickup_date",
    "c"."return_date",
    "c"."actual_return_date",
    "c"."daily_rate",
    "c"."total_days",
    "c"."total_amount",
    "c"."amount_paid",
    "c"."payment_status",
    "c"."deposit_amount",
    "c"."deposit_returned",
    "v"."brand" AS "vehicle_brand",
    "v"."model" AS "vehicle_model",
    "v"."plate_number" AS "vehicle_plate",
    "v"."color" AS "vehicle_color",
    "cl"."first_name" AS "client_first_name",
    "cl"."last_name" AS "client_last_name",
    "cl"."phone" AS "client_phone",
    "cl"."email" AS "client_email",
    "cl"."id_number" AS "client_id_number",
    "cl"."flag_category" AS "client_flag"
   FROM (("public"."contracts" "c"
     JOIN "public"."vehicles" "v" ON (("v"."id" = "c"."vehicle_id")))
     JOIN "public"."clients" "cl" ON (("cl"."id" = "c"."client_id")))
  WHERE ("c"."status" = 'active'::"public"."contract_status");


ALTER VIEW "public"."v_active_contracts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_flagged_clients" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "agency_id",
    NULL::"text" AS "first_name",
    NULL::"text" AS "last_name",
    NULL::"text" AS "phone",
    NULL::"text" AS "email",
    NULL::"text" AS "id_number",
    NULL::"text" AS "flag_category",
    NULL::"text" AS "flag_note",
    NULL::bigint AS "total_contracts";


ALTER VIEW "public"."v_flagged_clients" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_monthly_revenue" AS
 SELECT "agency_id",
    ("date_trunc"('month'::"text", "paid_at"))::"date" AS "month",
    "count"(*) AS "payment_count",
    "sum"("amount") AS "total_revenue"
   FROM "public"."payments"
  GROUP BY "agency_id", ("date_trunc"('month'::"text", "paid_at"))
  ORDER BY "agency_id", (("date_trunc"('month'::"text", "paid_at"))::"date") DESC;


ALTER VIEW "public"."v_monthly_revenue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_vehicles_maintenance" AS
 SELECT "v"."id",
    "v"."agency_id",
    "v"."brand",
    "v"."model",
    "v"."plate_number",
    "v"."status",
    "v"."mileage",
    "v"."insurance_expiry",
    "v"."vignette_expiry",
    "v"."control_tech_expiry",
    "fc"."oil_change_km",
    "fc"."timing_belt_km",
    "fc"."warranty_years",
    "r_last"."repair_date" AS "last_repair_date",
    "r_last"."mileage_at_repair" AS "last_repair_mileage",
    "r_last"."repair_type" AS "last_repair_type",
        CASE
            WHEN ("r_last"."mileage_at_repair" IS NOT NULL) THEN ("v"."mileage" - "r_last"."mileage_at_repair")
            ELSE NULL::integer
        END AS "km_since_last_repair"
   FROM (("public"."vehicles" "v"
     LEFT JOIN "public"."fleet_config" "fc" ON ((("fc"."agency_id" = "v"."agency_id") AND ("fc"."brand" = "v"."brand"))))
     LEFT JOIN LATERAL ( SELECT "repairs"."repair_date",
            "repairs"."mileage_at_repair",
            "repairs"."repair_type"
           FROM "public"."repairs"
          WHERE ("repairs"."vehicle_id" = "v"."id")
          ORDER BY "repairs"."repair_date" DESC
         LIMIT 1) "r_last" ON (true));


ALTER VIEW "public"."v_vehicles_maintenance" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_agency_id_code_key" UNIQUE ("agency_id", "code");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_photos"
    ADD CONSTRAINT "contract_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_agency_id_contract_number_key" UNIQUE ("agency_id", "contract_number");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fleet_config"
    ADD CONSTRAINT "fleet_config_agency_id_brand_key" UNIQUE ("agency_id", "brand");



ALTER TABLE ONLY "public"."fleet_config"
    ADD CONSTRAINT "fleet_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_demands"
    ADD CONSTRAINT "pending_demands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repairs"
    ADD CONSTRAINT "repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."snapshots"
    ADD CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "unique_agency_email" UNIQUE ("email");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_agency_id_plate_number_key" UNIQUE ("agency_id", "plate_number");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_clients_agency_id" ON "public"."clients" USING "btree" ("agency_id");



CREATE INDEX "idx_clients_id_number" ON "public"."clients" USING "btree" ("id_number");



CREATE INDEX "idx_contract_photos_agency_id" ON "public"."contract_photos" USING "btree" ("agency_id");



CREATE INDEX "idx_contract_photos_contract_id" ON "public"."contract_photos" USING "btree" ("contract_id");



CREATE INDEX "idx_contracts_agency_id" ON "public"."contracts" USING "btree" ("agency_id");



CREATE INDEX "idx_contracts_client_id" ON "public"."contracts" USING "btree" ("client_id");



CREATE INDEX "idx_contracts_pickup_date" ON "public"."contracts" USING "btree" ("pickup_date");



CREATE INDEX "idx_contracts_return_date" ON "public"."contracts" USING "btree" ("return_date");



CREATE INDEX "idx_contracts_status" ON "public"."contracts" USING "btree" ("status");



CREATE INDEX "idx_contracts_vehicle_id" ON "public"."contracts" USING "btree" ("vehicle_id");



CREATE INDEX "idx_documents_agency_id" ON "public"."documents" USING "btree" ("agency_id");



CREATE INDEX "idx_documents_client_id" ON "public"."documents" USING "btree" ("client_id");



CREATE INDEX "idx_documents_contract_id" ON "public"."documents" USING "btree" ("contract_id");



CREATE INDEX "idx_documents_vehicle_id" ON "public"."documents" USING "btree" ("vehicle_id");



CREATE INDEX "idx_fleet_config_agency_id" ON "public"."fleet_config" USING "btree" ("agency_id");



CREATE INDEX "idx_fleet_config_brand" ON "public"."fleet_config" USING "btree" ("brand");



CREATE INDEX "idx_payments_agency_id" ON "public"."payments" USING "btree" ("agency_id");



CREATE INDEX "idx_payments_contract_id" ON "public"."payments" USING "btree" ("contract_id");



CREATE INDEX "idx_repairs_agency_id" ON "public"."repairs" USING "btree" ("agency_id");



CREATE INDEX "idx_repairs_repair_date" ON "public"."repairs" USING "btree" ("repair_date");



CREATE INDEX "idx_repairs_vehicle_id" ON "public"."repairs" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicles_agency_id" ON "public"."vehicles" USING "btree" ("agency_id");



CREATE INDEX "idx_vehicles_brand" ON "public"."vehicles" USING "btree" ("brand");



CREATE INDEX "idx_vehicles_status" ON "public"."vehicles" USING "btree" ("status");



CREATE INDEX "journal_entries_transaction_idx" ON "public"."journal_entries" USING "btree" ("transaction_id");



CREATE INDEX "pending_demands_agency_status" ON "public"."pending_demands" USING "btree" ("agency_id", "status", "created_at" DESC);



CREATE INDEX "snapshots_contract_idx" ON "public"."snapshots" USING "btree" ("contract_id");



CREATE INDEX "snapshots_vehicle_idx" ON "public"."snapshots" USING "btree" ("vehicle_id");



CREATE OR REPLACE VIEW "public"."v_flagged_clients" AS
 SELECT "c"."id",
    "c"."agency_id",
    "c"."first_name",
    "c"."last_name",
    "c"."phone",
    "c"."email",
    "c"."id_number",
    "c"."flag_category",
    "c"."flag_note",
    "count"("ct"."id") AS "total_contracts"
   FROM ("public"."clients" "c"
     LEFT JOIN "public"."contracts" "ct" ON (("ct"."client_id" = "c"."id")))
  WHERE ("c"."flag_category" IS NOT NULL)
  GROUP BY "c"."id";



CREATE OR REPLACE TRIGGER "pending_demands_updated_at" BEFORE UPDATE ON "public"."pending_demands" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agencies_updated_at" BEFORE UPDATE ON "public"."agencies" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_check_staff_seat_limit" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."check_staff_seat_limit"();



CREATE OR REPLACE TRIGGER "trg_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_contracts_set_number" BEFORE INSERT ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_set_contract_number"();



CREATE OR REPLACE TRIGGER "trg_contracts_sync_vehicle_status" AFTER UPDATE ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_sync_vehicle_status"();



CREATE OR REPLACE TRIGGER "trg_contracts_updated_at" BEFORE UPDATE ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_fleet_config_updated_at" BEFORE UPDATE ON "public"."fleet_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_payments_update_contract" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_update_payment_status"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_repairs_updated_at" BEFORE UPDATE ON "public"."repairs" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "trg_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_photos"
    ADD CONSTRAINT "contract_photos_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_photos"
    ADD CONSTRAINT "contract_photos_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_prolonged_from_id_fkey" FOREIGN KEY ("prolonged_from_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fleet_config"
    ADD CONSTRAINT "fleet_config_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pending_demands"
    ADD CONSTRAINT "pending_demands_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_demands"
    ADD CONSTRAINT "pending_demands_merged_with_id_fkey" FOREIGN KEY ("merged_with_id") REFERENCES "public"."pending_demands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_demands"
    ADD CONSTRAINT "pending_demands_offered_vehicle_id_fkey" FOREIGN KEY ("offered_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."repairs"
    ADD CONSTRAINT "repairs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."repairs"
    ADD CONSTRAINT "repairs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."snapshots"
    ADD CONSTRAINT "snapshots_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."snapshots"
    ADD CONSTRAINT "snapshots_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agencies_select" ON "public"."agencies" FOR SELECT USING ("public"."user_belongs_to_agency"("id"));



CREATE POLICY "agencies_update" ON "public"."agencies" FOR UPDATE USING ("public"."user_belongs_to_agency"("id"));



CREATE POLICY "agency_accounts" ON "public"."accounts" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_deposits" ON "public"."deposits" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_invoices" ON "public"."invoices" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_isolation" ON "public"."pending_demands" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_journal_entries" ON "public"."journal_entries" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_snapshots" ON "public"."snapshots" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "agency_transactions" ON "public"."transactions" USING (("agency_id" = ( SELECT "profiles"."agency_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete" ON "public"."clients" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "clients_insert" ON "public"."clients" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "clients_select" ON "public"."clients" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "clients_update" ON "public"."clients" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."contract_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contract_photos_delete" ON "public"."contract_photos" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "contract_photos_insert" ON "public"."contract_photos" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "contract_photos_select" ON "public"."contract_photos" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contracts_delete" ON "public"."contracts" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "contracts_insert" ON "public"."contracts" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "contracts_select" ON "public"."contracts" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "contracts_update" ON "public"."contracts" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."deposits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_delete" ON "public"."documents" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "documents_insert" ON "public"."documents" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "documents_select" ON "public"."documents" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "documents_update" ON "public"."documents" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."fleet_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fleet_config_delete" ON "public"."fleet_config" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "fleet_config_insert" ON "public"."fleet_config" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "fleet_config_select" ON "public"."fleet_config" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "fleet_config_update" ON "public"."fleet_config" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_insert" ON "public"."payments" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "payments_update" ON "public"."payments" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."pending_demands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((("agency_id" = ( SELECT "profiles_1"."agency_id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())
 LIMIT 1)) OR ("id" = "auth"."uid"())));



ALTER TABLE "public"."repairs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "repairs_delete" ON "public"."repairs" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "repairs_insert" ON "public"."repairs" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "repairs_select" ON "public"."repairs" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "repairs_update" ON "public"."repairs" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



ALTER TABLE "public"."snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete" ON "public"."vehicles" FOR DELETE USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "vehicles_insert" ON "public"."vehicles" FOR INSERT WITH CHECK ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "vehicles_select" ON "public"."vehicles" FOR SELECT USING ("public"."user_belongs_to_agency"("agency_id"));



CREATE POLICY "vehicles_update" ON "public"."vehicles" FOR UPDATE USING ("public"."user_belongs_to_agency"("agency_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_staff_seat_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_staff_seat_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_staff_seat_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_contract_number"("p_agency_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_contract_number"("p_agency_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_contract_number"("p_agency_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_vehicles"("p_agency_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_vehicles"("p_agency_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_vehicles"("p_agency_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_agency_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_agency_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_agency_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_agency_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_agency_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_agency_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text", "p_ice" "text", "p_rc" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text", "p_ice" "text", "p_rc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_new_agency"("p_user_id" "uuid", "p_agency_name" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_city" "text", "p_ice" "text", "p_rc" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_set_contract_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_set_contract_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_set_contract_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_sync_vehicle_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_sync_vehicle_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_sync_vehicle_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_update_payment_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_update_payment_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_update_payment_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_belongs_to_agency"("p_agency_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_belongs_to_agency"("p_agency_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_belongs_to_agency"("p_agency_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."agencies" TO "anon";
GRANT ALL ON TABLE "public"."agencies" TO "authenticated";
GRANT ALL ON TABLE "public"."agencies" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."contract_photos" TO "anon";
GRANT ALL ON TABLE "public"."contract_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_photos" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."deposits" TO "anon";
GRANT ALL ON TABLE "public"."deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."deposits" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."fleet_config" TO "anon";
GRANT ALL ON TABLE "public"."fleet_config" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_config" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pending_demands" TO "anon";
GRANT ALL ON TABLE "public"."pending_demands" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_demands" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."repairs" TO "anon";
GRANT ALL ON TABLE "public"."repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."repairs" TO "service_role";



GRANT ALL ON TABLE "public"."snapshots" TO "anon";
GRANT ALL ON TABLE "public"."snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."v_active_contracts" TO "anon";
GRANT ALL ON TABLE "public"."v_active_contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."v_active_contracts" TO "service_role";



GRANT ALL ON TABLE "public"."v_flagged_clients" TO "anon";
GRANT ALL ON TABLE "public"."v_flagged_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."v_flagged_clients" TO "service_role";



GRANT ALL ON TABLE "public"."v_monthly_revenue" TO "anon";
GRANT ALL ON TABLE "public"."v_monthly_revenue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_monthly_revenue" TO "service_role";



GRANT ALL ON TABLE "public"."v_vehicles_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."v_vehicles_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_vehicles_maintenance" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







