-- B3 + B4 — Replace long-lived signed_pdf_url with a path column and bound the purge.
--
-- Why:
--   - signed_pdf_url is a 7-day Supabase signed URL persisted in the DB. Any
--     read access (RLS misconfig, leaked backup) yields direct PDF downloads.
--   - Storing the bucket-relative *path* lets the backend mint a short-TTL URL
--     on demand and re-check req.user.agency_id at every request.
--   - The purge SQL function processed every stale row in one transaction; at
--     scale (e.g. 50k rows after a brief outage) that's a giant UPDATE + an
--     unbounded storage delete batch. Cap at 500 per run.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS signed_pdf_path text;

-- Bounded version of the purge function.
CREATE OR REPLACE FUNCTION purge_expired_signed_pdfs()
RETURNS TABLE (contract_id uuid, pdf_path text) AS $$
  WITH stale AS (
    SELECT id, signed_pdf_path
      FROM contracts
     WHERE signed_at IS NOT NULL
       AND signed_at < now() - interval '30 days'
       AND signed_pdf_path IS NOT NULL
     ORDER BY signed_at ASC
     LIMIT 500
  ),
  cleared AS (
    UPDATE contracts c
       SET signed_pdf_path = NULL,
           signed_pdf_url  = NULL  -- legacy column; null going forward
      FROM stale
     WHERE c.id = stale.id
    RETURNING c.id, stale.signed_pdf_path
  )
  SELECT id, signed_pdf_path FROM cleared;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION purge_expired_signed_pdfs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_signed_pdfs() TO service_role;
