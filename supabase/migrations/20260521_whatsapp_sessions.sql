-- WhatsApp session state per agency (Baileys auth stored as JSONB).
-- auth_state holds { creds: {...}, keys: { "type:id": value } }
-- serialised with Baileys' BufferJSON replacer (Buffers → { type:'Buffer', data:[...] }).

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  agency_id     uuid        PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  auth_state    jsonb       NOT NULL DEFAULT '{}',
  phone         text,
  connected_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Only service_role may read/write — no RLS row exposure to clients.
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only"
  ON whatsapp_sessions
  USING (false);
