# RentaFlow — Active Sprint Status

> Update this file after every successful push. Do NOT edit CLAUDE.md for version or task changes.

---

## Pending Tasks
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)

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
| v1.4.0 | pending | Phase 1 / Law 09-08 compliance: CNDP privacy notice on ScanStep, full PrivacyPolicy.jsx page (FR + AR), Sidebar footer link |
| v1.3.1 | `6a86168` | Design system overhaul: Mastercard-inspired (Canvas Cream, Ink Black, pill radii, Sofia Sans, Signal Orange consent-only) — index.css full token rewrite + Sidebar + 7 pages |
| v1.3.1 | `5b9d658` | Fix classifyTextMessage max_tokens 256→512 (JSON truncation bug causing SmartQuotePanel to never appear) |
| v1.2.3 | pending | Smart Quote: available-vehicles only, start/end date fields, notes field, channel-aware send button (Email vs WhatsApp), POST /email/send-offer via Resend |
| v1.2.2 | `22a561a` | Fix Escalader: sets classification='lead' + status='pending' so escalated alerts appear in Leads tab |
| v1.2.1 | `ea88635` | Fix triage pre-filter: add semaine/semaines/journée/week/weeks/woche to MEDIUM, renseigner/besoin/need to LOW |
| v1.2.0 | `3533bbf` | Alerts Dashboard: orange widget on Dashboard, Leads/Alertes tabs in Basket, triage pipeline, DB migration `002_alerts_classification.sql` |
