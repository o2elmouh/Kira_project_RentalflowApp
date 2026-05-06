-- E-signature flow: per-contract signing token + status + stamped PDF URL.
-- Status transitions: unsigned → pending → signed (or → expired by TTL).

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT 'unsigned'
    CHECK (signature_status IN ('unsigned', 'pending', 'signed', 'expired')),
  ADD COLUMN IF NOT EXISTS signing_token              text UNIQUE,
  ADD COLUMN IF NOT EXISTS signing_token_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS signed_pdf_url             text,
  ADD COLUMN IF NOT EXISTS unsigned_pdf_path          text;

CREATE INDEX IF NOT EXISTS contracts_signing_token_idx ON contracts (signing_token);

-- Realtime publication so manager dashboards can subscribe to row updates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contracts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE contracts';
  END IF;
END $$;
