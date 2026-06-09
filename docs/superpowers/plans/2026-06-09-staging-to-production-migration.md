# Staging-to-Production Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut over RentaFlow SaaS from staging to a production environment in a single day — clean Supabase, configured Railway + Vercel, domain wired, smoke-tested.

**Architecture:** Same codebase serves both environments; platform env vars determine which Supabase project, API URL, and domain each build targets. No code changes required. The cutover is entirely infrastructure configuration + a `staging` -> `main` git merge.

**Tech Stack:** Supabase (Auth/DB/Storage), Railway (Node/Express backend), Vercel (Vite SPA frontend), GitHub (CI), DNS (kiraflow.ma)

**Design spec:** `docs/superpowers/specs/2026-06-09-staging-to-production-migration-design.md`

---

## Pre-requisites (gather before starting)

Before beginning any task, collect these values. You will need them across multiple tasks.

| Item | Where to find it |
|---|---|
| Prod Supabase anon key | https://supabase.com/dashboard → project `apzarvjxvwtlphdqirjm` → Settings → API → `anon` `public` |
| Prod Supabase service_role key | Same page → `service_role` `secret` |
| Prod Supabase project URL | `https://apzarvjxvwtlphdqirjm.supabase.co` (confirmed) |
| Railway prod service URL | Railway dashboard → your production service → Settings → Public Networking URL |
| Fresh `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Fresh `SIGNING_TOKEN_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Prod WhatsApp number | The new number you've acquired for production |
| Twilio prod credentials | Twilio console → prod project → Account SID, Auth Token, API Key SID/Secret |
| kiraflow.ma DNS registrar login | Wherever the domain is registered |

---

### Task 1: Reset Production Supabase Database

**Context:** Prod Supabase (`apzarvjxvwtlphdqirjm`) has stale data from early development. We wipe it clean so all 31 migrations can run on a fresh schema.

- [ ] **Step 1: Open prod Supabase dashboard**

Navigate to: `https://supabase.com/dashboard/project/apzarvjxvwtlphdqirjm`

- [ ] **Step 2: Reset the database**

Go to: Settings → General → Danger Zone → "Reset database"

Type the confirmation phrase and confirm. This drops all tables, functions, triggers, and RLS policies in the `public` schema. Auth tables (`auth.*`) are preserved.

- [ ] **Step 3: Verify the reset**

In the SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected: empty result set (0 rows) or only Supabase-internal tables.

---

### Task 2: Apply All 31 Migrations to Production

**Context:** The migrations must be applied in strict order. They build on each other — later migrations ALTER tables created by earlier ones.

**Files:**
- Read: `supabase/migrations/001_initial_schema.sql` through `supabase/migrations/20260608_accounting_schema_fix.sql` (31 files)

- [ ] **Step 1: Open the Supabase SQL Editor**

Navigate to: `https://supabase.com/dashboard/project/apzarvjxvwtlphdqirjm` → SQL Editor

- [ ] **Step 2: Run migrations in order**

Paste and execute each migration file one at a time, in this exact order:

```
1.  001_initial_schema.sql
2.  002_patch_existing_schema.sql
3.  003_auth_fix.sql
4.  004_migration_v2.sql
5.  005_missing_tables.sql
6.  006_premium_basket.sql
7.  007_roles_and_limits.sql
8.  008_fix_onboard_rpc.sql
9.  009_profiles_add_email_phone.sql
10. 010_normalize_owner_role.sql
11. 011_reservations.sql
12. add_sinistre_to_repairs.sql
13. 20260422_network.sql
14. 20260503_clients_anonymization.sql
15. 20260503_pending_demands_anonymized.sql
16. 20260507_contract_signature.sql
17. 20260508_agency_contract_template.sql
18. 20260508b_signed_pdf_path_and_purge_bounds.sql
19. 20260512_contract_finalized_at.sql
20. 20260515_agencies_retention.sql
21. 20260515b_clients_encrypt.sql
22. 20260521_whatsapp_sessions.sql
23. 20260521b_remove_premium_gates.sql
24. 20260522_lead_acceptance_timestamps.sql
25. 20260522b_lead_acceptance_indexes.sql
26. 20260526_clients_drop_notnull_for_erasure.sql
27. 20260528_prolongation_target_contract.sql
28. 20260530_gmail_dedup.sql
29. 20260530b_agencies_config.sql
30. 20260608_accounting_schema_fix.sql
```

