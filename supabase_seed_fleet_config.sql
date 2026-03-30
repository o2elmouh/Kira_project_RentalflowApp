-- ============================================================
-- RentaFlow — Fleet Config Seed
-- Run AFTER rentaflow_schema.sql
-- Inserts default fleet config for all brands into the
-- authenticated user's agency. Run once per agency.
-- ============================================================

-- Replace this with your actual agency UUID from the agencies table:
-- SELECT id FROM agencies LIMIT 1;
DO $$
DECLARE
  v_agency_id UUID := (SELECT id FROM agencies LIMIT 1);
BEGIN
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency found. Complete onboarding first.';
  END IF;

  INSERT INTO fleet_config (agency_id, brand, warranty_years, warranty_general, warranty_battery, warranty_extension, control_tech_years, oil_change_km, timing_belt_km)
  VALUES
    (v_agency_id, 'Alfa Romeo',    2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Alpine',        3, '3 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Audi',          2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'BMW',           3, '3 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'BYD',           6, '6 ans ou 150 000 km',        '8 ans ou 160 000 km',  'Non (incluse)',                             5, 10000, 80000),
    (v_agency_id, 'Chery / Omoda', 5, '5 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Citroën',       2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Dacia',         3, '3 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Oui – jusqu''à 7 ans (programme Zen)',     5, 10000, 80000),
    (v_agency_id, 'DS',            2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Fiat',          2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Ford',          2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Geely',         5, '5 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Honda',         3, '3 ans ou 100 000 km',        '—',                    'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Hyundai',       5, '5 ans · km illimité',       '8 ans ou 160 000 km',  'Non (incluse)',                             5, 10000, 80000),
    (v_agency_id, 'Jaguar',        3, '3 ans · km illimité',       '—',                    'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Jeep',          2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Kia',           7, '7 ans ou 150 000 km',        '7 ans ou 150 000 km',  'Oui – jusqu''à 10 ans (EU)',               5, 10000, 80000),
    (v_agency_id, 'Land Rover',    3, '3 ans ou 100 000 km',        '—',                    'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Leapmotor',     5, '5 ans ou 150 000 km',        '8 ans ou 160 000 km',  'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Lexus',         3, '3 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Oui (programme Relax)',                     5, 10000, 80000),
    (v_agency_id, 'Mazda',         3, '3 ans ou 100 000 km',        '—',                    'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Mercedes',      2, '2 ans · km illimité',       '10 ans ou 250 000 km', 'Oui – jusqu''à 4 ans ou 150 000 km',      5, 10000, 80000),
    (v_agency_id, 'MG',            6, '6 ans ou 150 000 km',        '8 ans ou 160 000 km',  'Non (incluse)',                             5, 10000, 80000),
    (v_agency_id, 'MINI',          3, '3 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Mitsubishi',    5, '5 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Nissan',        3, '3 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Opel',          5, '5 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Peugeot',       2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui – jusqu''à 8 ans (Stellantis)',        5, 10000, 80000),
    (v_agency_id, 'Renault',       2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Seat / Cupra',  2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Skoda',         2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Suzuki',        3, '3 ans ou 100 000 km',        '—',                    'Non',                                       5, 10000, 80000),
    (v_agency_id, 'Toyota',        3, '3 ans ou 100 000 km',        '8 ans ou 160 000 km',  'Oui – jusqu''à 10 ans (programme Relax)', 5, 10000, 80000),
    (v_agency_id, 'Volkswagen',    2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000),
    (v_agency_id, 'Volvo',         2, '2 ans · km illimité',       '8 ans ou 160 000 km',  'Oui (payante)',                             5, 10000, 80000)
  ON CONFLICT (agency_id, brand) DO NOTHING;

  RAISE NOTICE 'Fleet config seeded for agency %', v_agency_id;
END $$;
