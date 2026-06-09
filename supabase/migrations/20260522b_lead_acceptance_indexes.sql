-- 20260522b_lead_acceptance_indexes.sql
-- Partial indexes for the nullable timestamp columns added in
-- 20260522_lead_acceptance_timestamps.sql. Follows the repo convention
-- (cf. 20260512_contract_finalized_at.sql) of indexing only non-NULL rows
-- since these columns are append-only flags read by background pipelines.

CREATE INDEX IF NOT EXISTS pending_demands_accepted_at_idx
  ON public.pending_demands (accepted_at)
  WHERE accepted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_demands_docs_completed_at_idx
  ON public.pending_demands (docs_completed_at)
  WHERE docs_completed_at IS NOT NULL;
