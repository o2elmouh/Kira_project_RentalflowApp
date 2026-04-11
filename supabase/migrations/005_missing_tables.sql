-- Migration 005: Create tables missing from Supabase instance
-- Run this in the Supabase Dashboard → SQL Editor

-- INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id      uuid        REFERENCES contracts(id),
  client_id        uuid        REFERENCES clients(id),
  invoice_number   text        UNIQUE,
  contract_number  text,
  client_name      text,
  vehicle_name     text,
  total_ht         numeric(12,2),
  tva              numeric(12,2),
  total_ttc        numeric(12,2),
  days             int,
  start_date       date,
  end_date         date,
  status           text        DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at       timestamptz DEFAULT now()
);

-- ACCOUNTS (chart of accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code           text        NOT NULL,
  name           text        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('asset', 'liability', 'revenue', 'expense')),
  normal_balance text        NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  category       text,
  is_system      boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (agency_id, code)
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  reference    text,
  date         date,
  description  text,
  type         text,
  amount       numeric(12,2),
  contract_id  uuid,
  invoice_id   uuid,
  created_at   timestamptz DEFAULT now()
);

-- JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS journal_entries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  transaction_id   uuid        REFERENCES transactions(id) ON DELETE CASCADE,
  transaction_ref  text,
  date             date,
  description      text,
  account_code     text,
  account_name     text,
  debit            numeric(12,2) DEFAULT 0,
  credit           numeric(12,2) DEFAULT 0,
  created_at       timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_transaction_idx ON journal_entries (transaction_id);

-- DEPOSITS
CREATE TABLE IF NOT EXISTS deposits (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id           uuid        REFERENCES contracts(id),
  client_name           text,
  vehicle_name          text,
  amount                numeric(12,2),
  status                text        DEFAULT 'held',
  held_at               text,
  released_at           text,
  released_amount       numeric(12,2) DEFAULT 0,
  deductions            jsonb       DEFAULT '[]',
  transaction_id        uuid,
  release_transaction_id uuid,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

-- SNAPSHOTS (telematics)
CREATE TABLE IF NOT EXISTS snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contract_id uuid,
  vehicle_id  uuid        REFERENCES vehicles(id),
  phase       text        CHECK (phase IN ('start', 'end')),
  mileage     int,
  fuel        text,
  lat         numeric(10,6),
  lng         numeric(10,6),
  engine_on   boolean,
  dtc_codes   jsonb       DEFAULT '[]',
  provider    text,
  raw_data    jsonb,
  taken_at    timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_contract_idx ON snapshots (contract_id);
CREATE INDEX IF NOT EXISTS snapshots_vehicle_idx  ON snapshots (vehicle_id);

-- Enable RLS on all new tables (same pattern as existing tables)
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots      ENABLE ROW LEVEL SECURITY;

-- RLS policies: agency members can read/write their own data
CREATE POLICY "agency_invoices"        ON invoices        FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "agency_accounts"        ON accounts        FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "agency_transactions"    ON transactions    FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "agency_journal_entries" ON journal_entries FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "agency_deposits"        ON deposits        FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "agency_snapshots"       ON snapshots       FOR ALL USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
