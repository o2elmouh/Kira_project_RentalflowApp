-- Migration: Smart Quote ("Devis Rapide") feature
-- Run in Supabase SQL editor.
--
-- New statuses (application-level — status column is TEXT, not a PostgreSQL enum):
--   waiting        — lead queued for a quote (manager is preparing offer)
--   offer_sent     — WhatsApp offer message sent to client
--   accepted       — client replied with acceptance
--   converted      — lead converted to a rental contract
-- Existing statuses still valid: pending, processed, ignored

ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS offered_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offered_price_total NUMERIC,
  ADD COLUMN IF NOT EXISTS last_client_note    TEXT;
