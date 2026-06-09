-- Per-agency contract PDF template + signed-PDF auto-purge metadata.
-- Each agency may upload a custom contract template (Storage URL stored here);
-- when present, the e-signature flow stamps the signature onto this template
-- instead of the auto-generated PDF.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS contract_template_url text;

-- Tracks when a signed PDF was last refreshed so the purge job can null-out
-- stale signed_pdf_url 30 days after signing. (signed_at exists already; we
-- query it directly.)

CREATE OR REPLACE FUNCTION purge_expired_signed_pdfs()
RETURNS TABLE (contract_id uuid, pdf_url text) AS $$
  WITH cleared AS (
    UPDATE contracts c
       SET signed_pdf_url = NULL
     WHERE c.signed_at IS NOT NULL
       AND c.signed_at < now() - interval '30 days'
       AND c.signed_pdf_url IS NOT NULL
    RETURNING c.id, c.signed_pdf_url
  )
  SELECT id, signed_pdf_url FROM cleared;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION purge_expired_signed_pdfs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_signed_pdfs() TO service_role;
