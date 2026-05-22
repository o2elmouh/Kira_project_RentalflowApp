-- 20260522_lead_acceptance_timestamps.sql
-- Adds nullable timestamps that record when a lead was accepted by the client
-- and when all required documents (CIN + permis) were first captured.

ALTER TABLE public.pending_demands
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS docs_completed_at timestamptz NULL;

COMMENT ON COLUMN public.pending_demands.accepted_at
  IS 'Set when intent=accepted reply is received from the client.';

COMMENT ON COLUMN public.pending_demands.docs_completed_at
  IS 'Set once detectMissingDocs() first returns {}; gates the one-shot agency notif.';
