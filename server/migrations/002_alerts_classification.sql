-- Migration: Alerts classification column
-- Run in Supabase SQL editor.

-- 1. Add top-level classification column for triage pipeline
--    Values: 'alert' (ambiguous/non-rental), NULL (standard lead)
ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS classification TEXT;

-- 2. Add index for fast filtering by classification
CREATE INDEX IF NOT EXISTS idx_pending_demands_classification
  ON pending_demands (classification)
  WHERE classification IS NOT NULL;

-- 3. Backfill: surface any existing embedded classification from extracted_data
--    (covers rows written before this migration was applied)
UPDATE pending_demands
  SET classification = extracted_data->>'classification'
  WHERE classification IS NULL
    AND extracted_data->>'classification' IS NOT NULL;
