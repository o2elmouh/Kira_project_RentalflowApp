# Landing Page + App Access Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public marketing landing page at `kiraflow.ma` (static, FR/AR, dark premium) + manual-activation gating of the webapp, which moves to `app.kiraflow.ma`.

**Architecture:** The landing is a zero-dependency static site in a new `landing/` folder, deployed as a second Vercel project. The app gains one DB column (`agencies.subscription_status`) and one gate in `App.jsx` that renders a `PendingActivation` page when the agency isn't `active`. Spec: `docs/superpowers/specs/2026-06-10-landing-page-and-access-gating-design.md`.

**Tech Stack:** Static HTML/CSS/vanilla JS (landing) · React 18 + Vitest (app) · Supabase migration (SQL).

**Project rules that apply (CLAUDE.md):** commit directly on `staging`, no worktrees; never push without explicit user instruction; run `npm run test` (vitest); final commit bumps `components/Sidebar.jsx` version → run `npm run graphify:update` and fold `graphify-out/` into the same commit.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260610_agencies_subscription_status.sql` | Create | Add `subscription_status` column, backfill existing agencies to `active` |
| `public/locales/{fr,ar,en}/common.json` | Modify | `pendingActivation.*` keys |
| `pages/PendingActivation.jsx` | Create | "Compte en attente d'activation / suspendu" screen |
| `App.jsx` | Modify | Gate before the app shell render |
| `src/test/subscriptionGate.test.jsx` | Create | Gate logic tests |
| `landing/index.html` | Create | The landing page (FR content, AR via i18n.js) |
| `landing/styles.css` | Create | Dark-premium design tokens + layout |
| `landing/i18n.js` | Create | FR/AR dictionary + RTL toggle |
| `landing/sign-redirect.js` | Create | Legacy `?sign=` link redirect helper (pure function + browser entry) |
| `landing/robots.txt`, `landing/sitemap.xml` | Create | SEO |
| `landing/assets/` | Create | Screenshots (placeholders first, real captures later) |
| `src/test/landingSignRedirect.test.js` | Create | Redirect helper tests |
| `components/Sidebar.jsx` | Modify | Version bump v1.16.2 → v1.17.0 (final task) |
| `.claude/STATUS.md` | Modify | Deployment table row (final task) |

---

## Part A — App access gating

### Task 1: DB migration — `agencies.subscription_status`

**Files:**
- Create: `supabase/migrations/20260610_agencies_subscription_status.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Manual-activation gating: new agencies start 'pending' and are flipped to
-- 'active' by the operator in the Supabase table editor. Existing agencies
-- are backfilled to 'active' so nobody currently onboarded gets locked out.
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending'
  CHECK (subscription_status IN ('pending', 'active', 'blocked'));

UPDATE agencies SET subscription_status = 'active';
```

Note: the backfill runs AFTER the column is added with default `pending`, so every pre-existing row is explicitly set to `active`. Rows inserted after this migration get the `pending` default. No `DROP FUNCTION` needed — no function signatures change.

- [ ] **Step 2: Apply to staging Supabase**

Run the SQL in the staging Supabase SQL editor (project the app currently points at), or `supabase db push` if linked. Verify:

```sql
SELECT subscription_status, count(*) FROM agencies GROUP BY 1;
-- Expected: all existing rows 'active'
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610_agencies_subscription_status.sql
git commit -m "feat(gating): agencies.subscription_status column + active backfill"
```

---

### Task 2: i18n keys for the pending-activation screen

**Files:**
- Modify: `public/locales/fr/common.json`
- Modify: `public/locales/ar/common.json`
- Modify: `public/locales/en/common.json`

- [ ] **Step 1: Add the `pendingActivation` block to each common.json (top level, e.g. right after the `"choose"` key)**

`public/locales/fr/common.json`:

```json
"pendingActivation": {
  "title": "Compte en attente d'activation",
  "message": "Votre agence est enregistrée. Notre équipe active votre compte sous 24h ouvrées — contactez-nous pour accélérer.",
  "blockedTitle": "Compte suspendu",
  "blockedMessage": "L'accès de votre agence est suspendu. Contactez-nous pour régulariser votre abonnement.",
  "contact": "Nous contacter sur WhatsApp"
}
```

`public/locales/ar/common.json`:

```json
"pendingActivation": {
  "title": "الحساب في انتظار التفعيل",
  "message": "تم تسجيل وكالتكم بنجاح. سيقوم فريقنا بتفعيل حسابكم خلال 24 ساعة عمل — تواصلوا معنا لتسريع العملية.",
  "blockedTitle": "الحساب موقوف",
  "blockedMessage": "تم إيقاف وصول وكالتكم. تواصلوا معنا لتسوية اشتراككم.",
  "contact": "تواصلوا معنا عبر واتساب"
}
```

`public/locales/en/common.json`:

```json
"pendingActivation": {
  "title": "Account pending activation",
  "message": "Your agency is registered. Our team activates accounts within 24 business hours — contact us to speed things up.",
  "blockedTitle": "Account suspended",
  "blockedMessage": "Your agency's access is suspended. Contact us to settle your subscription.",
  "contact": "Contact us on WhatsApp"
}
```

The sign-out button reuses the existing `signOut` key (already in all three files).

- [ ] **Step 2: Validate JSON parses**

```bash
node -e "['fr','ar','en'].forEach(l => JSON.parse(require('fs').readFileSync('public/locales/'+l+'/common.json')))" && echo OK
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/locales/fr/common.json public/locales/ar/common.json public/locales/en/common.json
git commit -m "i18n: pendingActivation keys (fr/ar/en)"
```

---

### Task 3: `PendingActivation` page (TDD)

**Files:**
- Create: `pages/PendingActivation.jsx`
- Test: `src/test/subscriptionGate.test.jsx` (component half; the App-gate half is Task 4)

- [ ] **Step 1: Write the failing component tests**

Create `src/test/subscriptionGate.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

// react-i18next mock: t() returns the key so assertions are locale-independent
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

const { default: PendingActivation } = await import('../../pages/PendingActivation.jsx')

