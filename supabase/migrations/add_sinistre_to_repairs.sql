-- Migration: extend repairs table with sinistre / accident fields
-- Run in Supabase SQL editor or via supabase CLI
-- Safe to run multiple times (IF NOT EXISTS guards)

ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS is_sinistre            boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS sinistre_id            text,
  ADD COLUMN IF NOT EXISTS insurance_ref          text,
  ADD COLUMN IF NOT EXISTS insurance_reimbursement numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_franchise       numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_id            text;

-- Optional index: group all repairs belonging to the same accident
CREATE INDEX IF NOT EXISTS repairs_sinistre_id_idx ON repairs (sinistre_id) WHERE sinistre_id IS NOT NULL;

-- TCO view (optional, for reporting dashboards)
CREATE OR REPLACE VIEW vehicle_tco AS
SELECT
  vehicle_id,
  COUNT(*)                                                   AS repair_count,
  COALESCE(SUM(cost), 0)                                     AS total_expense,
  COALESCE(SUM(insurance_reimbursement), 0)                  AS total_insurance,
  COALESCE(SUM(client_franchise), 0)                         AS total_franchise,
  COALESCE(SUM(cost), 0)
    - COALESCE(SUM(insurance_reimbursement), 0)
    - COALESCE(SUM(client_franchise), 0)                     AS net_tco
FROM repairs
GROUP BY vehicle_id;
