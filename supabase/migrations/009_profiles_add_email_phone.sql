-- ─────────────────────────────────────────────────────────────
-- Migration 009 — Add missing email and phone columns to profiles
-- These columns exist in the schema DDL but were never applied
-- to the production database.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;
