# Test Failures Backlog

Captured: 2026-05-14 (against commit `8ecc7f0`, staging v1.10.4)
Run with: `npm run test` (i.e. `vitest run`)

Baseline: **20 failed / 461 passed (481 total)** across 18 failing files / 42 passing files. All 20 failures are pre-existing — they are NOT caused by the v1.10.4 perf+signature commit. Verified by stashing the v1.10.4 changes and re-running: identical numbers (20 failed / 50 passed when scoped to the touched directories).

The failures fall into **four buckets**. Fix each bucket once and the count should drop to zero.

---

## Bucket A — `.claude/worktrees/**` is picked up by vitest (NOISE)

About half of the "failed files" are stale duplicate test files inside `.claude/worktrees/{blissful-taussig-0c023e,cranky-lederberg-a3a85d,distracted-dubinsky-b1062c,eager-hertz-2c9aeb}/`. These are abandoned agent worktrees from prior sessions that should not be exercised.

**What to do:** add an `exclude` to vitest in `vite.config.js`:

```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.js'],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '.claude/worktrees/**',   // <- add this
  ],
},
```

After this, the worktree duplicates disappear from the report and the failure count drops by ~half.

**Bonus:** delete the worktrees directory entirely — `git worktree list` shows nothing using them. They are orphan copies from earlier subagent runs.

---

## Bucket B — `src/test/rentalStep.test.jsx` — 10 failed tests

File: [src/test/rentalStep.test.jsx](src/test/rentalStep.test.jsx)

### Failing tests
1. `"Continuer" button (canContinue guard) > is disabled on initial render (no vehicle, no endDate)`
2. `"Continuer" button (canContinue guard) > is disabled when dates are valid but no vehicle selected`
3. `"Continuer" button (canContinue guard) > is enabled when valid dates AND vehicle are selected`
4. `"Continuer" button (canContinue guard) > is disabled when endDate is before startDate`
5. `invalid date warning > shows warning when end date is before start date`
6. `duration display > shows correct number of days`
7. `price summary > always renders Total TTC row`
8. `vehicle list > shows no-vehicles alert when list is empty and dates are set`
9. `vehicle list > shows vehicle plate and daily rate`
10. `handleNext > calls onNext with correct vehicle, days, totalHT, tva, totalTTC`

### Root cause

[pages/rental/RentalStep.jsx](pages/rental/RentalStep.jsx:5) now imports `api.network.borrowedFleet` and calls it inside the vehicles `useEffect`:

```js
Promise.all([
  getAvailableVehicles(form.startDate, form.endDate),
  api.network.borrowedFleet({ startDate, endDate })
    .then(r => r.vehicles ?? [])
    .catch(() => []),
])
```

The test file mocks `lib/db` but **does NOT mock `lib/api`**. In jsdom the fetch goes nowhere, `borrowedFleet`'s promise either rejects or hangs, and `vehiclesLoading` stays `true` past `waitFor`'s default 1000 ms timeout. Each affected test times out at ~1050-1170 ms.

The passing worktree copies (`distracted-dubinsky`, `cranky-lederberg`, `eager-hertz`) don't have the `api.network.borrowedFleet` line — they're from before the network-vehicles feature landed.

### What to do

Add an `api` mock at the top of `src/test/rentalStep.test.jsx` alongside the existing mocks:

```js
vi.mock('../../lib/api', () => ({
  api: {
    network: {
      borrowedFleet: vi.fn().mockResolvedValue({ vehicles: [] }),
    },
  },
}))
```

That should restore all 10 tests. Tests that want to exercise the network-vehicle path can per-test override via `vi.mocked(api.network.borrowedFleet).mockResolvedValueOnce({ vehicles: [...] })`.

---

## Bucket C — Server tests can't be bundled by vitest

Files (in main project, not worktrees):
- [server/__tests__/smartQuote.test.js](server/__tests__/smartQuote.test.js)
- [server/__tests__/offerResponse.test.js](server/__tests__/offerResponse.test.js)
- [server/__tests__/contractsFinalize.test.js](server/__tests__/contractsFinalize.test.js)

### Symptom

```
Error: Cannot bundle Node.js built-in "node:test" imported from
".../server/__tests__/smartQuote.test.js".
Consider disabling environments.client.noExternal or remove the built-in dependency.
```

### Root cause

These three tests use Node's built-in test runner (`import { test } from 'node:test'`) — they're meant to run via `node --test`, NOT via vitest. Vitest's bundler chokes on `node:test`. Other server tests like `contractSigning.test.js` and `purgeSignedPdfs.test.js` use vitest-compatible syntax and pass fine.

### What to do

Two options — pick one:

**Option 1 (preferred): standardize on vitest for all tests.** Convert the three `node:test` files to vitest syntax:
- Replace `import { test } from 'node:test'` with `import { test, expect } from 'vitest'`
- Replace `node:assert` calls with `expect()` calls
- Drop the `node --test` runner pattern

**Option 2: exclude them from vitest and add a `test:server` script** that runs them with `node --test`:

```jsonc
// package.json
"scripts": {
  "test": "vitest run",
  "test:server": "node --test server/__tests__/smartQuote.test.js server/__tests__/offerResponse.test.js server/__tests__/contractsFinalize.test.js"
}
```

Plus exclude them in `vite.config.js`:

```js
exclude: [
  '**/node_modules/**',
  '.claude/worktrees/**',
  'server/__tests__/smartQuote.test.js',
  'server/__tests__/offerResponse.test.js',
  'server/__tests__/contractsFinalize.test.js',
],
```

---

## Bucket D — Other worktree-only files

A handful of `.claude/worktrees/blissful-taussig-0c023e/server/lib/triage.test.js`, `.../routes/admin.test.js`, etc., also fail with the same `node:test` bundling error. They are noise — Bucket A's vitest exclude eliminates them.

---

## Estimated effort

| Bucket | Tests fixed | Effort |
|---|---|---|
| A — exclude worktrees | ~10 file-level failures + reduces noise | 5 min |
| B — mock `lib/api` in rentalStep test | 10 test failures | 10 min |
| C — vitest-ify or split-runner the three server tests | 3 file-level failures | 30-45 min |
| D — covered by A | — | — |

**Target:** 0 failed / 481 passed after all three buckets are addressed. Touch order: A → B → C.
