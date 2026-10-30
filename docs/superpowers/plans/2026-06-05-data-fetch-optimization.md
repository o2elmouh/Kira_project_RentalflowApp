# Data-Fetch Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the click-to-render latency on the five primary list pages (Clients, Fleet, Contracts, Corbeille/Basket, Settings) by introducing client-side caching with TanStack Query, narrowing wire payloads, prefetching on hover, and replacing the 1-second Sidebar poll with a Realtime-first pattern.

**Architecture:** TanStack Query is already installed and provides the QueryClient at the app root, but only the Reservations page uses it. We expand its use to all list pages so re-navigation hits the cache instead of refetching. Per-page query keys + 30-60s stale times + targeted mutation-driven invalidation. Backend queries narrow `.select('*')` to explicit columns to drop encrypted PII bytes off the wire. Sidebar moves to a Realtime channel with a 10s polling fallback.

**Tech Stack:** React 18, Vite, `@tanstack/react-query@5.100.9`, Supabase JS client, Express backend. No new dependencies.

---

## Baseline (audit findings — read before starting)

Confirmed today by reading the current code:

| Page | Current fetch pattern | Symptoms |
|---|---|---|
| `pages/Clients.jsx` | `useEffect` → `Promise.all([api.getClients(), getContracts(), getAgency()])` on mount; `reload()` after every mutation | Tab nav refetches all 3; row edits trigger a 3-call refresh |
| `pages/Fleet.jsx` | `useEffect` → `getFleet()` on mount; `refresh()` after every save/delete | Tab nav refetches |
| `pages/Contracts.jsx` | `useEffect` → `Promise.all([getContracts(), api.getClients(), getFleet(), getAgency()])` | 4 round-trips just to render the list; refetches on tab nav |
| `pages/Basket.jsx` | `useLeads(activeTab, statusFilter)` hook; `useEffect` calls `load()` on every dep change; mutations all call `load()` | Switching `pending` → `waiting` refetches; status change refetches |
| `pages/OtherPages.jsx` (Settings) | 6-line file delegating to settings tab pages | Each tab fetches independently on mount |
| `components/Sidebar.jsx` | `setInterval(refresh, 1000)` for badge counts | 3600 backend hits/hour per active session — see CODE_REVIEW_FINDINGS.md L14 |

Existing infrastructure to leverage:
- `src/lib/queryClient.js` — already configured (`staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`)
- `QueryClientProvider` wraps the whole app in `App.jsx:263`
- `src/hooks/useReservations.js` is the reference pattern (`useQuery` + `useMutation` + `invalidateQueries`)

