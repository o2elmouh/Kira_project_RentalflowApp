-- ─────────────────────────────────────────────────────────────
-- Migration — agencies.config column (v1.14.10)
-- ─────────────────────────────────────────────────────────────
--
-- Issue: lib/db.js calls `agencies.select('config')` (and writes to it
-- via `agencies.update({ config: ... })`) but the column was never
-- added by any earlier migration. Supabase REST returns 400 with
-- "column agencies.config does not exist" — visible as a constant red
-- error in the browser console on every session.
--
-- Fix: add the column as JSONB with default '{}' so existing reads
-- immediately return an empty object instead of failing.
--
-- Shape used by the app today (see lib/db.js getGeneralConfig /
-- getTelemetryConfig):
--   {
--     "telemetry": { "provider": "mock" | "fleetio" | …, "mappings": [...] },
--     "fleet":     { ... per-fleet defaults ... }
--   }
--
-- Free-form so future settings (locale defaults, integration toggles,
-- feature flags) can be added without further migrations.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agencies.config IS
  'Per-agency free-form configuration (telemetry provider, fleet defaults, integration toggles, etc.). Read/written by lib/db.js getGeneralConfig and getTelemetryConfig.';
