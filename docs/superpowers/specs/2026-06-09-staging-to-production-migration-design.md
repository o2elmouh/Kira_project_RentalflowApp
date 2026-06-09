# Staging-to-Production Migration Design

> **Date:** 2026-06-09
> **Approach:** Big Bang (single cutover day)
> **Status:** Approved

---

## Constraints

| Dimension | Decision |
|---|---|
| **Supabase prod** | `apzarvjxvwtlphdqirjm` — exists, wiped clean for fresh start |
| **Railway prod** | Existing separate service |
| **Frontend domain** | `kiraflow.ma` → Vercel |
| **Backend domain** | Railway default production URL |
| **WhatsApp** | Fresh number for prod (new Baileys session) |
| **PII encryption** | `ENCRYPT_PII=true` from day one |
| **Data** | Empty — clean start, no business data migration |

---

## Section 1: Supabase Production Setup

**Goal:** Clean prod Supabase with all 31 migrations applied and proper auth config.

### Steps

1. **Wipe existing data** — reset the prod Supabase database via the dashboard (Settings > Danger Zone > Reset Database). This gives a clean `public` schema.
2. **Apply all 31 migrations in order** — from `001_initial_schema.sql` through `20260608_accounting_schema_fix.sql`. Clean slate means they run sequentially with no conflicts. Can be done via `supabase db push` or manually in the SQL editor.
3. **Auth config** in Supabase dashboard:
   - Site URL: `https://kiraflow.ma`
   - Redirect URLs: `https://kiraflow.ma/**`, `https://kiraflow.ma`
   - Email templates: update any links from staging URLs to `kiraflow.ma`
4. **RLS policies** — already defined in the migrations; no extra work.
5. **Storage buckets** — ensure `contracts`, `signed-contracts` (or whatever buckets staging uses) exist with the same policies.

### Verification

Run `npm run schema:check` against the prod Supabase URL — expect 153/153 columns OK.

---

## Section 2: Railway Production Configuration

**Goal:** Production Railway service running the Express backend with correct env vars.

### Environment Variables

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://apzarvjxvwtlphdqirjm.supabase.co` | Prod project |
| `SUPABASE_ANON_KEY` | *(from prod Supabase dashboard)* | |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from prod Supabase dashboard)* | Backend RLS bypass |
| `FRONTEND_URL` | `https://kiraflow.ma` | CORS origin + signing link URLs |
| `NODE_ENV` | `production` | Enables security guards |
| `PORT` | Railway's `$PORT` | Railway injects automatically |
| `ANTHROPIC_API_KEY` | *(same key or separate prod key)* | AI pipeline (Haiku) |
| `ENCRYPTION_KEY` | *(new strong 32-byte key)* | **Fresh for prod** — never share with staging |
| `ENCRYPT_PII` | `true` | Day-one encryption |
| `SIGNING_TOKEN_SECRET` | *(new strong secret)* | **Required** in `NODE_ENV=production` |
| `RESEND_API_KEY` | *(if ready, else leave empty)* | Non-blocking if absent |
| `OPENAI_API_KEY` | *(for Whisper transcription)* | Optional — voice notes won't transcribe without it |
| `TWILIO_ACCOUNT_SID` | *(prod values)* | |
| `TWILIO_AUTH_TOKEN` | *(prod values)* | |
| `TWILIO_WHATSAPP_FROM` | *(prod number)* | |

### Key Decisions

- **`ENCRYPTION_KEY` must be fresh** — staging and prod must never share encryption keys.
- **`SIGNING_TOKEN_SECRET` is mandatory** — `contractSigning.js` throws on startup without it in `NODE_ENV=production`.
- **`FRONTEND_URL` = `https://kiraflow.ma`** — controls CORS + signing link base URL.

### Deployment

Railway deploys from `main` branch. Merge `staging` -> `main` triggers auto-deploy.

---

## Section 3: Vercel Production Configuration

**Goal:** Frontend deployed on Vercel, serving from `kiraflow.ma`.

### Environment Variables (Production scope only)

| Variable | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://apzarvjxvwtlphdqirjm.supabase.co` | Prod Supabase |
| `VITE_SUPABASE_ANON_KEY` | *(from prod Supabase dashboard)* | Public anon key |
| `VITE_API_URL` | *(Railway prod URL)* | |
| `VITE_USE_AUTH` | `true` | |

