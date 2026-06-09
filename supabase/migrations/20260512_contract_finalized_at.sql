-- ─────────────────────────────────────────────────────────────
-- Migration — contracts.finalized_at
-- Adds a "case-locked" timestamp set when the rental wizard's
-- "Finaliser le contrat" button is clicked. Distinct from
-- contracts.closed_at (set by Restitution when the car returns).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE INDEX IF NOT EXISTS contracts_finalized_at_idx
  ON contracts (finalized_at)
  WHERE finalized_at IS NOT NULL;

COMMENT ON COLUMN contracts.finalized_at IS
  'Set when the agent closes the contract review wizard. Contract remains status=active and eligible for Restitution. Distinct from closed_at which marks vehicle return.';
