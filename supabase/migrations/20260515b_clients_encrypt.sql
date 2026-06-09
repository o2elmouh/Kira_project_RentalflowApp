-- Law 09-08 Phase 5a: encryption-at-rest groundwork.
--
-- Adds ciphertext columns for the sensitive PII fields. The plaintext
-- columns (id_number, driving_license_num, date_of_birth) are kept
-- intentionally — the rollout sequence is:
--
--   1. Deploy backend with ENCRYPT_PII=false. New route reads/writes
--      plaintext columns. No behavior change.
--   2. Run server/scripts/migrateClientsEncryption.js to backfill the
--      _enc columns from the plaintext values. Idempotent.
--   3. Flip ENCRYPT_PII=true. Reads/writes now use _enc columns.
--   4. Soak 2 weeks. If anything breaks, flip flag back to false —
--      plaintext columns are still authoritative until step 5.
--   5. Drop plaintext columns in a follow-up migration once we're
--      confident the cutover is stable.
--
-- All columns are nullable; values are stored as
--   "${ivHex}:${tagHex}:${ciphertextHex}"
-- per the format defined in server/lib/encryption.js.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS id_number_enc           text,
  ADD COLUMN IF NOT EXISTS driving_license_num_enc text,
  ADD COLUMN IF NOT EXISTS date_of_birth_enc       text;
