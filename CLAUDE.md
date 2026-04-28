# RentaFlow — Project Context

## Core Directives
1. **Read-First:** Always read this file before acting. Never guess state.
2. **Token Efficiency:** No redundant summaries. Be concise.
3. **Verification:** Confirm imports, server status, and SQL signatures (`DROP FUNCTION IF EXISTS`) before finishing.
4. **Process:** State plan → Get approval → Execute.
5. **Ledger:** End sessions with a `Context Update` block to update this file.
6. **Git:** Commit directly on `staging`. Never use worktrees or feature branches — all work goes straight to staging.
7. **Never push to staging without explicit user instruction.** Commit locally, then stop and wait. Only run `git push origin staging` when the user says "push to staging" or equivalent. After every push, read `components/Sidebar.jsx` and report the current version (e.g. "Staging is at v1.3.1").
8. **Testing:** Write unit tests for every bug fix or feature. Run with `npm run test` (or `vitest run`). If tests fail, fix them before requesting approval to commit.
9. **Regression Check (MANDATORY):** Before ANY modification — bug fix, new feature, refactor, or the slightest change — check for impacts and possible regressions. Read the affected files AND their dependents. Never touch code without understanding what already works and could break.
10. **Efficiency:** If a file (like pdf.js) is too large to parse or a task stalls, stop immediately, suggest a modular split, and restart.

---

## Context Navigation (Graphify)
- Do not read raw source files blindly.
- Always query `graphify-out/graph.json` first to understand dependencies.
- Read `graphify-out/GRAPH_REPORT.md` for architecture overview.
- Only read raw `.jsx` or `.js` files when you have identified the exact file needing modification.

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
## Code Conventions
- **React:** Strictly use functional components and Hooks. No class components.
- **Complexity:** Prefer early returns to avoid deep nesting. Keep components under 150 lines (split into smaller components if larger).
- **Styling:** Use DESIGN.md to understand the design system.
- **Dependencies:** DO NOT install new npm packages without asking for explicit permission first.
- **i18n:** Never hardcode user-facing text. Always use the `t()` function from `react-i18next`.
---

## References (READ ONLY WHEN NEEDED)
- Modifying DB or backend? Read [.claude/reference/schema.md](.claude/reference/schema.md) first.
- Adding new UI, roles, or navigation? Read [.claude/reference/patterns.md](.claude/reference/patterns.md) first.

---

## Current State
See [.claude/STATUS.md](.claude/STATUS.md) for the active sprint, pending tasks, and the latest staging deployment version. Update that file after every successful push.

---

## GitHub
Repo: `https://github.com/o2elmouh/Kira_project_RentalflowApp`
Main branch: `main`

## API Usage Policy
- **Never use the `ANTHROPIC_API_KEY` for development tasks, exploration, or testing within Claude Code sessions.** API calls bill against the project key directly and are not covered by the Claude subscription.
- All Anthropic API calls in the app must use `claude-haiku-4-5-20251001` unless a specific quality reason justifies Sonnet. Opus is forbidden.
- Every AI function must have `max_tokens` set conservatively and a retry circuit breaker (max 3 attempts).
