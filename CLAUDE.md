# RentaFlow — Project Context

## Core Directives
1. **Read-First:** Always read this file before acting. Never guess state.
2. **Token Efficiency:** No redundant summaries. Be concise.
3. **Verification:** Confirm imports, server status, and SQL signatures (`DROP FUNCTION IF EXISTS`) before finishing.
4. **Process:** State plan → Get approval → Execute.
5. **Ledger:** End sessions with a `Context Update` block to update this file.
6. **Git:** Feature branches + structured commits (`feat:`, `fix:`, `chore:`).
**Testing:** Write and run unit tests for every bug fix or new feature using the existing Vitest suite before completion.
8. **Efficiency:** If a file (like pdf.js) is too large to parse or a task stalls, stop immediately, suggest a modular split, and restart.

---

## Project Context & Stack
**RentaFlow:** Moroccan Car Rental SaaS (React 18, Vite, dark theme).
- **Backend:** Node/Express (Railway), Supabase (Auth/DB/Storage).
- **Auth:** Supabase Auth (always enabled).
- **i18n:** French (default), Arabic (RTL), English. All namespaces fully wired.
- **Integrations:** Resend (Email), Anthropic (Claude Haiku AI).
- **Key Libs:** `lucide-react`, `jsPDF`, `graphify`.

---

## Architecture Patterns
```
/                         ← Vite frontend root
├── App.jsx               ← Page router (useState), UserContext provider
├── main.jsx              ← Entry: i18n import first, Suspense wrapper
├── index.css             ← Global styles + RTL rules for Arabic
├── components/
│   ├── Sidebar.jsx       ← Nav + role badge + LanguageSelector
│   ├── LanguageSelector.jsx
│   └── CarPhotoGuide.jsx
├── pages/
│   ├── Auth.jsx          ← Login + Signup (Supabase auth)
│   ├── Onboarding.jsx    ← 2-step agency setup (name, city, ICE, RC)
│   ├── Dashboard.jsx
│   ├── Fleet.jsx         ← Vehicle management + amortissement + repairs
│   ├── NewRental.jsx     ← New contract wizard
│   ├── Restitution.jsx   ← 4-step vehicle return process
│   ├── RestitutionPicker.jsx ← Pick active contract to restitute
│   └── OtherPages.jsx    ← Clients, Contracts, Invoices, Settings (tabs: Agence/Parc/Général/Équipe)
├── lib/
│   ├── supabase.js       ← Supabase client (anon key)
│   ├── api.js            ← Frontend API client → Railway backend
│   ├── i18n.js           ← i18next config (fr default, ar, en)
│   └── UserContext.js    ← React context: user, profile, role
├── utils/
├── public/locales/
│   ├── fr/               ← 10 namespaces (common, auth, onboarding, dashboard, fleet, contracts, clients, invoices, restitution, settings)
│   ├── ar/               ← same 10 namespaces (Moroccan Arabic)
│   └── en/               ← common.json only (fallback skeleton)
└── server/
    ├── index.js          ← Express app, CORS, rate limit, routes
    ├── middleware/auth.js ← requireAuth + requireAdmin
    ├── lib/supabaseAdmin.js ← service_role client
    └── routes/
        ├── health.js     ← GET /health
        ├── agency.js     ← GET/PATCH /agency
        ├── contracts.js  ← POST /contracts/:id/close|extend
        ├── email.js      ← POST /email/contract (Resend placeholder)
        └── team.js       ← GET/POST/PATCH/DELETE /team
```

---

## Key Patterns
See [.claude/reference/patterns.md](.claude/reference/patterns.md) for auth flow, role system, i18n, data layer, and navigation patterns.

---

## Environment Variables & Supabase Schema
See [.claude/reference/schema.md](.claude/reference/schema.md) for all env vars (Vercel + Railway) and Supabase table definitions.

---

## Current Task Status

See [CHANGELOG.md](CHANGELOG.md) for completed work history.
### Pending
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)

---

## GitHub
Repo: `https://github.com/o2elmouh/Kira_project_RentalflowApp`
Main branch: `main`
Latest commit: `650ad26` — feat(network): RentalFlow Network feature (staging)

## Versioning
- Version is displayed in the Sidebar bottom-left, next to the agency name.
- **Every push must bump the version** in `components/Sidebar.jsx` (the `v1.x.x` string).
- Current version: **v1.1.6** (commit `adc2bda` baseline, bumped each push from here)
