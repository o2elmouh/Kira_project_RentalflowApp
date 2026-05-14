-- Law 09-08 Phase 4: retention period (years) per agency, used by the
-- monthly enforceRetention cron to auto-anonymize stale closed contracts.
-- Default 10 years matches Moroccan accounting/tax law; bounded to a sane
-- 5-30 range to prevent accidental "0" or "999" misconfigurations.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS retention_years int NOT NULL DEFAULT 10;

ALTER TABLE agencies
  DROP CONSTRAINT IF EXISTS agencies_retention_years_check;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_retention_years_check
    CHECK (retention_years BETWEEN 5 AND 30);
