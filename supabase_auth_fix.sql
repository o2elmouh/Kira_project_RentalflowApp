-- ============================================================
-- RentaFlow — Auth fixes (appliquer dans Supabase SQL Editor)
-- ============================================================

-- FIX 1: profiles SELECT — permettre à chaque user de lire son propre profil
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

-- FIX 2: profiles INSERT — permettre l'auto-insertion lors de l'onboarding
DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- FIX 3: onboard_new_agency — version sécurisée et complète
--   - Valide que l'appelant est bien p_user_id
--   - Désactive RLS localement pour l'INSERT initial
--   - Accepte p_city directement (évite un UPDATE séparé qui peut échouer)
--   - Idempotent : retourne l'agency_id existant si le profil existe déjà
CREATE OR REPLACE FUNCTION onboard_new_agency(
  p_user_id       UUID,
  p_agency_name   TEXT,
  p_full_name     TEXT,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_city          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