describe('PendingActivation page', () => {
  it('renders the pending variant by default', () => {
    render(<PendingActivation status="pending" onSignOut={() => {}} />)
    expect(screen.getByText('pendingActivation.title')).toBeInTheDocument()
    expect(screen.getByText('pendingActivation.message')).toBeInTheDocument()
  })

  it('renders the blocked variant for status="blocked"', () => {
    render(<PendingActivation status="blocked" onSignOut={() => {}} />)
    expect(screen.getByText('pendingActivation.blockedTitle')).toBeInTheDocument()
    expect(screen.getByText('pendingActivation.blockedMessage')).toBeInTheDocument()
  })

  it('has a WhatsApp contact link and a working sign-out button', async () => {
    const onSignOut = vi.fn()
    render(<PendingActivation status="pending" onSignOut={onSignOut} />)
    const link = screen.getByRole('link', { name: 'pendingActivation.contact' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//)
    screen.getByRole('button', { name: 'signOut' }).click()
    expect(onSignOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/test/subscriptionGate.test.jsx
```
Expected: FAIL — cannot resolve `pages/PendingActivation.jsx`.

- [ ] **Step 3: Implement `pages/PendingActivation.jsx`**

```jsx
import { useTranslation } from 'react-i18next'

// Update before launch: agency-support WhatsApp number (also used on the landing page)
const SUPPORT_WHATSAPP = 'https://wa.me/212600000000'

export default function PendingActivation({ status = 'pending', onSignOut }) {
  const { t } = useTranslation('common')
  const blocked = status === 'blocked'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', gap: 16, padding: 24, textAlign: 'center', background: 'var(--bg)',
    }}>
      <div className="auth-logo">RF</div>
      <h1 style={{ color: 'var(--text1)', fontSize: 24, margin: 0 }}>
        {blocked ? t('pendingActivation.blockedTitle') : t('pendingActivation.title')}
      </h1>
      <p style={{ color: 'var(--text3)', fontSize: 14, maxWidth: 420, margin: 0 }}>
        {blocked ? t('pendingActivation.blockedMessage') : t('pendingActivation.message')}
      </p>
      <a
        href={SUPPORT_WHATSAPP}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary"
        style={{ textDecoration: 'none' }}
      >
        {t('pendingActivation.contact')}
      </a>
      <button className="btn btn-ghost" onClick={onSignOut}>
        {t('signOut')}
      </button>
    </div>
  )
}
```

If `btn btn-primary` / `btn btn-ghost` classes don't exist in `index.css`, check what `pages/Auth.jsx` uses for its buttons and reuse those classes instead — do not invent new CSS.

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/test/subscriptionGate.test.jsx
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add pages/PendingActivation.jsx src/test/subscriptionGate.test.jsx
git commit -m "feat(gating): PendingActivation page"
```

---

### Task 4: App.jsx gate (TDD)

**Files:**
- Modify: `App.jsx` (import block + one gate before the final return, around line 263)
- Test: `src/test/subscriptionGate.test.jsx` (append App-level describe block)

**Gate semantics (from spec + resilience review):**
- `profile.agencies` present AND `subscription_status !== 'active'` → gate.
- `profile.agencies` **absent** (agency fetch timed out — the `catch {}` in `resolveUser`) → do NOT gate. Rationale: a transient Supabase timeout must not lock out a paying user; this mirrors the app's existing graceful-degradation policy. New signups always have an agency row whose column defaults to `'pending'`, so they ARE gated.

- [ ] **Step 1: Append failing App-gate tests to `src/test/subscriptionGate.test.jsx`**

Follow the exact mocking pattern of `src/test/resolveUser.test.jsx` (module-level `vi.mock` of `lib/supabase` + page stubs). Append:

```jsx
import { waitFor, render as renderApp, screen as appScreen, cleanup } from '@testing-library/react'
import { beforeEach, afterEach } from 'vitest'

const makeQueryStub = (result) => {
  const stub = { select: () => stub, eq: () => stub, maybeSingle: () => Promise.resolve(result) }
  return stub
}

let supabaseMock = {
  auth: {
    getSession:        vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut:           vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock }))
vi.mock('../../pages/Dashboard',         () => ({ default: () => <div data-testid="dashboard" /> }))
vi.mock('../../pages/NewRental',         () => ({ default: () => null }))
vi.mock('../../pages/Fleet',             () => ({ default: () => null }))
vi.mock('../../pages/Clients',           () => ({ default: () => null }))
vi.mock('../../pages/Contracts',         () => ({ default: () => null }))
vi.mock('../../pages/Invoices',          () => ({ default: () => null }))
vi.mock('../../pages/Settings',          () => ({ default: () => null }))
vi.mock('../../pages/Restitution',       () => ({ default: () => null }))
vi.mock('../../pages/RestitutionPicker', () => ({ default: () => null }))
vi.mock('../../pages/Auth',              () => ({ default: () => <div data-testid="auth" />, PasswordResetForm: () => null }))
vi.mock('../../pages/Onboarding',        () => ({ default: () => <div data-testid="onboarding" /> }))
vi.mock('../../pages/WelcomeScreen',     () => ({ default: () => null }))
vi.mock('../../pages/SignContract',      () => ({ default: () => null }))
vi.mock('../../pages/Accounting',        () => ({ default: () => null }))
vi.mock('../../pages/Basket',            () => ({ default: () => null }))
vi.mock('../../components/Sidebar',      () => ({ default: () => null }))
vi.mock('../../pages/PendingActivation', () => ({
  default: ({ status }) => <div data-testid="pending-activation" data-status={status} />,
}))

const { default: App } = await import('../../App.jsx')

const sessionWith = (agency) => {
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-123', email: 't@e.com' } } },
  })
  supabaseMock.from.mockImplementation((table) => {
    if (table === 'profiles') return makeQueryStub({
      data: { id: 'user-123', full_name: 'T', email: 't@e.com', phone: '06', role: 'admin', agency_id: agency ? 'agency-abc' : null },
    })
    if (table === 'agencies') return makeQueryStub({ data: agency })
    return makeQueryStub({ data: null })
  })
}

describe('App.jsx subscription gate', () => {
  afterEach(() => cleanup())

  it('renders the app for an active agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'active' })
    renderApp(<App />)
    await waitFor(() => expect(appScreen.getByTestId('dashboard')).toBeInTheDocument())
    expect(appScreen.queryByTestId('pending-activation')).toBeNull()
  })

  it('renders PendingActivation for a pending agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'pending' })
    renderApp(<App />)
    await waitFor(() => expect(appScreen.getByTestId('pending-activation')).toBeInTheDocument())
    expect(appScreen.getByTestId('pending-activation').dataset.status).toBe('pending')
  })

  it('renders PendingActivation (blocked variant) for a blocked agency', async () => {
    sessionWith({ id: 'agency-abc', name: 'A', subscription_status: 'blocked' })
    renderApp(<App />)
    await waitFor(() => expect(appScreen.getByTestId('pending-activation')).toBeInTheDocument())
    expect(appScreen.getByTestId('pending-activation').dataset.status).toBe('blocked')
  })

  it('does NOT gate when the agency row could not be fetched (fail open on transient errors)', async () => {
    sessionWith(null) // agency query returns null → profile.agencies stays unset
    renderApp(<App />)
    await waitFor(() => expect(appScreen.getByTestId('dashboard')).toBeInTheDocument())
  })
})
```

Caveat: `App.jsx` reads `window.location.search` at module scope — these tests run with a clean jsdom URL, so `signToken`/`PAGE_PARAM` are null, same as `resolveUser.test.jsx`. If module-mock collisions arise from having two `vi.mock('../../App.jsx')`-importing files, keep this in its own file (it already is) — vitest isolates module registries per test file.

- [ ] **Step 2: Run to verify the new tests fail**

```bash
npx vitest run src/test/subscriptionGate.test.jsx
```
Expected: the 3 component tests pass; the `pending`/`blocked` App tests FAIL (dashboard renders instead of pending-activation).

- [ ] **Step 3: Implement the gate in `App.jsx`**

Add the import (with the other page imports):

```jsx
import PendingActivation from './pages/PendingActivation'
```

Insert immediately BEFORE the final `return (` (after the `password-recovery` block, currently ending around line 262):

```jsx
  // Manual-activation gate: agency row present but not active → hold screen.
  // profile.agencies absent (transient fetch failure) intentionally falls
  // through — never lock out a working session on a network blip.
  const subscriptionStatus = profile?.agencies?.subscription_status
  if (profile?.agencies && subscriptionStatus !== 'active') {
    return (
      <PendingActivation
        status={subscriptionStatus || 'pending'}
        onSignOut={() => supabase.auth.signOut()}
      />
    )
  }
```

- [ ] **Step 4: Run the gate tests, then the full suite**

```bash
npx vitest run src/test/subscriptionGate.test.jsx
npm run test
```
Expected: all subscriptionGate tests pass; full suite passes (459 existing + 7 new = 466). If `resolveUser.test.jsx` fixtures break because `getMockAgency` has no `subscription_status`: those fixtures return an agency row, so the gate would now hold them. Fix by adding `subscription_status: 'active'` to `getMockAgency` defaults in `src/test/resolveUser.test.jsx` — that mirrors the backfilled production state.

- [ ] **Step 5: Commit**

```bash
git add App.jsx src/test/subscriptionGate.test.jsx src/test/resolveUser.test.jsx
git commit -m "feat(gating): App.jsx subscription gate — pending/blocked agencies see PendingActivation"
```

---

## Part B — Landing site (`landing/`)

### Task 5: Styles — `landing/styles.css`

**Files:**
- Create: `landing/styles.css`

- [ ] **Step 1: Write the stylesheet** (dark-premium tokens derived from the app's `index.css`: ink `#141413`, cream `#F3F0EE`, Signal Orange `#CF4500` / light `#F37338`)

```css
:root {
  --ink: #141413;
  --ink-soft: #1d1d1b;
  --ink-card: #232320;
  --ink-border: #38362f;
  --cream: #F3F0EE;
  --muted: #a9a294;
  --orange: #CF4500;
  --orange-hover: #A83600;
  --orange-light: #F37338;
  --radius-pill: 999px;
  --radius-card: 16px;
  --maxw: 1080px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  background: var(--ink);
  color: var(--cream);
  font-family: 'Sofia Sans', system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

[dir="rtl"] body { font-family: 'Sofia Sans', 'Noto Sans Arabic', system-ui, sans-serif; }

.container { max-width: var(--maxw); margin: 0 auto; padding: 0 24px; }

/* ── Nav ── */
.nav {
  position: sticky; top: 0; z-index: 50;
  background: rgba(20, 20, 19, 0.92); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--ink-border);
}
.nav-inner {
  max-width: var(--maxw); margin: 0 auto; padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.logo { font-weight: 800; font-size: 20px; color: var(--cream); text-decoration: none; letter-spacing: -0.5px; }
.logo span { color: var(--orange-light); }
.nav-links { display: flex; align-items: center; gap: 22px; }
.nav-links a { color: var(--muted); text-decoration: none; font-size: 14px; }
.nav-links a:hover { color: var(--cream); }
.lang-toggle {
  background: none; border: 1px solid var(--ink-border); color: var(--muted);
  border-radius: var(--radius-pill); padding: 5px 14px; font-size: 13px; cursor: pointer;
}
.lang-toggle:hover { color: var(--cream); border-color: var(--muted); }

/* ── Buttons ── */
.btn { display: inline-block; border-radius: var(--radius-pill); padding: 12px 28px;
  font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
.btn-primary { background: var(--orange); color: #fff; }
.btn-primary:hover { background: var(--orange-hover); }
.btn-outline { background: none; border: 1.5px solid var(--cream); color: var(--cream); }
.btn-outline:hover { background: var(--cream); color: var(--ink); }
.btn-login { background: var(--cream); color: var(--ink); padding: 8px 20px; font-size: 14px; }

/* ── Hero ── */
.hero { text-align: center; padding: 88px 24px 56px; }
.hero h1 { font-size: clamp(34px, 6vw, 58px); font-weight: 800; line-height: 1.1; letter-spacing: -1px; }
.hero h1 .accent { color: var(--orange-light); }
.hero p { color: var(--muted); font-size: 18px; max-width: 560px; margin: 20px auto 32px; }
.hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.hero-shot { max-width: 920px; margin: 56px auto 0; }

/* Browser frame around screenshots */
.frame { background: var(--ink-card); border: 1px solid var(--ink-border);
  border-radius: var(--radius-card); overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
.frame-bar { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--ink-border); }
.frame-bar i { width: 10px; height: 10px; border-radius: 50%; background: var(--ink-border); }
.frame img { display: block; width: 100%; }
.frame .placeholder-shot { aspect-ratio: 16/9; display: flex; align-items: center;
  justify-content: center; color: var(--muted); font-size: 14px; }

/* ── Sections ── */
section { padding: 72px 0; }
.section-title { text-align: center; font-size: clamp(26px, 4vw, 38px); font-weight: 800; letter-spacing: -0.5px; }
.section-sub { text-align: center; color: var(--muted); max-width: 520px; margin: 12px auto 48px; }

/* ── Features ── */
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.feature { background: var(--ink-soft); border: 1px solid var(--ink-border);
  border-radius: var(--radius-card); padding: 28px; }
.feature .icon { font-size: 26px; margin-bottom: 14px; display: block; }
.feature h3 { font-size: 17px; margin-bottom: 8px; }
.feature p { color: var(--muted); font-size: 14px; }

/* ── Screenshots band ── */
.shots-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
.shot figcaption { color: var(--muted); font-size: 13px; text-align: center; margin-top: 10px; }

/* ── Pricing ── */
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; align-items: stretch; }
.plan { background: var(--ink-soft); border: 1px solid var(--ink-border);
  border-radius: var(--radius-card); padding: 32px 28px; display: flex; flex-direction: column; }
.plan.featured { border-color: var(--orange-light); position: relative; }
.plan .badge { position: absolute; top: -12px; inset-inline-start: 50%; transform: translateX(-50%);
  background: var(--orange); color: #fff; font-size: 11px; font-weight: 700;
  border-radius: var(--radius-pill); padding: 3px 12px; white-space: nowrap; }
[dir="rtl"] .plan .badge { transform: translateX(50%); }
.plan h3 { font-size: 18px; }
.plan .price { font-size: 34px; font-weight: 800; margin: 14px 0 2px; }
.plan .price small { font-size: 14px; color: var(--muted); font-weight: 400; }
.plan ul { list-style: none; margin: 20px 0 28px; flex: 1; }
.plan li { color: var(--muted); font-size: 14px; padding: 6px 0; }
.plan li::before { content: "✓ "; color: var(--orange-light); font-weight: 700; }
.plan .btn { text-align: center; }

/* ── FAQ ── */
.faq { max-width: 720px; margin: 0 auto; }
.faq details { border-bottom: 1px solid var(--ink-border); padding: 18px 0; }
.faq summary { cursor: pointer; font-weight: 700; font-size: 16px; list-style: none; }
.faq summary::after { content: "+"; float: inline-end; color: var(--orange-light); }
.faq details[open] summary::after { content: "–"; }
.faq details p { color: var(--muted); font-size: 14px; padding-top: 10px; }

/* ── Footer ── */
footer { border-top: 1px solid var(--ink-border); padding: 40px 0; }
.footer-inner { max-width: var(--maxw); margin: 0 auto; padding: 0 24px;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.footer-inner a { color: var(--muted); text-decoration: none; font-size: 13px; margin-inline-end: 18px; }
.footer-inner a:hover { color: var(--cream); }
.copyright { color: var(--muted); font-size: 13px; }

@media (max-width: 640px) {
  .nav-links a[data-anchor] { display: none; }
  section { padding: 48px 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add landing/styles.css
git commit -m "feat(landing): dark-premium stylesheet"
```

---

### Task 6: Page — `landing/index.html`

**Files:**
- Create: `landing/index.html`
- Create: `landing/assets/.gitkeep` (screenshots arrive in Task 9)

Every translatable element carries `data-i18n="<key>"` for Task 7. `XXX MAD` prices and the WhatsApp number `212600000000` are **deliberate user-supplied placeholders** (spec decision), filled at cutover.

- [ ] **Step 1: Write `landing/index.html`**

```html
<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KiraFlow — Logiciel de gestion pour agences de location de voitures au Maroc</title>
  <meta name="description" content="Contrats, signature électronique WhatsApp, gestion de flotte, leads IA et comptabilité marocaine — l'outil tout-en-un des agences de location de voitures.">
  <link rel="alternate" hreflang="fr" href="https://kiraflow.ma/">
  <link rel="alternate" hreflang="ar" href="https://kiraflow.ma/?lang=ar">
  <meta property="og:title" content="KiraFlow — La location de voiture, version pro">
  <meta property="og:description" content="L'outil tout-en-un des agences de location marocaines : contrats, flotte, leads WhatsApp, comptabilité.">
  <meta property="og:image" content="https://kiraflow.ma/assets/og-image.png">
  <meta property="og:url" content="https://kiraflow.ma/">
  <meta property="og:type" content="website">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sofia+Sans:wght@400;700;800&family=Noto+Sans+Arabic:wght@400;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script type="module">
    import { getSignRedirectUrl } from './sign-redirect.js'
    const target = getSignRedirectUrl(window.location.search)
    if (target) window.location.replace(target)
  </script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="logo" href="/">Kira<span>Flow</span></a>
    <div class="nav-links">
      <a href="#features" data-anchor data-i18n="nav.features">Fonctionnalités</a>
      <a href="#pricing" data-anchor data-i18n="nav.pricing">Tarifs</a>
      <a href="#faq" data-anchor data-i18n="nav.faq">FAQ</a>
      <button class="lang-toggle" id="langToggle" aria-label="Changer de langue">العربية</button>
      <a class="btn btn-login" href="https://app.kiraflow.ma" data-i18n="nav.login">Se connecter</a>
    </div>
  </div>
</nav>

<header class="hero">
  <h1><span data-i18n="hero.line1">La location de voiture,</span><br><span class="accent" data-i18n="hero.line2">version pro.</span></h1>
  <p data-i18n="hero.sub">Contrats, signature électronique WhatsApp, gestion de flotte, leads IA et comptabilité marocaine — tout votre métier dans un seul outil.</p>
  <div class="hero-ctas">
    <a class="btn btn-primary" href="https://app.kiraflow.ma" data-i18n="hero.ctaStart">Démarrer</a>
    <a class="btn btn-outline" href="#pricing" data-i18n="hero.ctaPricing">Voir les tarifs</a>
  </div>
  <div class="hero-shot">
    <div class="frame">
      <div class="frame-bar"><i></i><i></i><i></i></div>
      <div class="placeholder-shot" data-shot="dashboard" data-i18n="shots.dashboard">Tableau de bord — capture à venir</div>
    </div>
  </div>
</header>

<section id="features">
  <div class="container">
    <h2 class="section-title" data-i18n="features.title">Tout ce qu'une agence moderne attend</h2>
    <p class="section-sub" data-i18n="features.sub">Conçu pour les agences de location marocaines, du premier contrat à la clôture comptable.</p>
    <div class="features-grid">
      <div class="feature"><span class="icon">📝</span><h3 data-i18n="features.contracts.title">Contrats &amp; signature électronique</h3><p data-i18n="features.contracts.desc">Générez le contrat en PDF et envoyez le lien de signature par WhatsApp. Le client signe sur son téléphone, vous êtes notifié instantanément.</p></div>
      <div class="feature"><span class="icon">🚗</span><h3 data-i18n="features.fleet.title">Gestion de flotte</h3><p data-i18n="features.fleet.desc">Disponibilités, entretiens, réparations, amortissement — l'état de chaque véhicule en temps réel.</p></div>
      <div class="feature"><span class="icon">🤖</span><h3 data-i18n="features.leads.title">Leads IA — WhatsApp &amp; Gmail</h3><p data-i18n="features.leads.desc">Les demandes entrantes sont triées par IA, les documents lus automatiquement, et chaque lead arrive prêt à convertir en contrat.</p></div>
      <div class="feature"><span class="icon">📊</span><h3 data-i18n="features.accounting.title">Comptabilité marocaine</h3><p data-i18n="features.accounting.desc">Journal, plan comptable, cautions, compte de résultat — vos écritures générées automatiquement à chaque location.</p></div>
      <div class="feature"><span class="icon">👥</span><h3 data-i18n="features.team.title">Multi-utilisateurs &amp; rôles</h3><p data-i18n="features.team.desc">Invitez votre équipe avec des rôles admin, manager ou staff — chacun voit ce qui le concerne.</p></div>
      <div class="feature"><span class="icon">🔒</span><h3 data-i18n="features.law.title">Conforme Loi 09-08</h3><p data-i18n="features.law.desc">Données clients protégées : notice CNDP, droit à l'effacement, rétention automatique.</p></div>
    </div>
  </div>
</section>

<section id="screenshots">
  <div class="container">
    <h2 class="section-title" data-i18n="shots.title">L'outil en images</h2>
    <p class="section-sub" data-i18n="shots.sub">Une interface claire, pensée pour le quotidien d'une agence.</p>
    <div class="shots-grid">
      <figure class="shot"><div class="frame"><div class="frame-bar"><i></i><i></i><i></i></div><div class="placeholder-shot" data-shot="new-rental" data-i18n="shots.newRental">Nouveau contrat — capture à venir</div></div><figcaption data-i18n="shots.newRentalCap">Assistant nouvelle location : scan CIN + permis, contrat en 4 étapes</figcaption></figure>
      <figure class="shot"><div class="frame"><div class="frame-bar"><i></i><i></i><i></i></div><div class="placeholder-shot" data-shot="basket" data-i18n="shots.basket">Corbeille IA — capture à venir</div></div><figcaption data-i18n="shots.basketCap">Corbeille : vos leads WhatsApp et Gmail triés par IA</figcaption></figure>
      <figure class="shot"><div class="frame"><div class="frame-bar"><i></i><i></i><i></i></div><div class="placeholder-shot" data-shot="accounting" data-i18n="shots.accounting">Comptabilité — capture à venir</div></div><figcaption data-i18n="shots.accountingCap">Comptabilité : journal et compte de résultat automatiques</figcaption></figure>
    </div>
  </div>
</section>

<section id="pricing">
  <div class="container">
    <h2 class="section-title" data-i18n="pricing.title">Des tarifs à la taille de votre flotte</h2>
    <p class="section-sub" data-i18n="pricing.sub">Activation sous 24h ouvrées. Sans engagement.</p>
    <div class="pricing-grid">
      <div class="plan">
        <h3 data-i18n="pricing.t1.name">Essentiel</h3>
        <div class="price">XXX <small data-i18n="pricing.perMonth">MAD/mois</small></div>
        <ul>
          <li data-i18n="pricing.t1.cars">Jusqu'à 5 voitures</li>
          <li data-i18n="pricing.t1.users">3 utilisateurs + admin</li>
          <li data-i18n="pricing.allFeatures">Toutes les fonctionnalités</li>
        </ul>
        <a class="btn btn-outline" href="https://app.kiraflow.ma" data-i18n="pricing.cta">Démarrer</a>
      </div>
      <div class="plan featured">
        <span class="badge" data-i18n="pricing.popular">Le plus choisi</span>
        <h3 data-i18n="pricing.t2.name">Croissance</h3>
        <div class="price">XXX <small data-i18n="pricing.perMonth2">MAD/mois</small></div>
        <ul>
          <li data-i18n="pricing.t2.cars">De 5 à 20 voitures</li>
          <li data-i18n="pricing.t2.users">5 utilisateurs + admin</li>
          <li data-i18n="pricing.allFeatures2">Toutes les fonctionnalités</li>
        </ul>
        <a class="btn btn-primary" href="https://app.kiraflow.ma" data-i18n="pricing.cta2">Démarrer</a>
      </div>
      <div class="plan">
        <h3 data-i18n="pricing.t3.name">Illimité</h3>
        <div class="price">XXX <small data-i18n="pricing.perMonth3">MAD/mois</small></div>
        <ul>
          <li data-i18n="pricing.t3.cars">Plus de 20 voitures</li>
          <li data-i18n="pricing.t3.users">10 utilisateurs + admin</li>
          <li data-i18n="pricing.allFeatures3">Toutes les fonctionnalités</li>
        </ul>
        <a class="btn btn-outline" href="https://app.kiraflow.ma" data-i18n="pricing.cta3">Démarrer</a>
      </div>
    </div>
  </div>
</section>

<section id="faq">
  <div class="container">
    <h2 class="section-title" data-i18n="faq.title">Questions fréquentes</h2>
    <p class="section-sub" data-i18n="faq.sub">Tout ce qu'il faut savoir avant de démarrer.</p>
    <div class="faq">
      <details><summary data-i18n="faq.q1">Comment mon compte est-il activé ?</summary><p data-i18n="faq.a1">Créez votre compte, configurez votre agence, puis notre équipe active votre accès sous 24h ouvrées. Contactez-nous sur WhatsApp pour accélérer.</p></details>
      <details><summary data-i18n="faq.q2">Mes données sont-elles en sécurité ?</summary><p data-i18n="faq.a2">Oui. KiraFlow est conforme à la Loi 09-08 : données chiffrées, droit à l'effacement, notice CNDP et politique de rétention configurable.</p></details>
      <details><summary data-i18n="faq.q3">L'application est-elle disponible en arabe ?</summary><p data-i18n="faq.a3">Oui — l'application fonctionne en français et en arabe (affichage de droite à gauche inclus), avec l'anglais en option.</p></details>
      <details><summary data-i18n="faq.q4">Y a-t-il un engagement de durée ?</summary><p data-i18n="faq.a4">Non. L'abonnement est mensuel et sans engagement — vous arrêtez quand vous voulez.</p></details>
      <details><summary data-i18n="faq.q5">Puis-je changer de formule plus tard ?</summary><p data-i18n="faq.a5">Oui, à tout moment. Contactez-nous et nous adaptons votre formule à la taille de votre flotte.</p></details>
    </div>
  </div>
</section>

<footer>
  <div class="footer-inner">
    <div>
      <a href="https://wa.me/212600000000" data-i18n="footer.whatsapp">WhatsApp</a>
      <a href="mailto:contact@kiraflow.ma">contact@kiraflow.ma</a>
      <a href="https://app.kiraflow.ma/?page=confidentialite" data-i18n="footer.privacy">Confidentialité</a>
    </div>
    <div class="copyright">© 2026 KiraFlow</div>
  </div>
</footer>

<script type="module" src="/i18n.js"></script>
</body>
</html>
```

- [ ] **Step 2: Smoke-check locally**

```bash
npx serve landing
```
(`serve` runs via npx without installing into the project — no package.json change.) Open the printed URL; verify all sections render, anchors scroll, no console errors. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add landing/index.html landing/assets/.gitkeep
git commit -m "feat(landing): index.html — hero, features, screenshots, pricing, FAQ, footer"
```

---

### Task 7: Landing i18n — `landing/i18n.js` (FR/AR + RTL)

**Files:**
- Create: `landing/i18n.js`

- [ ] **Step 1: Write the dictionary + toggle**

```js
// FR is authored in the HTML. AR overrides every element carrying data-i18n.
// Keys with numeric suffixes (perMonth2, cta3…) exist because data-i18n is
// one-key-per-element; they alias the same string.
const AR = {
  'nav.features': 'المميزات',
  'nav.pricing': 'الأسعار',
  'nav.faq': 'الأسئلة الشائعة',
  'nav.login': 'تسجيل الدخول',
  'hero.line1': 'كراء السيارات،',
  'hero.line2': 'بطريقة احترافية.',
  'hero.sub': 'العقود، التوقيع الإلكتروني عبر واتساب، تدبير الأسطول، الزبناء المحتملون بالذكاء الاصطناعي والمحاسبة المغربية — كل شغلك في أداة واحدة.',
  'hero.ctaStart': 'ابدأ الآن',
  'hero.ctaPricing': 'شاهد الأسعار',
  'shots.dashboard': 'لوحة القيادة — الصورة قريباً',
  'features.title': 'كل ما تحتاجه وكالة عصرية',
  'features.sub': 'مصمم لوكالات كراء السيارات المغربية، من أول عقد إلى الإقفال المحاسبي.',
  'features.contracts.title': 'العقود والتوقيع الإلكتروني',
  'features.contracts.desc': 'أنشئ العقد بصيغة PDF وأرسل رابط التوقيع عبر واتساب. الزبون يوقع من هاتفه وتتوصل بإشعار فوري.',
  'features.fleet.title': 'تدبير الأسطول',
  'features.fleet.desc': 'التوفر، الصيانة، الإصلاحات، الاستهلاك — حالة كل سيارة في الوقت الحقيقي.',
  'features.leads.title': 'زبناء محتملون بالذكاء الاصطناعي — واتساب وGmail',
  'features.leads.desc': 'الطلبات الواردة تُفرز بالذكاء الاصطناعي، والوثائق تُقرأ تلقائياً، وكل طلب يصلك جاهزاً للتحويل إلى عقد.',
  'features.accounting.title': 'محاسبة مغربية',
  'features.accounting.desc': 'اليومية، المخطط المحاسبي، الضمانات، حساب النتائج — قيودك تُنشأ تلقائياً مع كل عملية كراء.',
  'features.team.title': 'عدة مستخدمين وأدوار',
  'features.team.desc': 'أضف فريقك بأدوار مدير أو مسير أو موظف — كل واحد يرى ما يخصه.',
  'features.law.title': 'مطابق للقانون 09-08',
  'features.law.desc': 'بيانات الزبناء محمية: إشعار اللجنة الوطنية، الحق في المحو، والحذف التلقائي.',
  'shots.title': 'الأداة بالصور',
  'shots.sub': 'واجهة واضحة، مصممة ليوميات الوكالة.',
  'shots.newRental': 'عقد جديد — الصورة قريباً',
  'shots.newRentalCap': 'مساعد الكراء الجديد: مسح البطاقة والرخصة، عقد في 4 خطوات',
  'shots.basket': 'سلة الذكاء الاصطناعي — الصورة قريباً',
  'shots.basketCap': 'السلة: طلباتك من واتساب وGmail مفروزة بالذكاء الاصطناعي',
  'shots.accounting': 'المحاسبة — الصورة قريباً',
  'shots.accountingCap': 'المحاسبة: اليومية وحساب النتائج تلقائياً',
  'pricing.title': 'أسعار على قياس أسطولك',
  'pricing.sub': 'التفعيل خلال 24 ساعة عمل. بدون التزام.',
  'pricing.t1.name': 'الأساسي',
  'pricing.t1.cars': 'حتى 5 سيارات',
  'pricing.t1.users': '3 مستخدمين + مدير',
  'pricing.t2.name': 'النمو',
  'pricing.t2.cars': 'من 5 إلى 20 سيارة',
  'pricing.t2.users': '5 مستخدمين + مدير',
  'pricing.t3.name': 'بلا حدود',
  'pricing.t3.cars': 'أكثر من 20 سيارة',
  'pricing.t3.users': '10 مستخدمين + مدير',
  'pricing.allFeatures': 'جميع المميزات',
  'pricing.allFeatures2': 'جميع المميزات',
  'pricing.allFeatures3': 'جميع المميزات',
  'pricing.perMonth': 'درهم/شهر',
  'pricing.perMonth2': 'درهم/شهر',
  'pricing.perMonth3': 'درهم/شهر',
  'pricing.popular': 'الأكثر اختياراً',
  'pricing.cta': 'ابدأ الآن',
  'pricing.cta2': 'ابدأ الآن',
  'pricing.cta3': 'ابدأ الآن',
  'faq.title': 'الأسئلة الشائعة',
  'faq.sub': 'كل ما يجب معرفته قبل البدء.',
  'faq.q1': 'كيف يتم تفعيل حسابي؟',
  'faq.a1': 'أنشئ حسابك، جهّز وكالتك، ثم يقوم فريقنا بتفعيل وصولك خلال 24 ساعة عمل. تواصل معنا عبر واتساب للتسريع.',
  'faq.q2': 'هل بياناتي آمنة؟',
  'faq.a2': 'نعم. كيرافلو مطابق للقانون 09-08: بيانات مشفرة، الحق في المحو، إشعار اللجنة الوطنية وسياسة احتفاظ قابلة للضبط.',
  'faq.q3': 'هل التطبيق متوفر بالعربية؟',
  'faq.a3': 'نعم — التطبيق يشتغل بالفرنسية والعربية (مع العرض من اليمين إلى اليسار)، والإنجليزية اختيارياً.',
  'faq.q4': 'هل هناك التزام بمدة معينة؟',
  'faq.a4': 'لا. الاشتراك شهري وبدون التزام — توقف متى شئت.',
  'faq.q5': 'هل يمكنني تغيير الصيغة لاحقاً؟',
  'faq.a5': 'نعم، في أي وقت. تواصل معنا ونكيّف صيغتك مع حجم أسطولك.',
  'footer.whatsapp': 'واتساب',
  'footer.privacy': 'الخصوصية',
}

// FR snapshot taken from the DOM at load — lets us toggle back without a reload.
const FR = {}

function applyLang(lang) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (lang === 'ar') {
      if (!(key in FR)) FR[key] = el.textContent
      if (AR[key]) el.textContent = AR[key]
    } else if (key in FR) {
      el.textContent = FR[key]
    }
  })
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  const toggle = document.getElementById('langToggle')
  if (toggle) toggle.textContent = lang === 'ar' ? 'Français' : 'العربية'
  try { localStorage.setItem('kf-lang', lang) } catch {}
}

const params = new URLSearchParams(window.location.search)
let saved = params.get('lang')
if (!saved) { try { saved = localStorage.getItem('kf-lang') } catch {} }
let current = saved === 'ar' ? 'ar' : 'fr'
if (current === 'ar') applyLang('ar')

document.getElementById('langToggle')?.addEventListener('click', () => {
  current = current === 'ar' ? 'fr' : 'ar'
  applyLang(current)
})
```

- [ ] **Step 2: Smoke-check the toggle**

```bash
npx serve landing
```
Click العربية: all texts flip to Arabic, layout flips RTL, button shows "Français". Click back. Reload with `?lang=ar` — page loads in Arabic. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add landing/i18n.js
git commit -m "feat(landing): FR/AR i18n toggle with RTL"
```

---

### Task 8: Legacy `?sign=` redirect (TDD)

**Files:**
- Create: `landing/sign-redirect.js`
- Test: `src/test/landingSignRedirect.test.js`

Contract-signing links sent before the domain swap point at `kiraflow.ma/?sign=<token>`. After the swap that URL serves the landing — this helper forwards those visitors to the app with the query intact.

- [ ] **Step 1: Write the failing tests**

Create `src/test/landingSignRedirect.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { getSignRedirectUrl } from '../../landing/sign-redirect.js'

describe('landing getSignRedirectUrl', () => {
  it('redirects a legacy signing link, preserving the full query', () => {
    expect(getSignRedirectUrl('?sign=abc-123')).toBe('https://app.kiraflow.ma/?sign=abc-123')
  })

  it('preserves additional query params', () => {
    expect(getSignRedirectUrl('?sign=tok&lang=ar')).toBe('https://app.kiraflow.ma/?sign=tok&lang=ar')
  })

  it('returns null when there is no sign param', () => {
    expect(getSignRedirectUrl('')).toBeNull()
    expect(getSignRedirectUrl('?lang=ar')).toBeNull()
  })

  it('returns null for an empty sign param', () => {
    expect(getSignRedirectUrl('?sign=')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/test/landingSignRedirect.test.js
```
Expected: FAIL — cannot resolve `landing/sign-redirect.js`.

- [ ] **Step 3: Implement `landing/sign-redirect.js`**

```js
// Legacy contract-signing links predate the kiraflow.ma → app.kiraflow.ma
// split and look like kiraflow.ma/?sign=<token>. Forward them to the app
// with the query string intact. Loaded first thing in index.html <head>.
const APP_ORIGIN = 'https://app.kiraflow.ma'

export function getSignRedirectUrl(search) {
  const params = new URLSearchParams(search)
  const token = params.get('sign')
  if (!token) return null
  return `${APP_ORIGIN}/${search}`
}
```

(The browser entry point lives in `index.html` — Task 6 already imports this module and calls `window.location.replace` when a URL is returned.)

- [ ] **Step 4: Run tests, then full suite**

```bash
npx vitest run src/test/landingSignRedirect.test.js
npm run test
```
Expected: 4 PASS; full suite green. If vitest excludes files outside `src/`, no config change is needed (the TEST file is in `src/test/`; it imports from `landing/` which vitest resolves fine).

- [ ] **Step 5: Commit**

```bash
git add landing/sign-redirect.js src/test/landingSignRedirect.test.js
git commit -m "feat(landing): legacy ?sign= link redirect to app.kiraflow.ma"
```

---

### Task 9: SEO files + favicon

**Files:**
- Create: `landing/robots.txt`
- Create: `landing/sitemap.xml`
- Create: `landing/assets/favicon.svg`

- [ ] **Step 1: Write the three files**

`landing/robots.txt`:

```
User-agent: *
Allow: /
Sitemap: https://kiraflow.ma/sitemap.xml
```

`landing/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://kiraflow.ma/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
```

`landing/assets/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#141413"/>
  <text x="32" y="42" font-family="system-ui,sans-serif" font-size="28" font-weight="800" fill="#F37338" text-anchor="middle">KF</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add landing/robots.txt landing/sitemap.xml landing/assets/favicon.svg
git commit -m "feat(landing): robots, sitemap, favicon"
```

---

### Task 10: Screenshots (user-reviewed)

**Files:**
- Create: `landing/assets/shot-dashboard.png`, `shot-new-rental.png`, `shot-basket.png`, `shot-accounting.png`, `og-image.png`
- Modify: `landing/index.html` (swap `.placeholder-shot` divs for `<img>` tags)

- [ ] **Step 1: Capture from the running app**

Run `npm run dev`, sign into the staging account with demo data, and capture at 1440px width: Dashboard, NewRental wizard (step 1), Corbeille (Basket), Comptabilité (Tableau de bord tab). Check each capture for real client names/CINs/phone numbers — only demo data may appear. **Show the captures to the user for approval before embedding.**

- [ ] **Step 2: Embed**

For each of the four `.placeholder-shot` divs in `landing/index.html`, replace:

```html
<div class="placeholder-shot" data-shot="dashboard" data-i18n="shots.dashboard">Tableau de bord — capture à venir</div>
```
with:
```html
<img src="/assets/shot-dashboard.png" alt="Tableau de bord KiraFlow" loading="lazy">
```
(same pattern: `data-shot="new-rental"` → `shot-new-rental.png`, `data-shot="basket"` → `shot-basket.png`, `data-shot="accounting"` → `shot-accounting.png`; remove the corresponding `shots.dashboard`/`shots.newRental`/`shots.basket`/`shots.accounting` keys from `landing/i18n.js` AR dictionary — captions keep theirs). Create `og-image.png` (1200×630) from the dashboard capture with the KiraFlow wordmark.

- [ ] **Step 3: Commit**

```bash
git add landing/assets landing/index.html landing/i18n.js
git commit -m "feat(landing): real app screenshots + og-image"
```

---

### Task 11: Version bump + STATUS + graphify

**Files:**
- Modify: `components/Sidebar.jsx` (version string v1.16.2 → **v1.17.0** — minor: new feature)
- Modify: `.claude/STATUS.md` (new row in Staging Deployments table)

- [ ] **Step 1: Bump version in `components/Sidebar.jsx`** — locate the `v1.16.2` string and change to `v1.17.0`.

- [ ] **Step 2: Add STATUS.md row** summarizing: landing site in `landing/` (static FR/AR, dark premium, pricing placeholders), `agencies.subscription_status` migration + App.jsx gate + PendingActivation page, `?sign=` redirect, tests added (7 gate + 4 redirect), cutover checklist pending.

- [ ] **Step 3: Run the full suite one final time**

```bash
npm run test
```
Expected: all green.

- [ ] **Step 4: Graphify + commit (one commit, per CLAUDE.md)**

```bash
npm run graphify:update
git add components/Sidebar.jsx .claude/STATUS.md graphify-out
git commit -m "feat: landing page + subscription gating (v1.17.0)"
```

**Do NOT push.** Per CLAUDE.md, wait for the user's explicit "push to staging".

---

## Part C — Cutover checklist (operator actions, not code)

Performed by the user (with assistance) when ready to go live — order matters:

1. **Vercel:** create a new project from the same repo with **Root Directory = `landing/`**, Framework Preset = "Other" (static). Deploy.
2. **Vercel domains:** add `app.kiraflow.ma` to the EXISTING app project first (DNS CNAME → `cname.vercel-dns.com`). Verify the app loads at `app.kiraflow.ma` while `kiraflow.ma` still serves it too.
3. **Supabase Auth:** Site URL → `https://app.kiraflow.ma`; add it to Redirect URLs (keep `https://kiraflow.ma` during transition).
4. **Railway env:** `FRONTEND_URL=https://app.kiraflow.ma` — builds the WhatsApp contract-signing links; restart the service.
5. **Express CORS:** confirm `app.kiraflow.ma` is in the allowlist (`server/index.js`); add if origin-checked.
6. **Domain swap:** move `kiraflow.ma` + `www.kiraflow.ma` to the landing Vercel project. The app project keeps `app.kiraflow.ma` + its `.vercel.app` URL.
7. **Fill placeholders:** the three `XXX MAD` prices and the WhatsApp number (`212600000000` in `landing/index.html` footer + `pages/PendingActivation.jsx`).
8. **Verify:** `kiraflow.ma` shows landing (FR + AR toggle), `kiraflow.ma/?sign=test` redirects to `app.kiraflow.ma/?sign=test`, fresh signup on the app reaches Onboarding then sees PendingActivation, flipping `subscription_status` to `active` in Supabase + reload enters the app, an existing agency logs in normally, a real contract-signing link still opens.

---

## Self-review notes

- Spec coverage: nav/hero/features/screenshots/pricing/FAQ/footer (T6), dark premium (T5), FR+AR (T7), `?sign=` (T8), SEO (T9), screenshots (T10), migration+backfill (T1), gate+PendingActivation (T2-4), cutover (Part C). Limits display-only, no payments — nothing added.
- `XXX MAD` + WhatsApp number are spec-mandated user-supplied placeholders, listed in Part C step 7.
- Type consistency: `getSignRedirectUrl(search)` matches between T6 import and T8 module; `PendingActivation({ status, onSignOut })` matches T3 component, T4 gate, and T4 mock.
