# Law 09-08 Compliance — Phased Implementation Plan

> Reference doc for Phases 2–5 of Moroccan CNDP compliance work.
> Phase 1 (privacy notice) shipped as v1.4.0 / commit `a3a3dd5` on 2026-05-02.
> Each phase = one commit on `staging`. Push only when user says "push to staging".

---

## Decisions already locked in

- **Retention period:** 10 years post-contract closure (matches Moroccan accounting/tax law).
- **Encryption strategy:** Option A — backend-only CRUD (move client read/write from `lib/db.js` to `server/routes/clients.js`, encrypt/decrypt at backend boundary using existing AES-256-GCM helpers in `server/routes/leads.js`).
- **Per-phase commits** on `staging` (no feature branches — per CLAUDE.md rule 6).
- **Soak time:** 2 days minimum before next phase. Encryption phase needs 2 weeks soak.

---

## Field map (DB ↔ frontend)

Sensitive PII columns in `clients` table:

| DB column | Frontend field (camelCase) | Source |
|---|---|---|
| `id_type` | `idType` | OCR `documentType` ('cin' / 'passport') |
| `id_number` | `cinNumber` | OCR `documentNumber` |
| `id_expiry` | `cinExpiry` | OCR `expiryDate` (when ID/passport) |
| `driving_license_num` | `drivingLicenseNumber` | OCR `documentNumber` (license scan) |
| `driving_license_expiry` | `licenseExpiry` | OCR `expiryDate` (license) |
| `date_of_birth` | `dateOfBirth` | OCR `dateOfBirth` |

Mappers live in [lib/db.js](lib/db.js): `clientToDb()` ~line 60, `clientFromDb()` ~line 86.

OCR prompt: `GLOBAL_SYSTEM_PROMPT` in [server/routes/leads.js](server/routes/leads.js) ~line 113.
JSONB blob with all OCR results lives in `pending_demands.extracted_data`.

---

## Phase 2 — Pending Demands Cleanup (low risk)

**Goal:** Stop accumulating sensitive OCR data forever in `pending_demands.extracted_data`.

**Files to create:**
- `server/scripts/cleanupPendingDemands.js`
- `server/scripts/cleanupPendingDemands.test.js`

**Files to modify:**
- `package.json` — add `"cleanup:pending": "node server/scripts/cleanupPendingDemands.js"` script

**Logic:**
For every row in `pending_demands` where `sender_id` matches a client whose contracts are all `status='closed'` AND latest `closed_at` is more than 30 days ago, set `extracted_data = null`. Preserve `classification`, `source`, `sender_id`, `raw_payload` (text only, no PII).

```sql
-- pseudo-query the script will execute via supabaseAdmin
UPDATE pending_demands pd
SET extracted_data = NULL, anonymized_at = NOW()
WHERE pd.extracted_data IS NOT NULL
  AND pd.sender_id IN (
    SELECT DISTINCT sender_match FROM ... -- match by phone/email
  )
  AND NOT EXISTS (
    SELECT 1 FROM contracts c
    WHERE c.client_id = matched_client.id
      AND (c.status != 'closed' OR c.closed_at > NOW() - INTERVAL '30 days')
  );
```

**Need to add:** `pending_demands.anonymized_at` timestamptz column (nullable). Migration SQL goes in `supabase/migrations/0XX_pending_demands_anonymized.sql`.

**Schedule:** Railway cron — daily at 03:00 UTC. Add to Railway dashboard manually after first manual run validates output.

**Regression check (MANDATORY):**
- Search graph for any reads of `pending_demands.extracted_data` for closed leads. UI components: `pages/Basket.jsx`, `pages/Basket/SmartQuotePanel.jsx`, `pages/NewRental.jsx` (via prefilledLead). All three must gracefully render when `extracted_data === null` for closed leads.
- The smart-quote panel was previously gated on `lead.status in ('waiting','offer_sent')` per memory obs 617 — closed leads already don't show it. Should be safe.

**Tests:**
- Mock supabase admin client. Test cases: skips open contracts, skips closed-recent contracts, anonymizes closed-old contracts, preserves non-PII fields.

**Version bump:** v1.4.1 (patch).

---

## Phase 3 — Right to Erasure Endpoint (medium risk)

**Goal:** Admin can fulfill GDPR/Law 09-08 erasure requests within 10 days. Foundation for Phase 4 (auto-retention).

**Files to create:**
- `server/routes/admin.js` (or extend if exists) — `POST /admin/clients/:id/anonymize`
- `supabase/migrations/0XX_clients_anonymization.sql` — adds `anonymized_at timestamptz`, creates `audit_log` table
- `pages/settings/PrivacyTab.jsx` (or wire into existing Settings tabs)
- `lib/api.js` — add `anonymizeClient(id, reason)` method