If any migration fails, read the error, fix the issue, and re-run only the failed one. Do NOT skip and continue — later migrations depend on earlier ones.

- [ ] **Step 3: Verify table creation**

In SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected tables (at minimum): `accounts`, `agencies`, `audit_log`, `clients`, `contracts`, `deposits`, `invoices`, `journal_entries`, `pending_demands`, `profiles`, `repairs`, `reservations`, `transactions`, `vehicles`, `whatsapp_sessions`.

- [ ] **Step 4: Run schema:check from local machine**

```bash
SUPABASE_URL=https://apzarvjxvwtlphdqirjm.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-prod-service-role-key> \
node scripts/schemaCheck.js
```

Expected: `153/153 columns OK` (or current count — zero failures).

---

### Task 3: Configure Supabase Auth & Storage for Production

**Context:** Auth must redirect to `kiraflow.ma` (not the staging domain). Storage buckets must exist for contract PDFs.

- [ ] **Step 1: Configure Auth settings**

In Supabase dashboard → Authentication → URL Configuration:

- **Site URL:** `https://kiraflow.ma`
- **Redirect URLs:** add both:
  - `https://kiraflow.ma`
  - `https://kiraflow.ma/**`

Remove any staging URLs (e.g. `rentaflow.vercel.app`) from the redirect list.

- [ ] **Step 2: Update email templates**

In Authentication → Email Templates, check each template (Confirm signup, Reset password, Magic link, Invite user). If any contain hardcoded URLs pointing to staging, replace with `https://kiraflow.ma`.

- [ ] **Step 3: Create Storage buckets**

In Storage → New bucket, create:

| Bucket name | Public | Notes |
|---|---|---|
| `signed_contracts` | No (private) | Used by `server/lib/contractSigning.js` and `server/routes/contracts.js` for signed PDFs |
| `agency-templates` | No (private) | Used by `server/routes/agency.js` for contract template uploads |

- [ ] **Step 4: Set Storage RLS policies**

For each bucket, add a policy allowing authenticated users to read/write objects scoped to their agency. Match the policies from staging Supabase (check staging dashboard → Storage → Policies for the exact rules). At minimum:

For `signed_contracts`:
```sql
-- Allow service_role full access (backend uploads via service_role)
-- No user-facing policy needed — all access goes through the backend
```

For `agency-templates`:
```sql
-- Same: backend handles all uploads/downloads via service_role
```

Since both buckets are accessed exclusively through the backend (which uses `service_role`), you may not need user-facing RLS policies. Verify by checking staging bucket policies.

- [ ] **Step 5: Verify Auth config**

Open an incognito browser, navigate to:
```
https://apzarvjxvwtlphdqirjm.supabase.co/auth/v1/settings
```

Confirm `site_url` shows `https://kiraflow.ma`.

---

### Task 4: Configure Railway Production Environment Variables

**Context:** The Railway prod service must have all env vars set BEFORE the code deploys, otherwise `NODE_ENV=production` security guards will throw on startup.

- [ ] **Step 1: Open Railway prod service settings**

Railway dashboard → your production project → service → Variables tab.

- [ ] **Step 2: Set all environment variables**

Add each variable. Use the values from the Pre-requisites table:

```
SUPABASE_URL=https://apzarvjxvwtlphdqirjm.supabase.co
SUPABASE_ANON_KEY=<prod-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>
FRONTEND_URL=https://kiraflow.ma
NODE_ENV=production
ANTHROPIC_API_KEY=<your-anthropic-key>
ENCRYPTION_KEY=<freshly-generated-32-byte-hex>
ENCRYPT_PII=true
SIGNING_TOKEN_SECRET=<freshly-generated-32-byte-hex>
RESEND_API_KEY=<your-resend-key-or-leave-empty>
OPENAI_API_KEY=<your-openai-key-or-leave-empty>
TWILIO_ACCOUNT_SID=<prod-twilio-sid>
TWILIO_AUTH_TOKEN=<prod-twilio-token>
TWILIO_API_KEY_SID=<prod-twilio-api-key-sid>
TWILIO_API_KEY_SECRET=<prod-twilio-api-key-secret>
TWILIO_WHATSAPP_FROM=whatsapp:<prod-number>
```

