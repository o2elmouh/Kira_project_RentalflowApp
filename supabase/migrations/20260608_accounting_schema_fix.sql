-- ─────────────────────────────────────────────────────────────
-- Migration 20260608 — Accounting schema fix + seed
-- (1) Adds columns the application code writes but the original
--     migrations never created (transactions.total_amount / invoice_id,
--     journal_entries.transaction_ref / account_name, deposits.client_name
--     / vehicle_name / deductions / released_amount / transaction_id /
--     release_transaction_id).
-- (2) Widens deposits.status check to include 'partially_released' and
--     'retained' (the values utils/accounting.js#releaseDeposit emits).
-- (3) Seeds the default Moroccan chart of accounts on every new agency
--     via an AFTER INSERT trigger.
-- (4) Backfills the chart for every existing agency that has none.
-- ─────────────────────────────────────────────────────────────

-- ── 1. transactions ──────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS invoice_id   uuid;

-- ── 2. journal_entries ───────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS transaction_ref text,
  ADD COLUMN IF NOT EXISTS account_name    text;

-- ── 3. deposits ──────────────────────────────────────────────
ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS client_name             text,
  ADD COLUMN IF NOT EXISTS vehicle_name            text,
  ADD COLUMN IF NOT EXISTS deductions              jsonb       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS released_amount         numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_id          uuid,
  ADD COLUMN IF NOT EXISTS release_transaction_id  uuid;

-- Widen the deposits.status check. The original allowed only
-- (held, released, forfeited); the code emits (held, released,
-- partially_released, retained). Drop the legacy check by name(s)
-- defensively because Postgres named it inconsistently across the
-- 001 / 002 / 005 lineage.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'deposits'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE deposits DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE deposits
  ADD CONSTRAINT deposits_status_check
  CHECK (status IN ('held', 'released', 'partially_released', 'retained', 'forfeited'));

-- ── 4. Default chart of accounts seed function + trigger ─────
-- Mirror of DEFAULT_ACCOUNTS in utils/storage.js (kept here as the
-- single source of truth — the JS constant is legacy/localStorage and
-- will be removed once nothing reads from it).
CREATE OR REPLACE FUNCTION seed_default_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO accounts (agency_id, code, name, type, normal_balance, category, is_system)
  VALUES
    (NEW.id, '1000', 'Caisse / Espèces',                       'asset',     'debit',  'Actifs',   true),
    (NEW.id, '1010', 'Banque',                                  'asset',     'debit',  'Actifs',   true),
    (NEW.id, '1100', 'Créances clients',                        'asset',     'debit',  'Actifs',   true),
    (NEW.id, '1200', 'Dépôts de garantie à recevoir',           'asset',     'debit',  'Actifs',   true),
    (NEW.id, '1300', 'Parc automobile',                         'asset',     'debit',  'Actifs',   true),
    (NEW.id, '2000', 'Dépôts de garantie clients',              'liability', 'credit', 'Passifs',  true),
    (NEW.id, '2100', 'TVA collectée (20%)',                     'liability', 'credit', 'Passifs',  true),
    (NEW.id, '2200', 'Fournisseurs',                            'liability', 'credit', 'Passifs',  true),
    (NEW.id, '3000', 'Chiffre d''affaires — Location',          'revenue',   'credit', 'Produits', true),
    (NEW.id, '3010', 'Extras et assurances',                    'revenue',   'credit', 'Produits', true),
    (NEW.id, '3020', 'Frais de restitution',                    'revenue',   'credit', 'Produits', true),
    (NEW.id, '3030', 'Frais kilométriques supplémentaires',     'revenue',   'credit', 'Produits', true),
    (NEW.id, '4000', 'Entretien et réparations',                'expense',   'debit',  'Charges',  true),
    (NEW.id, '4010', 'Carburant',                               'expense',   'debit',  'Charges',  true),
    (NEW.id, '4020', 'Assurances véhicules',                    'expense',   'debit',  'Charges',  true),
    (NEW.id, '4030', 'Commission plateforme',                   'expense',   'debit',  'Charges',  true),
    (NEW.id, '4040', 'Amortissements',                          'expense',   'debit',  'Charges',  true)
  ON CONFLICT (agency_id, code) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_seed_accounts ON agencies;
CREATE TRIGGER agencies_seed_accounts
  AFTER INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_accounts();

-- ── 5. Backfill existing agencies ────────────────────────────
DO $$
DECLARE
  a RECORD;
BEGIN
  FOR a IN SELECT id FROM agencies LOOP
    INSERT INTO accounts (agency_id, code, name, type, normal_balance, category, is_system)
    SELECT a.id, v.code, v.name, v.type, v.normal_balance, v.category, true
    FROM (VALUES
      ('1000', 'Caisse / Espèces',                       'asset',     'debit',  'Actifs'),
      ('1010', 'Banque',                                  'asset',     'debit',  'Actifs'),
      ('1100', 'Créances clients',                        'asset',     'debit',  'Actifs'),
      ('1200', 'Dépôts de garantie à recevoir',           'asset',     'debit',  'Actifs'),
      ('1300', 'Parc automobile',                         'asset',     'debit',  'Actifs'),
      ('2000', 'Dépôts de garantie clients',              'liability', 'credit', 'Passifs'),
      ('2100', 'TVA collectée (20%)',                     'liability', 'credit', 'Passifs'),
      ('2200', 'Fournisseurs',                            'liability', 'credit', 'Passifs'),
      ('3000', 'Chiffre d''affaires — Location',          'revenue',   'credit', 'Produits'),
      ('3010', 'Extras et assurances',                    'revenue',   'credit', 'Produits'),
      ('3020', 'Frais de restitution',                    'revenue',   'credit', 'Produits'),
      ('3030', 'Frais kilométriques supplémentaires',     'revenue',   'credit', 'Produits'),
      ('4000', 'Entretien et réparations',                'expense',   'debit',  'Charges'),
      ('4010', 'Carburant',                               'expense',   'debit',  'Charges'),
      ('4020', 'Assurances véhicules',                    'expense',   'debit',  'Charges'),
      ('4030', 'Commission plateforme',                   'expense',   'debit',  'Charges'),
      ('4040', 'Amortissements',                          'expense',   'debit',  'Charges')
    ) AS v(code, name, type, normal_balance, category)
    ON CONFLICT (agency_id, code) DO NOTHING;
  END LOOP;
END $$;

-- ── 6. Helpful indexes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS transactions_contract_idx       ON transactions (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_invoice_idx        ON transactions (invoice_id)  WHERE invoice_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_date_idx        ON journal_entries (date);
CREATE INDEX IF NOT EXISTS journal_entries_account_idx     ON journal_entries (account_code);
CREATE INDEX IF NOT EXISTS deposits_contract_idx           ON deposits (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deposits_status_idx             ON deposits (status);
