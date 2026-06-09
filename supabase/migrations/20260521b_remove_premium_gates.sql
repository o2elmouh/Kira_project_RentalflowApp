-- ─────────────────────────────────────────────────────────────
-- Migration 20260521b — Remove premium gating
--
-- All agencies now have full feature access. The `plan` column
-- and `seat_limit` column are retained for future re-introduction
-- of tiered pricing, but normalized to unlimited / 'premium' so
-- legacy reads (if any) see the unrestricted value.
--
-- Idempotent. No schema changes.
-- ─────────────────────────────────────────────────────────────

UPDATE agencies
   SET plan       = 'premium',
       seat_limit = NULL
 WHERE plan IS DISTINCT FROM 'premium'
    OR seat_limit IS NOT NULL;
