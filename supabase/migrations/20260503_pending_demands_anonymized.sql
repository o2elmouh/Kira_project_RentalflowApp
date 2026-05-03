-- Law 09-08 Phase 2: track when extracted_data was anonymized
ALTER TABLE pending_demands ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