- [ ] **Step 3: Double-check critical vars**

Verify these three specifically — they cause hard crashes if wrong in `NODE_ENV=production`:

| Variable | Why it's critical |
|---|---|
| `SIGNING_TOKEN_SECRET` | `server/lib/contractSigning.js` throws without it |
| `FRONTEND_URL` | CORS rejects all frontend requests if wrong |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend can't bypass RLS — all DB writes fail |

- [ ] **Step 4: Verify Railway is set to deploy from `main` branch**

Railway dashboard → service → Settings → Source. Confirm:
- **Repository:** `o2elmouh/Kira_project_RentalflowApp`
- **Branch:** `main`
- **Auto-deploy:** enabled

---

### Task 5: Configure Vercel Production Environment Variables

**Context:** Vercel bakes `VITE_*` vars into the frontend bundle at build time. Production vars must be scoped to the "Production" environment — staging vars stay on "Preview".

- [ ] **Step 1: Open Vercel project settings**

Vercel dashboard → project → Settings → Environment Variables.

- [ ] **Step 2: Set production-scoped variables**

For each variable, select **Production** environment only (uncheck Preview and Development):

```
VITE_SUPABASE_URL=https://apzarvjxvwtlphdqirjm.supabase.co
VITE_SUPABASE_ANON_KEY=<prod-anon-key>
VITE_API_URL=<railway-prod-url>
VITE_USE_AUTH=true
```

- [ ] **Step 3: Verify staging vars are scoped to Preview only**

Check that the existing staging variables (`VITE_SUPABASE_URL=https://meenuernokarrcmcbgsq.supabase.co`, etc.) are only on **Preview** environment, NOT Production. If they're on "All Environments", edit each one to limit scope to Preview + Development only.

- [ ] **Step 4: Verify Vercel is set to deploy from `main` for production**

Vercel dashboard → project → Settings → Git. Confirm:
- **Production Branch:** `main`

---

### Task 6: Set Up kiraflow.ma Domain on Vercel

**Context:** The custom domain needs DNS records pointed at Vercel. SSL is automatic.

- [ ] **Step 1: Add domain in Vercel**

Vercel dashboard → project → Settings → Domains → Add `kiraflow.ma`.

Vercel will display the required DNS records (typically an A record to `76.76.21.21` or a CNAME to `cname.vercel-dns.com`).

- [ ] **Step 2: Configure DNS at registrar**

Log in to your domain registrar for `kiraflow.ma` and add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` (or whatever Vercel shows) | 300 |
| CNAME | `www` | `cname.vercel-dns.com` | 300 |

**Important:** Set TTL to **300 seconds** (5 minutes) — this allows fast DNS changes if we need to roll back.

- [ ] **Step 3: Wait for DNS propagation**

Check propagation via:
```bash
dig kiraflow.ma +short
```

Expected: Vercel's IP address. May take 5-30 minutes.

- [ ] **Step 4: Verify SSL**

Once DNS propagates, Vercel auto-provisions an SSL certificate. Check:
- Visit `https://kiraflow.ma` — should show a valid certificate (lock icon)
- Visit `http://kiraflow.ma` — should redirect to HTTPS

Vercel dashboard → Domains → `kiraflow.ma` should show a green checkmark.

---

### Task 7: Prepare Staging Branch for Merge

**Context:** Before merging, staging must be clean — no uncommitted changes, all tests passing.

**Files:**
- Check: `components/Sidebar.jsx` (current version)

- [ ] **Step 1: Stash or commit any pending work**

```bash
git status
```

If there are uncommitted changes, either commit them or stash:
```bash
git stash
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test
```

Expected: all tests pass (459/459 or current count). If any test fails, fix it on staging before proceeding.

- [ ] **Step 3: Verify the current version**

```bash
grep -n "v1\." components/Sidebar.jsx | head -3
```

