-- Migration: Smart Quote ("Devis Rapide") feature
-- Run in Supabase SQL editor.

-- 1. Add new columns for the quote offer
ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS offered_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offered_price_total NUMERIC,
  ADD COLUMN IF NOT EXISTS last_client_note    TEXT;

-- 2. Expand the status check constraint to include the new smart-quote statuses
--    (the original constraint only allowed: pending, processed, ignored)
ALTER TABLE pending_demands
  DROP CONSTRAINT IF EXISTS pending_demands_status_check;

ALTER TABLE pending_demands
  ADD CONSTRAINT pending_demands_status_check
  CHECK (status IN ('pending', 'processed', 'ignored', 'waiting', 'offer_sent', 'accepted', 'converted'));
