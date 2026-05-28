-- 20260528_prolongation_target_contract.sql
--
-- Adds a nullable FK from pending_demands to contracts so a prolongation
-- lead can be linked to the active contract it refers to. Populated by
-- the inbound pipeline at classification time. NULL means either:
--   - the lead is not a prolongation, or
--   - the sender could not be matched to a single active contract
--     (in which case classification is downgraded to 'new_lead').

ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS prolongation_target_contract_id UUID
  REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pending_demands_prolongation_target_idx
  ON pending_demands (prolongation_target_contract_id)
  WHERE prolongation_target_contract_id IS NOT NULL;
