# RentaFlow — Active Sprint Status

> Update this file after every successful push. Do NOT edit CLAUDE.md for version or task changes.

---

## Pending Tasks
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- **Law 09-08 compliance:** Phases 4–5 remaining — see [.claude/PHASE_PLAN.md](PHASE_PLAN.md). Phases 1–3 shipped.
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
