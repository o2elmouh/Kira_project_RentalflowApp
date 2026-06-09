-- Law 09-08 / Phase 3 follow-up: erasure was blocked because PII columns
-- carried NOT NULL constraints set directly in Supabase (no prior migration
-- added them). anonymizeClient() in server/lib/anonymize.js nulls these
-- columns, so the UPDATE aborted with:
--   null value in column "id_number" of relation "clients" violates not-null
--
-- Defensively drop NOT NULL on every column the erasure routine sets to NULL.
-- DROP NOT NULL is idempotent on columns that don't have the constraint, so
-- this is safe regardless of the current state per environment.

ALTER TABLE clients
  ALTER COLUMN id_number               DROP NOT NULL,
  ALTER COLUMN id_expiry               DROP NOT NULL,
  ALTER COLUMN driving_license_num     DROP NOT NULL,
  ALTER COLUMN driving_license_expiry  DROP NOT NULL,
  ALTER COLUMN date_of_birth           DROP NOT NULL,
  ALTER COLUMN email                   DROP NOT NULL,
  ALTER COLUMN phone                   DROP NOT NULL,
  ALTER COLUMN phone2                  DROP NOT NULL,
  ALTER COLUMN address                 DROP NOT NULL;

-- Phase 5 ciphertext columns were added nullable, but drop NOT NULL anyway
-- in case a later environment hardened them.
ALTER TABLE clients
  ALTER COLUMN id_number_enc           DROP NOT NULL,
  ALTER COLUMN driving_license_num_enc DROP NOT NULL,
  ALTER COLUMN date_of_birth_enc       DROP NOT NULL;