Note the version (expected: `v1.16.2`). This is the version going to production.

- [ ] **Step 4: Build frontend locally to verify no build errors**

```bash
npm run build
```

Expected: clean Vite build, output in `dist/`. No warnings about missing env vars (build reads from `.env.staging` or `.env`).

---

### Task 8: Merge Staging -> Main and Tag

**Context:** This is the trigger for production deployment. Railway and Vercel will both auto-deploy from `main`. Make sure Tasks 1-6 are complete before this step.

- [ ] **Step 1: Fetch latest remote state**

```bash
git fetch origin
```

- [ ] **Step 2: Switch to main and merge**

```bash
git checkout main
git merge staging -m "release: merge staging to production (v1.16.2)"
```

Expected: fast-forward or clean merge. If conflicts arise (unlikely since all work was on staging), resolve and commit.

- [ ] **Step 3: Tag the release**

```bash
git tag v1.16.2-prod
```

- [ ] **Step 4: Push main + tag**

```bash
git push origin main
git push origin v1.16.2-prod
```

This triggers:
1. GitHub Actions CI (build + type-check) — ~2 min
2. Vercel production build — ~1-2 min
3. Railway production deploy — ~2-3 min

- [ ] **Step 5: Switch back to staging**

```bash
git checkout staging
```

Stay on staging for future development work.

---

### Task 9: Verify Deployments

**Context:** Both Railway and Vercel should auto-deploy within 5 minutes of the push. Verify before running smoke tests.

- [ ] **Step 1: Verify GitHub Actions CI**

Go to: `https://github.com/o2elmouh/Kira_project_RentalflowApp/actions`

The latest push to `main` should show a green checkmark. If it fails, read the logs — likely a missing env var in GitHub Secrets.

- [ ] **Step 2: Verify Railway deployment**

Railway dashboard → prod service → Deployments. Latest deployment should show "Success".

Test the health endpoint:
```bash
curl https://<railway-prod-url>/health
```

Expected: `200 OK` with a JSON body.

- [ ] **Step 3: Verify Vercel deployment**

Vercel dashboard → project → Deployments. Latest production deployment should show "Ready".

Open `https://kiraflow.ma` in a browser. Expected: the RentaFlow login page loads.

- [ ] **Step 4: Verify CORS**

Open browser DevTools console on `https://kiraflow.ma` and run:

```javascript
fetch('https://<railway-prod-url>/health').then(r => r.json()).then(console.log).catch(console.error)
```

Expected: health response JSON, no CORS error. If CORS fails, check `FRONTEND_URL` on Railway matches exactly `https://kiraflow.ma`.

---

### Task 10: Run Smoke Test Checklist

**Context:** These tests verify every critical path works end-to-end on production. Do them in order — later tests depend on data created by earlier ones.

