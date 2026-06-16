# Landing Page + App Access Gating — Design Spec

**Date:** 2026-06-10
**Status:** Approved by user (brainstorming session)

## Goal

1. Serve a public marketing landing page at `kiraflow.ma` (description, screenshots, pricing, FAQ).
2. Move the webapp to `app.kiraflow.ma` and gate access: a newly signed-up agency cannot use the app until its account is manually activated.

## Decisions (locked during brainstorming)

| Topic | Decision |
|---|---|
| Architecture | Landing takes over `kiraflow.ma`; webapp moves to `app.kiraflow.ma` (subdomain split) |
| Access gating | Manual activation — `pending` by default, flipped to `active` in the Supabase table editor; no payment processor |
| Pricing display | 3 tiers: **Essentiel** (≤5 voitures, 3 utilisateurs + admin), **Croissance** (5–20 voitures, 5 utilisateurs + admin), **Illimité** (20+ voitures, 10 utilisateurs + admin) |
| Prices | `XXX MAD/mois` placeholders, filled in by the user before launch |
| Limit enforcement | Display only — no app-side enforcement of car/user limits (follow-up project) |
| Visual direction | **B — Dark premium**: Ink Black `#141413` background, cream `#F5F1E8` headings, Signal Orange CTAs, pill radii, Sofia Sans |
| Languages | French (default) + Arabic toggle with RTL |
| Hosting | Vercel — second Vercel project rooted at `landing/`; existing app project keeps its deploy, gains `app.kiraflow.ma` |
| Screenshots | Captured from staging with demo data; user reviews before they ship |
| Activation tooling | Supabase dashboard only (no super-admin page for now) |

## Part 1 — Landing site (`landing/` folder)

### Tech

- Pure static HTML/CSS/vanilla JS. **No framework, no npm packages, no build step.**
- Rationale: full SEO indexability, instant load, zero new dependencies (per CLAUDE.md package policy), marketing edits decoupled from app deploys.
- Lives in this repo under `landing/`. Deployed as a separate Vercel project with root directory `landing/`.

### Structure

```
landing/
├── index.html        ← single page, all sections
├── styles.css        ← dark-premium tokens mirroring the app design system
├── i18n.js           ← FR/AR dictionary + toggle (sets dir="rtl", swaps strings)
├── sign-redirect.js  ← legacy ?sign= link redirect (see Safety net)
└── assets/           ← screenshots, logo, favicon, og-image
```

### Page sections (top to bottom)

1. **Nav** — KiraFlow logo, anchors (Fonctionnalités, Tarifs, FAQ), FR/AR toggle, « Se connecter » → `https://app.kiraflow.ma`.
2. **Hero** — headline + subline, primary CTA « Démarrer » → `https://app.kiraflow.ma` (signup), Dashboard screenshot in a browser-frame mockup.
3. **Features grid** — 6 cards: contrats + signature électronique via WhatsApp; gestion de flotte; leads IA (WhatsApp/Gmail → Corbeille); comptabilité marocaine; multi-utilisateurs & rôles; conformité Loi 09-08.
4. **Screenshots band** — 3–4 staging captures (Dashboard, assistant Nouvelle location, Corbeille, Comptabilité) with one-line captions.
5. **Pricing** — 3 tier cards (Essentiel / Croissance / Illimité) with placeholder prices, displayed limits, « Démarrer » CTA each. Middle tier visually highlighted.
6. **FAQ** — 4–5 items (activation du compte, données & confidentialité, langues, engagement, support).
7. **Footer** — contact WhatsApp + email, link to the app's privacy policy page, © KiraFlow.

### SEO

`<title>`, meta description, Open Graph tags + og-image, `lang`/`dir` attributes, hreflang fr/ar, favicon, `sitemap.xml`, `robots.txt`.

### Safety net — legacy signing links

Contract-signing links sent before cutover point at `kiraflow.ma/?sign=<token>`. A small inline script (`sign-redirect.js`, loaded first) checks `location.search` for `sign=` and immediately redirects to `https://app.kiraflow.ma/` preserving the full query string. No client's signing link breaks.

## Part 2 — App access gating

### DB migration

`supabase/migrations/<date>_agencies_subscription_status.sql`:

- `ALTER TABLE agencies ADD COLUMN subscription_status text NOT NULL DEFAULT 'pending' CHECK (subscription_status IN ('pending','active','blocked'));`
- Backfill: `UPDATE agencies SET subscription_status = 'active';` for all existing rows (nobody currently onboarded gets locked out).
- Note: `agencies.plan` column (retained from v1.12.0) is untouched; tier assignment stays manual/informational.

### Frontend gate

- Signup and onboarding flows unchanged — account + agency rows are created as today.
- `resolveUser()` already fetches the agency row; it additionally surfaces `subscription_status`.
- In `App.jsx`, after auth resolves: if `subscription_status !== 'active'` → render new `pages/PendingActivation.jsx` instead of the app shell. Missing/null status is treated as `pending` (fail closed for new rows, but the backfill keeps existing agencies open).
- `PendingActivation` screen: app design system, « Votre compte est en attente d'activation » (+ AR/EN via i18n), WhatsApp contact button, logout button. A `blocked` agency sees the same screen with a « compte suspendu » variant message.
- Client-side gate only for now. A backend `requireActiveAgency` middleware is a noted follow-up, acceptable at manual-activation volume.

### Cutover checklist (operational, part of the implementation plan)

1. Create the new Vercel landing project (root `landing/`), assign `kiraflow.ma` + `www.kiraflow.ma`.
2. Add `app.kiraflow.ma` to the existing app Vercel project (DNS CNAME).
3. Supabase Auth: Site URL + redirect URLs → `https://app.kiraflow.ma`.
4. Railway env: `FRONTEND_URL=https://app.kiraflow.ma` — **this builds the WhatsApp contract-signing links; must not be forgotten.**
5. Express CORS allowlist: add `https://app.kiraflow.ma` (keep old origin during transition).
6. Capture + review screenshots, fill `XXX MAD` prices before announcing.

### Tests (vitest)

- Gate logic: `active` renders app; `pending` renders PendingActivation; `blocked` renders the suspended variant; missing status → treated as pending.
- Landing `?sign=` redirect helper: URL with `sign=` redirects with query preserved; URL without it does nothing.

## Out of scope (explicitly deferred)

- Online payments (CMI/PayZone/Stripe).
- App-side enforcement of car/user tier limits.
- Super-admin activation page.
- English version of the landing page.
- Backend middleware enforcement of subscription status.
