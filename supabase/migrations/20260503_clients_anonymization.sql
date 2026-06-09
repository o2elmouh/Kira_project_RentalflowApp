-- Law 09-08 Phase 3: right to erasure — client anonymization + audit trail

-- 1. Erasure timestamp on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

-- 2. Audit log for compliance actions
CREATE TABLE IF NOT EXISTS audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id),
  actor_user_id  uuid NOT NULL REFERENCES profiles(id),
  action         text NOT NULL,
  target_table   text,
  target_id      uuid,
  reason         text,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_isolation" ON audit_log FOR ALL
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS audit_log_agency_created
  ON audit_log (agency_id, created_at DESC);