- [ ] **Step 1: Auth signup (test #4)**

On `https://kiraflow.ma`, create a test agency account:
- Email: `test@kiraflow.ma` (or your own email)
- Password: a strong test password

Expected: email confirmation sent (check inbox), redirect to Onboarding after confirming.

- [ ] **Step 2: Onboarding (test #5)**

Complete the 2-step agency setup:
- Agency name: `Test Agency`
- City: `Casablanca`
- ICE: any valid number
- RC: any valid number

Expected: agency row created in `agencies` table, redirect to Dashboard.

- [ ] **Step 3: Default accounts seeded (test #6)**

In Supabase SQL Editor:
```sql
SELECT code, name FROM accounts WHERE agency_id = '<your-test-agency-id>' ORDER BY code;
```

Expected: 17 rows (codes 1000 through 4040 — the Moroccan chart of accounts).

- [ ] **Step 4: Fleet CRUD (test #7)**

Add a vehicle via the Fleet page. Edit it. Refresh the page.

Expected: vehicle persists, edits saved.

- [ ] **Step 5: Client CRUD — encryption verify (test #8)**

Add a client with a CIN number and driving licence.

In Supabase SQL Editor:
```sql
SELECT id_number, id_number_enc, driving_license_num, driving_license_num_enc
FROM clients WHERE agency_id = '<your-test-agency-id>' LIMIT 1;
```

Expected: `id_number` and `driving_license_num` are NULL (plaintext not stored). `id_number_enc` and `driving_license_num_enc` contain encrypted blobs (long base64 strings). This confirms `ENCRYPT_PII=true` is working.

- [ ] **Step 6: New Rental flow (test #9)**

Create a contract end-to-end: select the test client + vehicle, fill rental dates, finalize.

Expected: contract row in DB, vehicle status changes to `rented` in Fleet page.

- [ ] **Step 7: Restitution (test #10)**

Close the contract via the Restitution wizard (4 steps).

Expected: contract status = `closed`, journal entries posted (check `journal_entries` table), deposit released.

- [ ] **Step 8: Accounting (test #11)**

Navigate to Comptabilite. Check:
- Dashboard tab: non-zero revenue
- Journal tab: entries from the test contract
- Bilan tab: click "Regenerer ecritures" if needed

Expected: non-zero numbers, balanced journal.

- [ ] **Step 9: Contract signing (test #12)**

Send a signing link for a test contract (WhatsApp or email channel).

Open the link. Expected: `https://kiraflow.ma/?sign=<token>` loads the signature canvas. If the link points to `rentaflow.vercel.app` instead, `FRONTEND_URL` on Railway is wrong.

- [ ] **Step 10: WhatsApp inbound (test #13-14)**

Send a test message to the prod WhatsApp number from a personal phone.

Expected: message appears in Basket as a new lead, with `classification` field populated (AI triage ran).

- [ ] **Step 11: PDF generation (test #15)**

Download a contract PDF from the Contracts page.

Expected: PDF renders with correct data (agency name, client name, vehicle, dates, amounts).

---

### Task 11: Post-Launch DNS Hardening

**Context:** After 48 hours of stable production, increase DNS TTL and verify everything is settled.

- [ ] **Step 1: Monitor for 48 hours**

Watch for:
- Railway logs: any unhandled errors or `NODE_ENV=production` guard failures
- Supabase dashboard: failed queries (look for HTTP 400/500 in Logs → PostgREST)
- WhatsApp: Baileys session stays connected (Railway logs should show periodic heartbeats, no `Timed Out` errors)
- Anthropic API: check usage dashboard for unexpected Haiku call volume

- [ ] **Step 2: Raise DNS TTL**

After 48h stable, update DNS TTL at registrar:

| Type | Name | TTL (new) |
|---|---|---|
| A | `@` | 3600 |
| CNAME | `www` | 3600 |

- [ ] **Step 3: Document the production environment**

Update `STATUS.md` and `CLAUDE.md` to reference the production URLs:
- Production frontend: `https://kiraflow.ma`
- Production backend: `https://<railway-prod-url>`
- Production Supabase: `https://apzarvjxvwtlphdqirjm.supabase.co`

---

## Rollback Quick Reference

| Level | Scenario | Action | Time |
|---|---|---|---|
| **1** | Frontend bug | Vercel dashboard → Deployments → promote previous build | < 30s |
| **2** | Backend bug | Railway dashboard → Deployments → Rollback | < 2 min |
| **3** | Full abort | Remove `kiraflow.ma` from Vercel + reset prod Supabase + fix on staging | < 10 min |

---

## Cutover Day Timeline (estimated)

| Time | Task | Duration |
|---|---|---|
| T+0:00 | Task 1: Reset Supabase | 5 min |
| T+0:05 | Task 2: Run 31 migrations | 30-45 min |
| T+0:50 | Task 3: Auth + Storage config | 10 min |
| T+1:00 | Task 4: Railway env vars | 10 min |
| T+1:10 | Task 5: Vercel env vars | 5 min |
| T+1:15 | Task 6: DNS setup | 10 min (+ propagation wait) |
| T+1:25 | Task 7: Prepare staging | 10 min |
| T+1:35 | Task 8: Merge + push | 5 min |
| T+1:40 | Task 9: Verify deployments | 10 min |
| T+1:50 | Task 10: Smoke tests | 30-45 min |
| T+2:30 | **Production live** | |
| T+48:00 | Task 11: DNS hardening | 5 min |

**Total cutover time: ~2.5 hours** (excluding DNS propagation wait).