**Files to modify:**
- `pages/OtherPages.jsx` (Settings page) — add Privacy tab
- All UI components that read `client.firstName / lastName` — handle anonymized state. Use graph to find: `pages/clients/ClientList.jsx`, `pages/clients/ClientDetail.jsx`, `pages/Restitution.jsx`, `pages/rental/ContractStep.jsx` (PDF gen), `pages/Basket.jsx`.

**Endpoint logic:**
```js
// POST /admin/clients/:id/anonymize { reason }
// Requires admin role (use existing requireAdmin middleware)
// Verify client.agency_id === req.user.profile.agency_id

await supabaseAdmin.from('clients').update({
  id_number: null,
  id_expiry: null,
  driving_license_num: null,
  driving_license_expiry: null,
  date_of_birth: null,
  email: null,
  phone: null,
  phone2: null,
  address: null,
  first_name: '[ANONYMIZED]',
  last_name: '[ANONYMIZED]',
  anonymized_at: new Date().toISOString(),
}).eq('id', id)

// Log who/when/why
await supabaseAdmin.from('audit_log').insert({
  agency_id, actor_user_id: req.user.id,
  action: 'client.anonymize', target_id: id,
  reason, created_at: new Date().toISOString(),
})
```

**Audit log schema:**
```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL,                    -- 'client.anonymize', 'client.export', etc.
  target_table text,
  target_id uuid,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_isolation" ON audit_log FOR ALL
  USING (agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid()));
```

**UI:** Settings → Privacy tab → list of clients with "Anonymize" button + reason text input + confirmation modal.

**Regression check (CRITICAL):**
- Every `<Component>{client.firstName}</Component>` in the app must handle `'[ANONYMIZED]'` literal — or the column rename approach (e.g. show "[Client anonymisé]" via `client.anonymized_at != null`).
- PDF generation: anonymized clients should still generate readable PDFs (for legal records of the act of anonymization). Check `utils/pdf.js`.
- Searches by name: anonymized client should be findable by `[ANONYMIZED]` keyword OR be excluded from search.

**Tests:**
- Endpoint: 401 unauthorized, 403 wrong agency, 200 success, audit_log row created.
- UI: anonymized client renders without crashing in ClientList, ClientDetail, ContractStep PDF.

**Version bump:** v1.5.0 (minor — new feature).

---

## Phase 4 — Retention Automation (low risk — depends on Phase 3)

**Goal:** Auto-anonymize clients whose contracts have all been closed for more than the legal retention period.

**Files to create:**
- `server/scripts/enforceRetention.js`
- `server/scripts/enforceRetention.test.js`
- `supabase/migrations/0XX_agencies_retention.sql` — `ALTER TABLE agencies ADD COLUMN retention_years int NOT NULL DEFAULT 10;`

**Files to modify:**
- `pages/settings/PrivacyTab.jsx` (from Phase 3) — add retention period configurable per agency (default 10, min 5, max 30)
- `package.json` — `"enforce:retention": "node server/scripts/enforceRetention.js"`
- `server/routes/agency.js` — extend PATCH to include `retention_years` field (admin-only)

**Logic:**
For each agency, find clients where:
1. Every contract for this client has `status = 'closed'`
2. The most recent `closed_at` is older than `agency.retention_years` years
3. `anonymized_at IS NULL`

Then call the same anonymization logic from Phase 3 (extract into a shared `anonymizeClientCore()` helper in `server/lib/anonymize.js` during Phase 3 to avoid duplication).

**Schedule:** Railway cron — monthly at 04:00 UTC on the 1st.

**Regression check:** Reuses Phase 3 anonymization, which by then is battle-tested. Just verify retention_years is read correctly per agency.

**Tests:**
- Backdated test data: contract closed 11 years ago → anonymized; contract closed 9 years ago → not anonymized; client with one open contract → not anonymized even if other contracts are old.

**Version bump:** v1.5.1 (patch — automation of existing feature).

---

## Phase 5 — Encryption at Rest (HIGH risk — defer 2 weeks after Phase 4)

**Goal:** Encrypt sensitive `clients` columns so a Supabase breach can't leak raw PII.

**Architecture:** Option A — backend-only CRUD. Frontend stops calling Supabase directly for clients; uses backend API instead.

