# RentaFlow — Project Context

## Instructions for Claude

- **MANDATORY FIRST STEP:** At the start of EVERY conversation, read this entire CLAUDE.md file. No exceptions. Never start working without knowing the current project state.
- **Never Lose Context:** If the user says "keep going" or continues mid-task, re-read CLAUDE.md first to reconstruct context before acting. Do not guess what was in progress.
- **Read-Only Context:** Use this file to understand the current state of the app. Do not re-explain or repeat information already here unless explicitly asked.
- **Token Efficiency:** Skip re-summarising the stack, file structure, or completed work — it's already documented below.
- **Ledger Update:** At the end of each session, or when asked, produce a `Context Update` block — a concise summary of new features, bug fixes, and environment changes. Format it as a code block so it can be copied back into this file.
- **Verify Before Responding:** Before submitting any answer — code, SQL, instructions, or explanations — re-read it and confirm it is correct, complete, and consistent with the current codebase. Do not send a response that you are not confident in.
- **Verification Before Completion:** Before declaring any task done, confirm: (1) no broken imports, (2) all edited files are saved, (3) the dev server still starts, (4) the change does what was asked.
- **Git Workflow:** Never commit directly to `main`. Always work on a feature branch. Use `/commit` skill for structured commit messages (`feat:`, `fix:`, `chore:`). Use `/code-reviewer` before merging.
- **GitHub MCP:** Available for PR creation and issue viewing. Token must be set via `GITHUB_TOKEN` env var.

---

## Overview
**RentaFlow** is a Moroccan car rental agency SaaS (location de voitures).
Target market: small/mid-size Moroccan rental agencies.
Stack: React 18 + Vite 5 SPA, **localStorage-only** data layer. Supabase is NOT used.

---

## Tech Stack

### Frontend
| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite 5 |
| Routing | `useState`-based page switching (no react-router) |
| Styling | Custom CSS variables (dark theme), no Tailwind |
| Icons | lucide-react |
| PDF | jsPDF + jspdf-autotable |
| i18n | i18next + react-i18next + i18next-browser-languagedetector + i18next-http-backend |
| Auth | Supabase Auth (toggled via `VITE_USE_AUTH=true/false`) |
| Data | localStorage (`rf_*` keys) — Supabase syncs when auth is enabled |

### Backend (`server/`)
| Layer | Choice |
|-------|--------|
| Runtime | Node.js (Express 4) |
| Hosting | Railway |
| Auth middleware | Supabase JWT verification + profile lookup |
| DB client | `supabaseAdmin` (service_role key — never in frontend) |
| Email | Resend (placeholder, `RESEND_API_KEY` when ready) |
| Rate limiting | express-rate-limit (global 300/15min, email 10/hour) |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Vercel | Frontend hosting, SPA rewrites, cache headers |
| Railway | Backend API hosting |
| Supabase | Auth + database (PostgreSQL) |
| GitHub Actions | CI build gate on push/PR to main |

---

## Project Structure

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
│   └── storage.js        ← localStorage CRUD helpers
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

### Page navigation
```js
// App.jsx renderPage() switch — no router
case 'fleet': return <Fleet />
case 'restitution-picker': return <RestitutionPicker onPick={handleRestitution} ... />
```

### Auth flow
1. `VITE_USE_AUTH=false` → skip auth, seed demo data, go to `ready`
2. `VITE_USE_AUTH=true` → `getSession()` → `resolveUser()` → query `profiles` table
   - Profile found → `ready`
   - No profile → `onboarding`
   - No session → `unauthenticated`

### Role system
- `profile.role`: `'admin'` | `'agent'`
- `UserContext` provides `{ user, profile, role }` app-wide
- `useIsAdmin()` hook for admin-only UI
- Backend: `requireAdmin` middleware on destructive team operations
- localStorage/demo mode defaults to `admin`

### i18n
- Default language: French (`fr`)
- Supported: `fr`, `ar`, `en`
- Language stored in `localStorage` key `rf_language`
- Arabic triggers `document.documentElement.dir = 'rtl'`
- Namespaces: one per page/section
- All pages fully wired as of commit `f7e0c81`

### Data layer
- Primary: localStorage via `utils/storage.js` (`rf_fleet`, `rf_contracts`, `rf_clients`, etc.)
- Secondary: Supabase tables mirror localStorage structure when auth enabled
- Supabase RPC `onboard_new_agency(p_user_id, p_agency_name, p_full_name, p_email, p_phone, p_city, p_ice, p_rc)`

---

## Environment Variables

