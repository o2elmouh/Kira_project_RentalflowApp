-- ─────────────────────────────────────────────────────────────
-- Migration — Gmail poller dedup (v1.14.8)
-- ─────────────────────────────────────────────────────────────
--
-- Issue: server/routes/gmail.js dedup was in-process memory only
-- (`lastSeenUid` Map). Every Railway restart wiped the watermark, so all
-- UNSEEN Gmail messages from the last 24h were re-replayed → new lead
-- inserted on every restart → marking a lead "processed" didn't help.
--
-- Fix has two layers:
--
--   1. agencies.gmail_last_seen_uid (integer, nullable)
--      DB-persistent high-water mark replacing the in-memory Map.
--      Survives restarts. Code falls back to 0 on null.
--
--   2. pending_demands.gmail_message_id (text, nullable) + partial unique
--      index on (agency_id, gmail_message_id) WHERE NOT NULL.
--      Authoritative downstream guard against duplicates from any future
--      polling path (e.g. Gmail push API). The partial predicate means
--      existing pre-migration rows (NULL message_id) are unaffected.
--
-- Both columns are nullable and additive — fully backward compatible.
-- Apply this migration BEFORE deploying the v1.14.8 server code. The
-- code defensively falls back if the columns are missing, but the
-- protection only activates once both are present.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS gmail_last_seen_uid integer;

ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS gmail_message_id text;

-- Partial unique: only enforce uniqueness for rows that actually carry
-- a Gmail Message-ID. NULL message_id rows (pre-migration data, plus all
-- WhatsApp leads) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS pending_demands_agency_gmail_msg_unique
  ON pending_demands (agency_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

COMMENT ON COLUMN agencies.gmail_last_seen_uid IS
  'IMAP UID high-water mark for the Gmail poller. Persisted to survive Railway restarts.';
COMMENT ON COLUMN pending_demands.gmail_message_id IS
  'RFC 2822 Message-ID from the original Gmail email. Used by the partial unique index to prevent duplicate ingestion.';
