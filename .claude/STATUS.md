# RentaFlow — Active Sprint Status

> Update this file after every successful push. Do NOT edit CLAUDE.md for version or task changes.

---

## Pending Tasks
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- **Law 09-08 compliance:** Phase 5 remaining — see [.claude/PHASE_PLAN.md](PHASE_PLAN.md). Phases 1–4 shipped.
- **Railway cron:** schedule `cleanup:pending` daily at 03:00 UTC in Railway dashboard (Phase 2)

---

## Versioning
- Version is displayed in the Sidebar bottom-left, next to the agency name.
- **Every push must bump the version** in `components/Sidebar.jsx` (the `v1.x.x` string).
- **Increment rule:** patch (+0.0.1) for fixes/small changes, minor (+0.1.0) for new features.
- **Every staging push must add a row to the Staging Deployments table below.**

---

## Staging Deployments
| Version | Commit | What's in it |
|---|---|---|
| v1.10.5 | pending | **Phase 4 / Law 09-08 retention automation**: (1) migration `20260515_agencies_retention.sql` adds `agencies.retention_years int NOT NULL DEFAULT 10 CHECK (5-30)`. (2) New `server/lib/anonymize.js` extracts the anonymize-client logic shared between `admin.js` and the new retention cron — same audit_log writes, distinct `action` field (`client.anonymize` vs `client.anonymize.retention`). (3) `server/scripts/enforceRetention.js` + `enforceRetention.test.js` (8 cases): per-agency loop, picks oldest admin as audit actor, anonymizes clients whose contracts are all closed and whose latest `closed_at` is past the retention window. (4) `server/routes/agency.js` PATCH now accepts `retention_years` with 5-30 validation. (5) `pages/settings/PrivacyTab.jsx` adds a retention-period input (admin-only, reuses `api.updateAgency`). (6) `server/index.js` wires monthly cron at `30 4 1 * *`. (7) `package.json` adds `enforce:retention` npm script. |
| v1.10.4 | `8ecc7f0` | Perf + bugfix: (1) `lib/db.js` `getAgencyId()` now caches per-user in module scope and uses `auth.getSession()` (localStorage, no network) instead of `auth.getUser()` — eliminates ~600-1000 ms latency from every db.js call, fixing the slow vehicle-fetch on NewRental; cache invalidated on `SIGNED_OUT`/`USER_UPDATED`. (2) `pages/SignContract.jsx` — moved `drawing`/`hasStrokes` flags from `useState` to `useRef` during the canvas drag (state-flip on `stopDraw` only), preventing the mid-draw re-render that was clearing the canvas bitmap on stroke release. |
| v1.10.3 | `14512d4` | Fix: Simulate-scan buttons stripped from prod build (DEV gate); also `t('privacy.scanNotice')` → `t('common:privacy.scanNotice')` namespace fix |
| v1.10.2 | `6ff74be` | feat(scan): dev-only simulate buttons for CIN+licence scans (regression: DEV gate compile-time stripped from staging build — see v1.10.3) |
| v1.9.0 | pending | Booking Hub: omnichannel reservations table — new `reservations` Supabase table with enums (booking_source, reservation_status), RLS, 6 indexes; Express GET/POST/PATCH `/reservations` with server-side filters/sort/pagination; React page using TanStack Table v8 + Query v5; FilterBar (channel, status, search, date range, price range); SourceChannelBadge (Mail/MessageCircle/Globe/User), StatusBadge; ReservationDetailsPanel (side sheet w/ source_metadata JSON viewer); date-fns + date-fns-tz timezone utils (UTC ↔ user-local); FR/AR/EN i18n; new Sidebar nav "Réservations"; NewRental wizard now creates a reservation row on completion with channel auto-detection (WHATSAPP/EMAIL from prefilledLead.source, else IN_PERSON) |
| v1.8.1 | 84d63c0 | Bugfix: Staff role access — hide Settings nav from staff (ADMIN_ONLY_PAGES), Basket gate stays on agency premium status |
| v1.8.0 | pending | Feature bundle (6): (1) Arabic RTL — `<html dir>` now synced on i18n init + sidebar nav flip CSS; (2) async team invitations — TeamTab fires `inviteMember` without awaiting, toast appears immediately; (3) staff signup flow — Onboarding now blocks invited users on a password-setup form before silent agency join; (4) role-based Settings — staff role sees only the Privacy tab, admin/manager unchanged; (5) Sidebar Basket unread badge — live count of `status=pending` leads via Realtime subscription; (6) ID document mismatch modal — ScanStep now compares CIN/passport names vs licence names and surfaces a Cancel/Continue modal on divergence |
| v1.7.1 | pending | Fix(e-sig): unsigned PDF upload was hitting Storage RLS. Moved upload to backend (service_role) — frontend now sends pdf_base64 via /contracts/:id/send-whatsapp; no storage policies needed |
| v1.7.0 | `67e7e89` | Feat: custom e-signature flow — manager generates unsigned PDF (jsPDF) + uploads to Supabase Storage, backend mints UUID signing token + dispatches WhatsApp link via Twilio, public /?sign=<token> page captures signature on HTML5 canvas, backend stamps PDF with pdf-lib at bottom-right of last page + uploads stamped version, manager dashboard subscribes via supabase.channel postgres_changes for instant "Terminer" enable. Migration adds signature_status/signing_token/signed_pdf_url to contracts. New server dep: pdf-lib@^1.17.1 |
| v1.6.1 | `e0158b0` | Fix(NewRental drafts): RentalStep/PhotoStep/ContractStep now pass their state to onSaveAndQuit (was passing the React click event); empty-draft check now inspects field values instead of object truthiness so empty stub objects no longer create phantom drafts |
| v1.6.0 | `eb4e85b` | Bug bundle: (1) team invite role validation + agency join fix (data loss bug) + email timing logs, (2) language selector moved to merged Settings → Configuration générale (3 tabs collapsed), (3) DocumentExpiryAlert modal on ScanStep for expired CIN/license, (4) NewRental draft persistence + draft picker grid with "+ New Rental" card |
| v1.5.0 | `ac80965` | Phase 3 / Law 09-08: right to erasure endpoint, audit_log table, Settings → Confidentialité tab (admin), Clients.jsx anonymization guards, FR+AR i18n |
| v1.4.1 | `c864768` | Phase 2 / Law 09-08: pending demands cleanup script, anonymized_at migration, cleanup:pending npm script |
| v1.4.0 | `a3a3dd5` | Phase 1 / Law 09-08 compliance: CNDP privacy notice on ScanStep, full PrivacyPolicy.jsx page (FR + AR), Sidebar footer link |
| v1.3.1 | `6a86168` | Design system overhaul: Mastercard-inspired (Canvas Cream, Ink Black, pill radii, Sofia Sans, Signal Orange consent-only) — index.css full token rewrite + Sidebar + 7 pages |
| v1.3.1 | `5b9d658` | Fix classifyTextMessage max_tokens 256→512 (JSON truncation bug causing SmartQuotePanel to never appear) |
| v1.2.3 | pending | Smart Quote: available-vehicles only, start/end date fields, notes field, channel-aware send button (Email vs WhatsApp), POST /email/send-offer via Resend |
| v1.2.2 | `22a561a` | Fix Escalader: sets classification='lead' + status='pending' so escalated alerts appear in Leads tab |
| v1.2.1 | `ea88635` | Fix triage pre-filter: add semaine/semaines/journée/week/weeks/woche to MEDIUM, renseigner/besoin/need to LOW |
| v1.2.0 | `3533bbf` | Alerts Dashboard: orange widget on Dashboard, Leads/Alertes tabs in Basket, triage pipeline, DB migration `002_alerts_classification.sql` |