### Vercel (frontend)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_USE_AUTH=true
VITE_API_URL=https://xxx.up.railway.app
```

### Railway (backend)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   ← never in frontend
FRONTEND_URL=https://rentaflow.vercel.app
NODE_ENV=production
PORT=                         ← set by Railway automatically
RESEND_API_KEY=               ← optional, for email
TWILIO_ACCOUNT_SID=           ← Twilio account SID
TWILIO_AUTH_TOKEN=            ← Twilio auth token (secret)
TWILIO_WHATSAPP_FROM=         ← e.g. whatsapp:+14155238886 (Twilio sandbox or approved number)
ANTHROPIC_API_KEY=            ← Claude API key for AI damage detection
VITE_CMI_MERCHANT_ID=         ← CMI merchant ID for payment links (can be in frontend)
TELEMETRY_PROVIDER=           ← 'traccar' | 'flespi' | 'mock' (default: mock)
TRACCAR_URL=                  ← https://your-traccar-host
TRACCAR_EMAIL=                ← Traccar admin email
TRACCAR_PASSWORD=             ← Traccar admin password
FLESPI_TOKEN=                 ← Flespi API token
```

### Supabase Storage
- Bucket `whatsapp-temp` must exist and be **public** — used by WhatsApp routes to host PDFs for Twilio MediaUrl
- Sub-folders: `contracts/`, `invoices/`, `restitutions/`

---

## Supabase Schema (expected)

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK = auth.users.id) | |
| full_name | text | |
| email | text | |
| phone | text | |
| role | text | `'admin'` \| `'agent'` |
| agency_id | uuid (FK → agencies.id) | |
| created_at | timestamptz | |

### `agencies`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| city | text | |
| ice | text | 15-char Moroccan tax ID |
| rc | text | Registre de commerce |
| created_at | timestamptz | |

---

## Current Task Status

### Completed ✅
- Fleet dashboard (Style C) + vehicle cards + Restitution picker flow
- UX fixes: modal for échéances, rental options edit mode, fleet card click
- i18n architecture + fr/ar/en locale files (all 10 namespaces)
- i18n wired into: Auth, Onboarding, Dashboard, Sidebar, Fleet, Restitution, Clients, Contracts, Invoices, Settings
- Auth P1: Login/Signup screens, Agency onboarding (with ICE + RC), Multi-user roles
- Infrastructure: Vercel + CI/CD, Railway backend, env vars documented
- WhatsApp: Contract, Invoice, Restitution PV sending via Twilio + temp-file PDF hosting (no Supabase)
- AI damage detection: `server/routes/ai.js` → Claude Haiku Vision API; Restitution Step3 panel; before/after photos; dispute evidence package PDF
- Accounting module: `pages/Accounting.jsx` — double-entry bookkeeping, chart of accounts, journal, deposits, agency payout; `utils/accounting.js`; localStorage keys rf_accounts/rf_transactions/rf_journal_entries/rf_deposits
- Accounting dashboard: P&L view, Utilization vs Revenue SVG chart, Aged Receivables table
- Telematics module (2026-04-01):
  - `utils/telemetry.js` — adapter pattern: Traccar + Flespi normalizers → VehicleData; `computeDeltas()`; DTC helpers
  - `server/routes/telemetry.js` — Railway proxy for Traccar/Flespi/mock; GET positions/position/:id/devices + POST snapshot
  - `utils/snapshots.js` — `snapshotOnStart()` / `snapshotOnEnd()` client-side hooks; auto-flags vehicle to maintenance on DTC
  - `pages/FleetMap.jsx` — react-leaflet live GPS map; green/orange/red dot markers by status; 30s auto-refresh; telemetry popup
  - Fleet.jsx — "Carte GPS" tab toggle, DTC alert banner, lazy-loaded FleetMap, `vehicle.trackedDevice` field in edit form
  - FleetMap.jsx — only tracked vehicles shown on map; untracked count shown below; device matching via `vehicle.trackedDevice`
  - Restitution.jsx Step1 — detects end-snapshot for tracked vehicles, shows pre-fill banner with one-click apply
  - Settings.jsx — "Télématique" tab: provider selector (mock/traccar/flespi) + manual device↔vehicle mapping table + auto-detected list from fleet
  - localStorage: `rf_snapshots`, `rf_telemetry_map` (device↔vehicle mappings)
- Dev server port: fixed to 5173 via `vite.config.js` `server.port` + `strictPort: true`
- English locale files: all 9 namespaces (auth, dashboard, onboarding, fleet, contracts, clients, invoices, restitution, settings)
- Telematics snapshot wiring (2026-04-02):
  - NewRental.jsx: `snapshotOnStart()` called after contract saved as active
  - Restitution.jsx: `snapshotOnEnd()` called after invoice saved before onDone()

### Pending
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- Supabase migration (full push deferred — all data currently localStorage)

---

## GitHub
Repo: `https://github.com/o2elmouh/Kira_project_RentalflowApp`
Main branch: `main`
Latest commit: `8f68f3f` — CLAUDE.md added, i18n complete across all pages