**Files to create:**
- `server/lib/encryption.js` — extract `encrypt`/`decrypt` from `server/routes/leads.js` (lines 24-45) into a shared module. Both leads.js and the new clients route will import from here.
- `server/routes/clients.js` — `GET /clients`, `GET /clients/:id`, `POST /clients`, `PATCH /clients/:id`, `DELETE /clients/:id`. All routes encrypt-on-write, decrypt-on-read. Reuses `requireAuth` + agency-isolation pattern from existing routes.
- `supabase/migrations/0XX_clients_encrypt.sql` — adds `id_number_enc`, `driving_license_num_enc`, `date_of_birth_enc` text columns. Keeps original columns temporarily for rollback safety.
- `server/scripts/migrateClientsEncryption.js` — one-time data migration. Reads each client row, encrypts the 3 sensitive fields, writes to the new `_enc` columns. Idempotent (skip if already encrypted).
- `server/scripts/migrateClientsEncryption.test.js`

**Files to modify (HIGH risk surface area):**
- `lib/db.js` — REMOVE `getClients`, `saveClient`, `clientToDb`, `clientFromDb`. (Keep contract/invoice functions — those still use direct Supabase.)
- `lib/api.js` — ADD `getClients()`, `getClient(id)`, `saveClient(client)`, `deleteClient(id)`. These call the new backend endpoints.
- `pages/Clients.jsx` — replace `from 'lib/db'` imports with `from 'lib/api'`.
- `pages/clients/ClientList.jsx`, `ClientDetail.jsx`, `ClientForm.jsx` — same import switch.
- `pages/rental/ScanStep.jsx`, `ContractStep.jsx` — `saveClient` calls switch to api.
- `pages/Restitution.jsx` — anywhere that reads client data.
- `pages/Basket.jsx` — anywhere that reads client data.
- `utils/pdf.js` — if it reads client data directly (not via props), needs adjustment.
- All places that `getFleet()`-style fetch lists may need pagination because backend round-trip is slower than direct Supabase reads.
- **Feature flag:** `ENCRYPT_PII=true` env var. When false, backend reads/writes plaintext columns (current behavior). When true, reads/writes `_enc` columns. This gives instant rollback.

**Migration sequence (zero-downtime):**
1. Deploy code with new endpoints + feature flag OFF. New endpoints exist but write to plaintext columns. Frontend still works.
2. Run `migrateClientsEncryption.js` to populate `_enc` columns from existing plaintext.
3. Verify in Supabase that `_enc` columns are populated and decryptable via the helper.
4. Set `ENCRYPT_PII=true` in Railway env. Restart. Now reads/writes go to `_enc` columns.
5. Soak 1 week. If issues: flip flag back to false (instant rollback).
6. After 2 weeks of stability: drop the plaintext columns. Add migration `0XX_clients_drop_plaintext.sql`.

**Regression check (EXHAUSTIVE):**
- Every UI component that displays CIN/passport/license/DOB.
- PDF generation (contracts, restitution receipts).
- Search/filter by CIN — encrypted columns can't be searched directly. Either (a) keep CIN searchable via a separate hash column, or (b) accept that filtering by CIN isn't supported.
- Phase 3 anonymization endpoint must also work on encrypted columns.
- Phase 2 cleanup script reads `pending_demands` not `clients`, so unaffected.

**Tests:**
- Encryption round-trip: plaintext → encrypt → decrypt → matches plaintext.
- Endpoint: GET returns decrypted, POST encrypts before storage, agency isolation respected.
- Migration script: idempotent (safe to re-run), handles null values, doesn't double-encrypt.
- Feature flag: when OFF, behaves identically to pre-Phase-5 code.

**Version bump:** v1.6.0 (minor — major architectural change but feature-flagged).

---

## Suggested rollout cadence

```
Phase 1 → SHIPPED v1.4.0  (2026-05-02)
Phase 2 → after 2 days soak. Target: ~2026-05-04
Phase 3 → after 1 week soak. Target: ~2026-05-12
Phase 4 → after 2 weeks soak. Target: ~2026-05-26
Phase 5 → after 2 weeks soak after Phase 4. Target: ~2026-06-09
```

Each phase: code → local commit → wait for "push to staging" → soak → next.

---

## Open questions for the next session

1. **Search by CIN** — does the current Clients page support CIN search? If yes, Phase 5 needs the hash-column workaround.
2. **PDF generation** — does the contract PDF include CIN number directly, or just first/last name? If CIN, Phase 3 anonymization will produce blank fields in old PDFs (acceptable).
3. **Existing audit_log table?** — verify it doesn't already exist before Phase 3 migration.

To resume in a fresh conversation: point Claude at this file plus `.claude/STATUS.md` and the most recent CMEM observations.