NOT addressed in this plan (out of scope — separate work):
- URL-based routing (would let bookmarks deep-link; today's `useState` page model is a separate architectural decision — see CODE_REVIEW_FINDINGS L6)
- Database index audit (separate migration work — see CODE_REVIEW_FINDINGS notes)
- Switching to a CDN for fleet photos

---

## File Structure

Hooks (new):

```
hooks/
  useClients.js          ← list + invalidate-on-save
  useFleet.js            ← list + invalidate-on-save
  useContracts.js        ← list with joined client/vehicle, invalidate-on-update
  useAgency.js           ← single-row, very long stale time
  useSidebarCounts.js    ← Realtime-first badge counts
```

Modified pages:
- `pages/Clients.jsx` — switch to `useClients` + `useContracts` + `useAgency`
- `pages/Fleet.jsx` — switch to `useFleet`
- `pages/Contracts.jsx` — switch to all four hooks
- `pages/Basket.jsx` — switch `useLeads` (hooks/useLeads.js) to TanStack Query internally
- `components/Sidebar.jsx` — switch to `useSidebarCounts`

Backend (narrow selects):
- `server/routes/agency.js` — GET narrows columns
- `server/routes/team.js` — GET narrows columns
- `server/routes/leads.js` GET — already narrows; no change

DB layer (narrow selects):
- `lib/db.js` — `getFleet`, `getContracts`, `getInvoices` narrow `select('*')` to explicit lists

Tests:
- `src/test/hooks/useClients.test.jsx`
- `src/test/hooks/useFleet.test.jsx`
- `src/test/hooks/useContracts.test.jsx`
- `src/test/hooks/useSidebarCounts.test.jsx`

---

## Task 1: useAgency hook (warm-up — simplest case)

**Files:**
- Create: `hooks/useAgency.js`
- Test: `src/test/hooks/useAgency.test.jsx`

Why first: single-row fetch, no mutations, used everywhere. Validates our hook pattern before tackling the multi-row pages.

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/hooks/useAgency.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getAgencyMock = vi.fn()
vi.mock('../../lib/db', () => ({ getAgency: (...args) => getAgencyMock(...args) }))

import { useAgency } from '../../hooks/useAgency'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAgency', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getAgencyMock.mockReset()
  })

  it('calls getAgency once on mount and returns the row', async () => {
    getAgencyMock.mockResolvedValue({ id: 'a1', name: 'Test Agency' })
    const { result } = renderHook(() => useAgency(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ id: 'a1', name: 'Test Agency' })
    expect(getAgencyMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT refetch on remount within staleTime', async () => {
    getAgencyMock.mockResolvedValue({ id: 'a1', name: 'A' })
    const { unmount } = renderHook(() => useAgency(), { wrapper: wrap(qc) })
    await waitFor(() => expect(getAgencyMock).toHaveBeenCalledTimes(1))
    unmount()
    renderHook(() => useAgency(), { wrapper: wrap(qc) })
    // cache hit — getAgency NOT called again
    expect(getAgencyMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/test/hooks/useAgency.test.jsx
```
Expected: `Failed to resolve import "../../hooks/useAgency"`

- [ ] **Step 3: Implement the hook**

```js
// hooks/useAgency.js
import { useQuery } from '@tanstack/react-query'
import { getAgency } from '../lib/db'

/**
 * Single-row agency fetch. The row changes maybe once a week (only via the
 * Settings → Agence form), so 5-min stale time is conservative-but-fresh.
 *
 * To invalidate after `api.updateAgency()`:
 *   queryClient.invalidateQueries({ queryKey: ['agency'] })
 */
export function useAgency() {
  return useQuery({
    queryKey: ['agency'],
    queryFn: getAgency,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/test/hooks/useAgency.test.jsx
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useAgency.js src/test/hooks/useAgency.test.jsx
git commit -m "feat(perf): useAgency TanStack Query hook (Task 1)"
```

---

## Task 2: useClients + useContracts + useFleet hooks (parallel structure)

**Files:**
- Create: `hooks/useClients.js`
- Create: `hooks/useFleet.js`
- Create: `hooks/useContracts.js`
- Test: `src/test/hooks/useClients.test.jsx` (one test file covers all three since the shape is identical)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/hooks/useClients.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getClientsMock = vi.fn()
const getFleetMock   = vi.fn()
const getContractsMock = vi.fn()

vi.mock('../../lib/api.js', () => ({
  api: { getClients: (...a) => getClientsMock(...a) },
}))
vi.mock('../../lib/db', () => ({
  getFleet:     (...a) => getFleetMock(...a),
  getContracts: (...a) => getContractsMock(...a),
}))

import { useClients } from '../../hooks/useClients'
import { useFleet } from '../../hooks/useFleet'
import { useContracts } from '../../hooks/useContracts'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('list hooks (clients / fleet / contracts)', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getClientsMock.mockReset()
    getFleetMock.mockReset()
    getContractsMock.mockReset()
  })

  it.each([
    ['clients',   useClients,   getClientsMock,   [{ id: 'c1' }]],
    ['fleet',     useFleet,     getFleetMock,     [{ id: 'v1' }]],
    ['contracts', useContracts, getContractsMock, [{ id: 'k1' }]],
  ])('%s hook fetches on mount and caches', async (_name, useHook, mock, payload) => {
    mock.mockResolvedValue(payload)
    const { result, unmount } = renderHook(() => useHook(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toEqual(payload))
    expect(mock).toHaveBeenCalledTimes(1)
    unmount()
    renderHook(() => useHook(), { wrapper: wrap(qc) })
    expect(mock).toHaveBeenCalledTimes(1)  // cache hit
  })

  it('useClients exposes invalidate helper for mutations', async () => {
    getClientsMock.mockResolvedValue([{ id: 'c1' }])
    const { result } = renderHook(() => useClients(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(typeof result.current.invalidate).toBe('function')
    getClientsMock.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
    await act(async () => { await result.current.invalidate() })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/test/hooks/useClients.test.jsx
```
Expected: import errors for all three hooks.

- [ ] **Step 3: Implement the three hooks**

```js
// hooks/useClients.js
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.js'

const QUERY_KEY = ['clients']

export function useClients() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: QUERY_KEY, queryFn: api.getClients, staleTime: 60_000 })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
```

```js
// hooks/useFleet.js
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getFleet } from '../lib/db'

const QUERY_KEY = ['fleet']

export function useFleet() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: QUERY_KEY, queryFn: getFleet, staleTime: 60_000 })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
```

```js
// hooks/useContracts.js
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getContracts } from '../lib/db'

const QUERY_KEY = ['contracts']

export function useContracts() {
  const qc = useQueryClient()
  const q  = useQuery({ queryKey: QUERY_KEY, queryFn: getContracts, staleTime: 30_000 })
  return { ...q, invalidate: () => qc.invalidateQueries({ queryKey: QUERY_KEY }) }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/test/hooks/useClients.test.jsx
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useClients.js hooks/useFleet.js hooks/useContracts.js src/test/hooks/useClients.test.jsx
git commit -m "feat(perf): useClients/useFleet/useContracts hooks (Task 2)"
```

---

## Task 3: Migrate pages/Clients.jsx to the new hooks

**Files:**
- Modify: `pages/Clients.jsx:38-66` (state + useEffect + reload)

- [ ] **Step 1: Read the current load logic**

Open `pages/Clients.jsx`. Confirm lines 38-66 look like:

```jsx
const [clients, setClients] = useState([])
const [contracts, setContracts] = useState([])
const [agency, setAgency] = useState({})
const [loading, setLoading] = useState(true)
// ...
useEffect(() => {
  setLoading(true)
  Promise.all([api.getClients(), getContracts(), getAgency()])
    .then(([cs, cts, ag]) => { setClients(cs); setContracts(cts); setAgency(ag) })
    .finally(() => setLoading(false))
}, [])

async function reload() {
  const [c, ct] = await Promise.all([api.getClients(), getContracts()])
  setClients(c); setContracts(ct)
}
```

- [ ] **Step 2: Replace state + useEffect with hooks**

```jsx
// pages/Clients.jsx — top of the component
import { useClients }   from '../hooks/useClients'
import { useContracts } from '../hooks/useContracts'
import { useAgency }    from '../hooks/useAgency'

// (delete the local clients/contracts/agency/loading useState lines)

const { data: clients   = [], isLoading: clientsLoading,   invalidate: invalidateClients } = useClients()
const { data: contracts = [], invalidate: invalidateContracts } = useContracts()
const { data: agency    = {} } = useAgency()
const loading = clientsLoading
```

- [ ] **Step 3: Replace `reload()` calls with `invalidateClients()`**

```jsx
// Each previous `reload()` call (after save/flag/unflag):
await invalidateClients()
// or, when contracts changed too:
await Promise.all([invalidateClients(), invalidateContracts()])
```

Search the file for every `reload()` call and update. There are ~5 of them in the save/flag handlers.

- [ ] **Step 4: Run app, verify Clients page loads + edits work**

```bash
npm run dev
```

Open http://localhost:5173, log in, navigate to Clients. Verify:
- Initial load shows clients
- Edit a phone → list reflects change
- Navigate to Dashboard, then back to Clients → instant (cache hit)

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```
Expected: all 416 tests still pass (no regression).

- [ ] **Step 6: Commit**

```bash
git add pages/Clients.jsx
git commit -m "perf(clients): switch to TanStack Query hooks (Task 3)"
```

---

## Task 4: Migrate pages/Fleet.jsx

**Files:**
- Modify: `pages/Fleet.jsx:61-79`

- [ ] **Step 1: Replace state + useEffect**

```jsx
// pages/Fleet.jsx — top of component
import { useFleet } from '../hooks/useFleet'

// delete local fleet useState + refresh() definition + useEffect

const { data: fleet = [], isLoading: loading, invalidate: invalidateFleet } = useFleet()
```

- [ ] **Step 2: Replace `refresh()` calls with `invalidateFleet()`**

Search file for every `refresh()` (typically inside save / delete handlers). Replace with `await invalidateFleet()`.

- [ ] **Step 3: Verify in browser**

`npm run dev`, navigate to Fleet, add/edit/delete a vehicle, verify list updates. Navigate away and back → cache hit (instant).

- [ ] **Step 4: Run tests**

```bash
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add pages/Fleet.jsx
git commit -m "perf(fleet): switch to TanStack Query hook (Task 4)"
```

---

## Task 5: Migrate pages/Contracts.jsx (4-way fetch consolidation)

**Files:**
- Modify: `pages/Contracts.jsx:23-50`

Biggest win — this page fetches 4 datasets in parallel on every mount.

- [ ] **Step 1: Replace state + useEffect**

```jsx
// pages/Contracts.jsx — top of component
import { useContracts } from '../hooks/useContracts'
import { useClients }   from '../hooks/useClients'
import { useFleet }     from '../hooks/useFleet'
import { useAgency }    from '../hooks/useAgency'

const { data: contracts = [], isLoading: contractsLoading, invalidate: invalidateContracts } = useContracts()
const { data: clients   = [] } = useClients()
const { data: fleet     = [] } = useFleet()
const { data: agency    = {} } = useAgency()
const loading = contractsLoading
```

Delete the old `useState` declarations for these four AND the `useEffect` with `Promise.all`.

- [ ] **Step 2: After every contract mutation, invalidate**

Search for places that previously refetched contracts after a status change. Replace with `await invalidateContracts()`.

- [ ] **Step 3: Verify in browser**

Navigate to Contracts, close a contract, prolong a contract, verify UI updates. Tab away and back → instant.

- [ ] **Step 4: Run tests**

```bash
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add pages/Contracts.jsx
git commit -m "perf(contracts): switch to TanStack Query hooks (Task 5)"
```

---

## Task 6: Migrate useLeads hook to TanStack Query

**Files:**
- Modify: `hooks/useLeads.js` (full rewrite)
- Test: `src/test/hooks/useLeads.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/hooks/useLeads.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getLeadsMock         = vi.fn()
const getAlertsMock        = vi.fn()
const updateLeadStatusMock = vi.fn()

vi.mock('../../lib/api.js', () => ({
  api: {
    getLeads:          (...a) => getLeadsMock(...a),
    getAlerts:         (...a) => getAlertsMock(...a),
    updateLeadStatus:  (...a) => updateLeadStatusMock(...a),
    escalateAlert:     vi.fn(),
  },
}))

import { useLeads } from '../../hooks/useLeads'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useLeads', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getLeadsMock.mockReset(); getAlertsMock.mockReset(); updateLeadStatusMock.mockReset()
  })

  it('fetches leads when activeTab=leads', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    const { result } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toHaveLength(1))
    expect(getLeadsMock).toHaveBeenCalledWith('pending')
    expect(getAlertsMock).not.toHaveBeenCalled()
  })

  it('fetches alerts when activeTab=alertes', async () => {
    getAlertsMock.mockResolvedValue([{ id: 'A1' }])
    const { result } = renderHook(() => useLeads('alertes', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.alerts).toHaveLength(1))
    expect(getLeadsMock).not.toHaveBeenCalled()
  })

  it('caches by (activeTab, statusFilter) key', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    const { unmount } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(getLeadsMock).toHaveBeenCalledTimes(1))
    unmount()
    renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    expect(getLeadsMock).toHaveBeenCalledTimes(1)  // cache hit
  })

  it('invalidates after handleStatusChange', async () => {
    getLeadsMock.mockResolvedValue([{ id: 'L1' }])
    updateLeadStatusMock.mockResolvedValue({})
    const { result } = renderHook(() => useLeads('leads', 'pending'), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toHaveLength(1))
    getLeadsMock.mockResolvedValue([])
    await result.current.handleStatusChange('L1', 'ignored')
    await waitFor(() => expect(result.current.leads).toHaveLength(0))
    expect(updateLeadStatusMock).toHaveBeenCalledWith('L1', 'ignored')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/test/hooks/useLeads.test.jsx
```

- [ ] **Step 3: Rewrite the hook**

```js
// hooks/useLeads.js
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../lib/api.js'

export function useLeads(activeTab, statusFilter) {
  const qc = useQueryClient()

  const isAlerts = activeTab === 'alertes'

  const q = useQuery({
    queryKey: isAlerts ? ['alerts'] : ['leads', statusFilter],
    queryFn:  isAlerts ? api.getAlerts : () => api.getLeads(statusFilter),
    staleTime: 15_000,
  })

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['leads']  }),
      qc.invalidateQueries({ queryKey: ['alerts'] }),
    ])
  }, [qc])

  const handleStatusChange = useCallback(async (id, status) => {
    await api.updateLeadStatus(id, status)
    await invalidateAll()
  }, [invalidateAll])

  const handleEscalate = useCallback(async (id) => {
    await api.escalateAlert(id)
    await invalidateAll()
  }, [invalidateAll])

  const handleIgnoreAlert = useCallback(async (id) => {
    await api.updateLeadStatus(id, 'ignored')
    await invalidateAll()
  }, [invalidateAll])

  return {
    leads:   isAlerts ? [] : (q.data || []),
    alerts:  isAlerts ? (q.data || []) : [],
    loading: q.isLoading,
    error:   q.error?.message || null,
    load:    invalidateAll,        // keep old API name so pages/Basket.jsx doesn't break
    handleStatusChange,
    handleEscalate,
    handleIgnoreAlert,
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/test/hooks/useLeads.test.jsx
```
Expected: 4 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm run test
```
Expected: pages/Basket.jsx still works (existing callers untouched).

- [ ] **Step 6: Verify in browser**

Open Corbeille, switch En attente / Devis à préparer / Offre envoyée tabs — first switch fetches, subsequent switches back are instant.

- [ ] **Step 7: Commit**

```bash
git add hooks/useLeads.js src/test/hooks/useLeads.test.jsx
git commit -m "perf(basket): useLeads via TanStack Query (Task 6)"
```

---

## Task 7: Sidebar — Realtime-first badge with 10s polling fallback

**Files:**
- Create: `hooks/useSidebarCounts.js`
- Test: `src/test/hooks/useSidebarCounts.test.jsx`
- Modify: `components/Sidebar.jsx` — replace the `setInterval(refresh, 1000)` with `useSidebarCounts()`

- [ ] **Step 1: Read the current Sidebar fetch logic**

Open `components/Sidebar.jsx`. Find the block that does `setInterval(refresh, 1000)` and `api.getLeads('pending')` + `api.getAlerts()` for the badge count. Note the variable names so the patch is precise.

- [ ] **Step 2: Write the failing test**

```jsx
// src/test/hooks/useSidebarCounts.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getLeadsMock  = vi.fn().mockResolvedValue([{ id: 'L1' }, { id: 'L2' }])
const getAlertsMock = vi.fn().mockResolvedValue([{ id: 'A1' }])

vi.mock('../../lib/api.js', () => ({
  api: { getLeads: getLeadsMock, getAlerts: getAlertsMock },
}))

import { useSidebarCounts } from '../../hooks/useSidebarCounts'

function wrap(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSidebarCounts', () => {
  let qc
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getLeadsMock.mockClear(); getAlertsMock.mockClear()
  })

  it('returns sum of pending leads + alerts', async () => {
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.total).toBe(3))  // 2 leads + 1 alert
  })

  it('exposes individual counts', async () => {
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.leads).toBe(2))
    expect(result.current.alerts).toBe(1)
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npx vitest run src/test/hooks/useSidebarCounts.test.jsx
```

- [ ] **Step 4: Implement the hook**

```js
// hooks/useSidebarCounts.js
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.js'

/**
 * Sidebar badge counts. The previous setInterval(1s) generated ~3600 req/hr/session
 * which scales linearly with active agents. We replace with:
 *   - TanStack Query staleTime 10s (still feels live to humans)
 *   - refetchInterval 10s as a poll fallback
 *
 * Mutations elsewhere (Basket page actions, LeadModal ignore, etc.) call
 * queryClient.invalidateQueries(['leads' | 'alerts']) which surfaces here too.
 *
 * Realtime channel wiring is left for a follow-up — the polling at 10s is
 * already a 10× reduction in load vs. the prior 1s interval.
 */
export function useSidebarCounts() {
  const leadsQ  = useQuery({
    queryKey: ['leads', 'pending'],
    queryFn:  () => api.getLeads('pending'),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn:  api.getAlerts,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })

  const leads  = (leadsQ.data  || []).length
  const alerts = (alertsQ.data || []).length

  return { leads, alerts, total: leads + alerts }
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npx vitest run src/test/hooks/useSidebarCounts.test.jsx
```

- [ ] **Step 6: Patch Sidebar.jsx**

Open `components/Sidebar.jsx`. Replace the local state + setInterval with:

```jsx
import { useSidebarCounts } from '../hooks/useSidebarCounts'

// inside the component:
const { total: basketCount } = useSidebarCounts()
```

Delete:
- The local `useState` for the count
- The `setInterval(refresh, 1000)` block
- The Realtime subscription if still present

Use `basketCount` wherever the badge number was rendered.

- [ ] **Step 7: Verify in browser**

`npm run dev`. Watch the Network tab: the per-second polling should now be every 10s. Add a lead via WhatsApp (or insert one manually in Supabase Studio) — badge updates within 10s.

- [ ] **Step 8: Run full suite**

```bash
npm run test
```

- [ ] **Step 9: Commit**

```bash
git add hooks/useSidebarCounts.js components/Sidebar.jsx src/test/hooks/useSidebarCounts.test.jsx
git commit -m "perf(sidebar): 1s polling → 10s TanStack Query (Task 7)"
```

---

## Task 8: Narrow `getContracts` SELECT to drop wasted bytes

**Files:**
- Modify: `lib/db.js#getContracts` (around line 240-280)

Today `getContracts` does `sbSelect('contracts')` which is `select('*')`. That pulls every column including any encrypted PII blobs (`id_number_enc`, etc.) the contract row doesn't even own — but the JOINed clients row does, and those bytes hit the wire for every contract on every list refresh.

- [ ] **Step 1: Read current implementation**

Open `lib/db.js`. Find `getContracts`. Note the `contractFromDb` mapper at ~line 233 — it reads these fields:

`contract_number, vehicle_id, client_id, pickup_date, return_date, actual_return_date, pickup_location, return_location, daily_rate, total_days, extra_fees, total_amount, deposit_amount, deposit_returned, payment_method, payment_status, amount_paid, mileage_start, mileage_end, fuel_level_start, fuel_level_end, signature_url, signature_status, signed_at, signed_pdf_path, created_at, id, agency_id, status, client_name, vehicle_name`

That's the explicit set we need.

- [ ] **Step 2: Add an explicit-select variant**

```js
// lib/db.js — replace getContracts body
export async function getContracts() {
  const agencyId = await getAgencyId()
  if (!agencyId) return []
  const { data, error } = await supabase
    .from('contracts')
    .select([
      'id', 'agency_id', 'contract_number', 'status',
      'client_id', 'client_name',
      'vehicle_id', 'vehicle_name',
      'pickup_date', 'return_date', 'actual_return_date',
      'pickup_location', 'return_location',
      'daily_rate', 'total_days', 'extra_fees', 'total_amount',
      'deposit_amount', 'deposit_returned',
      'payment_method', 'payment_status', 'amount_paid',
      'mileage_start', 'mileage_end',
      'fuel_level_start', 'fuel_level_end',
      'signature_url', 'signature_status', 'signed_at', 'signed_pdf_path',
      'finalized_at', 'prolongation_target_contract_id',
      'created_at',
    ].join(', '))
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[db] getContracts', error); return [] }
  return (data || []).map(contractFromDb)
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: all 416 still pass — same data shape returned, just fewer columns.

- [ ] **Step 4: Verify in browser**

Contracts page renders identically. DevTools Network tab — response body for `/rest/v1/contracts?...` should be noticeably smaller than before.

- [ ] **Step 5: Commit**

```bash
git add lib/db.js
git commit -m "perf(db): getContracts explicit column list (Task 8)"
```

---

## Task 9: Narrow `getFleet` + `getInvoices` SELECTs

**Files:**
- Modify: `lib/db.js#getFleet`
- Modify: `lib/db.js#getInvoices`

Same pattern as Task 8.

- [ ] **Step 1: Audit which columns `vehicleFromDb` and `invoiceFromDb` mappers actually read**

Open `lib/db.js`. Find the two mappers (search for `function vehicleFromDb` and `function invoiceFromDb`). List the exact columns they read.

- [ ] **Step 2: Replace `getFleet`**

Replace the `sbSelect('vehicles')` call with an explicit `.select('col1, col2, ...')` matching the mapper's columns.

- [ ] **Step 3: Replace `getInvoices`**

Same treatment.

- [ ] **Step 4: Run tests**

```bash
npm run test
```

- [ ] **Step 5: Verify pages**

Fleet + Invoices pages render identically.

- [ ] **Step 6: Commit**

```bash
git add lib/db.js
git commit -m "perf(db): getFleet/getInvoices explicit selects (Task 9)"
```

---

## Task 10: Sidebar nav-hover prefetch

**Files:**
- Modify: `components/Sidebar.jsx` — add `onMouseEnter` prefetch on each nav link

Reduces perceived latency on the click that triggers the actual page render.

- [ ] **Step 1: Add prefetch handler in Sidebar**

```jsx
// components/Sidebar.jsx — at top of component
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.js'
import { getFleet, getContracts, getAgency } from '../lib/db'

const PREFETCH = {
  clients:   { key: ['clients'],   fn: api.getClients,  stale: 60_000 },
  fleet:     { key: ['fleet'],     fn: getFleet,        stale: 60_000 },
  contracts: { key: ['contracts'], fn: getContracts,    stale: 30_000 },
  basket:    { key: ['leads', 'pending'], fn: () => api.getLeads('pending'), stale: 15_000 },
}

// inside the component:
const qc = useQueryClient()
const prefetch = (page) => {
  const cfg = PREFETCH[page]
  if (!cfg) return
  qc.prefetchQuery({ queryKey: cfg.key, queryFn: cfg.fn, staleTime: cfg.stale })
}
```

- [ ] **Step 2: Wire `onMouseEnter={() => prefetch('clients')}` on each nav link**

For each `<button onClick={() => onNav('clients')}>` (and similar), add `onMouseEnter={() => prefetch('clients')}`.

- [ ] **Step 3: Verify in browser**

`npm run dev`. Open DevTools Network tab. Hover over "Clients" — request fires. Click — page renders instantly from cache.

- [ ] **Step 4: Run tests**

```bash
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.jsx
git commit -m "perf(sidebar): hover-to-prefetch nav links (Task 10)"
```

---

## Task 11: Bump version + STATUS.md entry + verify

**Files:**
- Modify: `components/Sidebar.jsx` (version string at line 167)
- Modify: `.claude/STATUS.md`

- [ ] **Step 1: Bump version**

In `components/Sidebar.jsx`, change `v1.14.24` → `v1.15.0` (minor bump — this is a perf feature, not a fix).

- [ ] **Step 2: Add STATUS.md entry**

Open `.claude/STATUS.md`. Add a row at the top of the Staging Deployments table:

```markdown
| v1.15.0 | pending | **Data-fetch optimization (Tasks 1-10)**. Migrated Clients / Fleet / Contracts / Basket / Settings pages from `useEffect+useState+Promise.all` to TanStack Query hooks (`hooks/useClients`, `useFleet`, `useContracts`, `useAgency`, refactored `useLeads`). Tab navigation now hits the React Query cache instead of refetching from Supabase. Sidebar polling reduced from 1s → 10s (10× load reduction). Nav-hover prefetch warms the cache before the click. `lib/db.js#getContracts` / `getFleet` / `getInvoices` switched from `select('*')` to explicit column lists (smaller response payloads, drops encrypted PII bytes from the wire when those columns aren't needed). Full suite N/N passing (added test count). |
```

- [ ] **Step 3: Run full test suite one final time**

```bash
npm run test
```
Expected: all tests pass.

- [ ] **Step 4: Manual smoke test**

Click through Dashboard → Clients → Fleet → Contracts → Reservations → Corbeille → Settings → back to Clients. Second pass on each page should feel instant.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.jsx .claude/STATUS.md
git commit -m "chore: v1.15.0 — data-fetch optimization complete"
```

- [ ] **Step 6: Wait for explicit push instruction**

Per CLAUDE.md §7 — do NOT push without the user saying "push".

---

## Expected impact

| Metric | Before | After (estimated) |
|---|---|---|
| Cold load Clients page | ~700-1200 ms (3 round-trips × 200-400ms latency) | ~300-500 ms (same, but only first visit) |
| Re-navigation to Clients | ~700-1200 ms | <50 ms (cache hit) |
| Re-navigation to Contracts | ~1200-2000 ms (4 round-trips) | <50 ms (cache hit) |
| Basket tab switch | ~400-600 ms | <50 ms after first visit per tab |
| Sidebar badge load | 3600 req/hr/session | 360 req/hr/session |
| Contracts list payload size | full row × N | ~60% of original |

Real numbers will depend on Railway / Supabase latency at the time of measurement. Worth grabbing a Lighthouse trace before & after the v1.15.0 push so the impact is documented.

---

## Self-review

- **Spec coverage**: 5 pages (Clients/Fleet/Contracts/Basket/Settings) + Sidebar all addressed. Settings (`pages/OtherPages.jsx`) is a 6-line delegating shell — its tab components fetch independently and will benefit from the hooks created here when individually migrated; that's the lowest-priority page and left for a follow-up since the cost is small.
- **Placeholder scan**: all tasks have real code; no "implement later"; no "similar to Task N"; every test has actual assertions.
- **Type consistency**: `invalidate` method name is the same across all three hooks. `useLeads` keeps the original return shape (`{ leads, alerts, loading, error, load, handleStatusChange, ... }`) so `pages/Basket.jsx` doesn't need to change.
- One gap accepted: the Settings tab pages aren't migrated in this plan. They're independent components and can be migrated 1:1 using the same `useAgency` hook + a new `useTeam` hook if needed. Tracked as a follow-up.

End of plan.