### Domain Setup

1. Add `kiraflow.ma` as custom domain in Vercel project settings
2. Add DNS records (A or CNAME) provided by Vercel at the domain registrar
3. Set DNS TTL to **300s** initially for fast revert capability
4. Vercel handles SSL automatically once DNS propagates

### Deployment

Vercel builds from `main` branch. Staging vars stay on "Preview" environment, prod vars on "Production" environment. The existing `vercel.json` (SPA rewrites, cache headers) works as-is.

---

## Section 4: Git Flow — Staging -> Main Merge

**Goal:** Get all staging code onto `main` for production deployment.

### Merge Strategy

1. **Ensure staging is clean** — all changes committed, `npm run test` passing
2. **Merge staging -> main** via single merge commit:
   ```
   git checkout main
   git merge staging
   ```
   - No rebase (preserve full commit history)
   - No squash (50+ versions of context valuable for debugging)
3. **Push main** — triggers CI, then Vercel + Railway auto-deploy
4. **Tag the release** — `git tag v1.16.2-prod` for a clear rollback point

### Going Forward

- `staging` stays the development branch
- Ship to production: merge `staging` -> `main`
- Hotfixes: branch from `main`, fix, merge to both `main` and `staging`

### No Code Changes Needed

Frontend reads `VITE_*` at build time, backend reads env vars at runtime. Same codebase serves both environments — platform env vars determine which services it connects to.

---

## Section 5: Pre-Launch Smoke Test Checklist

| # | Test | How to verify | Pass criteria |
|---|---|---|---|
| 1 | Schema health | `npm run schema:check` against prod | 153/153 columns OK |
| 2 | Backend health | `GET {railway-prod-url}/health` | 200 OK |
| 3 | CORS | `fetch('{api-url}/health')` from `kiraflow.ma` in browser | No CORS error |
| 4 | Auth signup | Create test agency via signup flow | Redirect to Onboarding |
| 5 | Onboarding | Complete agency setup | Agency row in DB, redirect to Dashboard |
| 6 | Default accounts seeded | Check `accounts` table | 17 chart-of-accounts rows |
| 7 | Fleet CRUD | Add/edit a vehicle | Persists in Fleet page |
| 8 | Client CRUD (encrypted) | Add client with CIN/licence | `_enc` columns populated, plaintext columns empty |
| 9 | New Rental flow | Full contract creation | Contract row, vehicle -> `rented` |
| 10 | Restitution | Close test contract | Contract closed, journal entries, deposit released |
| 11 | Accounting | Check Comptabilite tabs | Non-zero revenue, balanced journal |
| 12 | Contract signing | Send signing link | Link loads at `kiraflow.ma/?sign=<token>` |
| 13 | WhatsApp inbound | Send test message to prod number | Lead appears in Basket |
| 14 | AI triage | Verify classification | `classification` field populated |
| 15 | PDF generation | Download a contract PDF | Correct data rendered |

If any test fails: fix on `staging`, re-merge to `main`, re-deploy.

---

## Section 6: Rollback Strategy

### Level 1 — Frontend rollback (instant)

Vercel keeps every deployment as an immutable snapshot. Dashboard > Deployments > previous deployment > "Promote to Production". Takes effect in < 30 seconds.

### Level 2 — Backend rollback (< 2 min)

Railway supports instant rollback to any previous deployment via dashboard. Alternatively: `git revert` on `main`, push, Railway auto-deploys.

### Level 3 — Full abort (< 10 min)

1. Remove `kiraflow.ma` custom domain from Vercel (or point DNS to maintenance page)
2. Reset prod Supabase database (no real user data at launch)
3. Fix on `staging`, re-run full cutover procedure

### DNS Safety Net

- Launch with TTL = 300s (5 min) for fast changes
- After 48h stable, raise TTL to 3600s (1 hour)

### Monitoring (first 48h)

- Railway logs: unhandled errors, `NODE_ENV=production` guards firing
- Supabase dashboard: failed queries (PostgREST 42703 = missing column)
- Baileys WhatsApp session connectivity
- Anthropic API usage (Haiku calls)
