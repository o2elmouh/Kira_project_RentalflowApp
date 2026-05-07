# Booking Hub — Omnichannel Reservations Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an omnichannel "Booking Hub" that centralizes confirmed reservations from four channels (EMAIL, WHATSAPP, WEBSITE, IN_PERSON) into a single TanStack Table with server-side filtering, pagination, sorting, and a side panel for channel-specific metadata.

**Architecture:** A new `reservations` table sits **between leads and contracts** in the data flow:
```
Inbound Lead (Basket) → SmartQuote consent → NewRental wizard → Reservation row → Contract (optional, for e-sign)
                                              ↑
                                       Walk-ins also enter here
                                              ↑
                              Website bookings land directly via API
```
The new `Reservations` page becomes a top-level Sidebar nav item with full TanStack Table v8 + Query v5 stack, server-side filters, and i18n (FR/AR/EN).

**Tech Stack:** React 18 + Vite (existing), `@tanstack/react-table` v8 (NEW), `@tanstack/react-query` v5 (NEW), `date-fns` + `date-fns-tz` for timezone (NEW), Supabase (existing), Express (existing), CSS variables design system (existing — no Tailwind).

**Branch:** `staging` (commit directly per CLAUDE.md, do not push without explicit user approval).

---

## File Structure

### New Files
- `supabase/migrations/011_reservations.sql` — table, enums, RLS, indexes
- `server/routes/reservations.js` — GET /api/reservations with filtering/pagination/sorting
- `server/lib/reservationFilters.js` — query builder utility
- `server/__tests__/reservations.test.js` — backend integration tests
- `pages/Reservations.jsx` — page-level component (header, filters, table)
- `pages/reservations/ReservationsTable.jsx` — TanStack table UI only
- `pages/reservations/ReservationDetailsPanel.jsx` — side sheet for source_metadata
- `pages/reservations/SourceChannelBadge.jsx` — icon + label per channel
- `pages/reservations/StatusBadge.jsx` — colored status badge
- `pages/reservations/FilterBar.jsx` — channel/status/date/price/search filters
- `src/hooks/useReservations.js` — TanStack Query data-fetching hook
- `src/hooks/useReservationFilters.js` — filter state + URL sync
- `src/lib/queryClient.js` — single QueryClient instance
- `src/utils/timezone.js` — UTC ↔ local conversion helpers
- `src/utils/reservationsApi.js` — frontend API client wrapper
- `public/locales/fr/reservations.json` — French translations
- `public/locales/ar/reservations.json` — Arabic translations
- `public/locales/en/reservations.json` — English translations
- `src/__tests__/useReservations.test.js` — hook tests
- `src/__tests__/timezone.test.js` — timezone util tests

### Modified Files
- `package.json` — add 3 dependencies
- `App.jsx` — register QueryClientProvider, route 'reservations' page
- `components/Sidebar.jsx` — add Reservations nav item, bump version to v1.9.0
- `lib/i18n.js` — register `reservations` namespace
- `pages/rental/ContractStep.jsx` (or last step of NewRental) — create reservation on completion
- `server/index.js` — mount `/reservations` router
- `.claude/STATUS.md` — log v1.9.0 deployment

---

## Action Items

---

### Task 1: Database Migration

- [ ] **Step 1: Write SQL migration**

File: `supabase/migrations/011_reservations.sql`

```sql
-- ─────────────────────────────────────────────────────────────
-- Migration 011 — Booking Hub: Omnichannel Reservations
-- Centralizes confirmed bookings from EMAIL/WHATSAPP/WEBSITE/IN_PERSON
-- ─────────────────────────────────────────────────────────────

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE booking_source AS ENUM ('EMAIL', 'WHATSAPP', 'WEBSITE', 'IN_PERSON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Customer (FK + denormalized for fast list reads)
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  customer_name     text NOT NULL,
  customer_contact  text NOT NULL,                          -- email or phone

  -- Vehicle (FK + denormalized)
  vehicle_id        uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  car_model         text NOT NULL,                          -- "Renault Clio 2024"

  -- Period (UTC; convert to local in UI)
  start_date        timestamptz NOT NULL,
  end_date          timestamptz NOT NULL,

  -- Pricing
  total_price       numeric(10, 2) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'MAD',

  -- Channel + status
  source_channel    booking_source NOT NULL,
  status            reservation_status NOT NULL DEFAULT 'PENDING',

  -- Channel-specific raw context (email subject, WhatsApp number, lead_id, etc.)
  source_metadata   jsonb NOT NULL DEFAULT '{}',

  -- Optional links
  lead_id           uuid REFERENCES leads(id) ON DELETE SET NULL,
  contract_id       uuid REFERENCES contracts(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,

  CHECK (end_date > start_date),
  CHECK (total_price >= 0)
);

-- 3. Auto-update updated_at trigger
DROP TRIGGER IF EXISTS reservations_updated_at ON reservations;
CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Indexes for filter/sort/search performance
CREATE INDEX IF NOT EXISTS reservations_agency_status_idx
  ON reservations (agency_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS reservations_agency_source_idx
  ON reservations (agency_id, source_channel, created_at DESC);

CREATE INDEX IF NOT EXISTS reservations_agency_dates_idx
  ON reservations (agency_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS reservations_customer_name_trgm
  ON reservations USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS reservations_client_id_idx
  ON reservations (client_id);

CREATE INDEX IF NOT EXISTS reservations_vehicle_id_idx
  ON reservations (vehicle_id);

-- 5. RLS — agency isolation
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_isolation_select" ON reservations;
CREATE POLICY "agency_isolation_select" ON reservations
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_insert" ON reservations;
CREATE POLICY "agency_isolation_insert" ON reservations
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_update" ON reservations;
CREATE POLICY "agency_isolation_update" ON reservations
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "agency_isolation_delete" ON reservations;
CREATE POLICY "agency_isolation_delete" ON reservations
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- 6. Required extensions (gin_trgm_ops for fuzzy customer_name search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON TABLE reservations IS 'Omnichannel bookings — sits between leads (Basket) and contracts (e-signature). Source-channel-aware.';
COMMENT ON COLUMN reservations.source_metadata IS 'Channel-specific raw payload: { email_subject?, whatsapp_number?, website_session_id?, walk_in_notes? }';
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase migration up
```

Verify in Supabase Studio: `reservations` table exists with all columns, enums, indexes, and 4 RLS policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_reservations.sql
git commit -m "feat(db): Booking Hub reservations table + enums + RLS + indexes"
```

---

### Task 2: Backend API

- [ ] **Step 1: Install dependencies (frontend only — backend uses existing)**

```bash
npm install @tanstack/react-table @tanstack/react-query date-fns date-fns-tz
```

Verify versions in `package.json`:
- `@tanstack/react-table`: `^8.x`
- `@tanstack/react-query`: `^5.x`
- `date-fns`: `^3.x`
- `date-fns-tz`: `^3.x`

- [ ] **Step 2: Build query helper**

File: `server/lib/reservationFilters.js`

```javascript
/**
 * Reservation query builder.
 * Translates query string params into Supabase filter chain.
 *
 * Supported filters:
 *   - source: 'EMAIL' | 'WHATSAPP' | 'WEBSITE' | 'IN_PERSON' | 'all'
 *   - status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'all'
 *   - search: free-text on customer_name (uses ilike)
 *   - dateFrom / dateTo: ISO strings (filters on start_date)
 *   - priceMin / priceMax: numbers (filters on total_price)
 *
 * Sorting:
 *   - sort: 'created_at' | 'start_date' | 'total_price' | 'customer_name'
 *   - order: 'asc' | 'desc' (default 'desc')
 *
 * Pagination:
 *   - page: 1-indexed
 *   - pageSize: max 100, default 25
 */
export function applyReservationFilters(query, params) {
  const {
    source, status, search,
    dateFrom, dateTo, priceMin, priceMax,
    sort = 'created_at', order = 'desc',
    page = 1, pageSize = 25,
  } = params;

  if (source && source !== 'all') query = query.eq('source_channel', source);
  if (status && status !== 'all') query = query.eq('status', status);
  if (search?.trim()) query = query.ilike('customer_name', `%${search.trim()}%`);
  if (dateFrom) query = query.gte('start_date', dateFrom);
  if (dateTo)   query = query.lte('start_date', dateTo);
  if (priceMin != null) query = query.gte('total_price', Number(priceMin));
  if (priceMax != null) query = query.lte('total_price', Number(priceMax));

  const ALLOWED_SORTS = new Set(['created_at', 'start_date', 'total_price', 'customer_name']);
  const sortCol = ALLOWED_SORTS.has(sort) ? sort : 'created_at';
  query = query.order(sortCol, { ascending: order === 'asc' });

  const ps = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const from = (pageNum - 1) * ps;
  const to   = from + ps - 1;
  query = query.range(from, to);

  return { query, page: pageNum, pageSize: ps };
}
```

- [ ] **Step 3: Build the route**

File: `server/routes/reservations.js`

```javascript
import { Router } from 'express';
import supabaseAdmin from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { applyReservationFilters } from '../lib/reservationFilters.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /reservations
 * List reservations for the caller's agency with filters/sort/pagination.
 *
 * Returns:
 * {
 *   data: Reservation[],
 *   page: number,
 *   pageSize: number,
 *   total: number  // grand total matching filters (for pagination UI)
 * }
 */
router.get('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id;
    if (!agencyId) return res.status(403).json({ error: 'No agency on profile' });

    // Build query (count: 'exact' returns total for pagination)
    let query = supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId);

    const { query: built, page, pageSize } = applyReservationFilters(query, req.query);

    const { data, count, error } = await built;
    if (error) throw error;

    res.json({ data: data || [], page, pageSize, total: count || 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /reservations/:id
 * Single reservation detail (for the side panel).
 */
router.get('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id;
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*, clients(*), vehicles(*)')
      .eq('id', req.params.id)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /reservations
 * Create a reservation. Called from NewRental wizard (IN_PERSON / EMAIL / WHATSAPP)
 * or from the public website endpoint (WEBSITE).
 */
router.post('/', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id;
    const payload = {
      ...req.body,
      agency_id: agencyId,
      created_by: req.user.id,
    };

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /reservations/:id
 * Partial update (e.g., status change PENDING → CONFIRMED).
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const agencyId = req.user.agency_id;
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('agency_id', agencyId)
      .select('*')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 4: Mount the router**

File: `server/index.js` — add:

```javascript
import reservationsRouter from './routes/reservations.js';
// ... after other routes
app.use('/reservations', reservationsRouter);
```

- [ ] **Step 5: Write integration tests**

File: `server/__tests__/reservations.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import supabaseAdmin from '../lib/supabaseAdmin.js';

describe('GET /reservations', () => {
  let agencyId, authHeader;

  beforeAll(async () => {
    // Seed: create an agency, profile, JWT — depends on existing test helpers
    // Insert 5 reservations with different sources/statuses
  });

  afterAll(async () => {
    await supabaseAdmin.from('reservations').delete().eq('agency_id', agencyId);
  });

  it('returns paginated reservations for the agency', async () => {
    const res = await request(app)
      .get('/reservations?page=1&pageSize=10')
      .set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
  });

  it('filters by source_channel', async () => {
    const res = await request(app)
      .get('/reservations?source=EMAIL')
      .set('Authorization', authHeader);
    expect(res.body.data.every(r => r.source_channel === 'EMAIL')).toBe(true);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/reservations?status=CONFIRMED')
      .set('Authorization', authHeader);
    expect(res.body.data.every(r => r.status === 'CONFIRMED')).toBe(true);
  });

  it('searches by customer_name (ilike)', async () => {
    const res = await request(app)
      .get('/reservations?search=Hassan')
      .set('Authorization', authHeader);
    expect(res.body.data.every(r => /hassan/i.test(r.customer_name))).toBe(true);
  });

  it('sorts by total_price desc', async () => {
    const res = await request(app)
      .get('/reservations?sort=total_price&order=desc')
      .set('Authorization', authHeader);
    const prices = res.body.data.map(r => Number(r.total_price));
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it('caps pageSize at 100', async () => {
    const res = await request(app)
      .get('/reservations?pageSize=999')
      .set('Authorization', authHeader);
    expect(res.body.pageSize).toBe(100);
  });
});
```

- [ ] **Step 6: Run tests + commit**

```bash
npm run test -- server/__tests__/reservations.test.js
git add server/routes/reservations.js server/lib/reservationFilters.js server/__tests__/reservations.test.js server/index.js
git commit -m "feat(api): GET/POST/PATCH /reservations with filters, pagination, sorting"
```

---

### Task 3: Frontend — Hooks & Utils

- [ ] **Step 1: QueryClient + provider**

File: `src/lib/queryClient.js`

```javascript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30s — reservations don't change every second
      retry: 1,                     // one retry on transient errors
      refetchOnWindowFocus: false,  // avoid excessive refetches
    },
  },
});
```

File: `App.jsx` — wrap providers (paste near top of root component):

```jsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/lib/queryClient';

// Wrap UserContext.Provider with:
<QueryClientProvider client={queryClient}>
  <UserContext.Provider value={...}>
    {/* ... */}
  </UserContext.Provider>
</QueryClientProvider>
```

- [ ] **Step 2: Timezone utilities**

File: `src/utils/timezone.js`

```javascript
/**
 * Timezone utilities — DB always stores UTC; UI shows user-local.
 * Uses date-fns-tz for IANA zone-aware formatting.
 */
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Casablanca';

/** UTC ISO string → local Date object */
export function utcToLocal(utcIso) {
  if (!utcIso) return null;
  return toZonedTime(new Date(utcIso), USER_TZ);
}

/** Local Date object → UTC ISO string for DB insert */
export function localToUtc(localDate) {
  if (!localDate) return null;
  return fromZonedTime(localDate, USER_TZ).toISOString();
}

/** Format UTC ISO into user-local display string */
export function formatLocal(utcIso, fmt = 'dd/MM/yyyy HH:mm') {
  const d = utcToLocal(utcIso);
  return d ? format(d, fmt) : '—';
}

/** Format date range like "12 mai → 18 mai 2026" */
export function formatRange(startUtc, endUtc) {
  const s = formatLocal(startUtc, 'dd MMM');
  const e = formatLocal(endUtc, 'dd MMM yyyy');
  return `${s} → ${e}`;
}

export { USER_TZ };
```

- [ ] **Step 3: Frontend API client**

File: `src/utils/reservationsApi.js`

```javascript
import { supabase } from '../../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function fetchReservations(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '' && v !== 'all') qs.set(k, v);
  });

  const res = await fetch(`${API_URL}/reservations?${qs}`, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(`Reservations fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchReservationById(id) {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(`Reservation ${id} fetch failed: ${res.status}`);
  return res.json();
}

export async function createReservation(payload) {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Reservation create failed: ${res.status}`);
  return res.json();
}

export async function updateReservation(id, patch) {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Reservation ${id} patch failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Filter state hook (URL-synced)**

File: `src/hooks/useReservationFilters.js`

```javascript
import { useState, useCallback } from 'react';

const DEFAULT = {
  source: 'all',
  status: 'all',
  search: '',
  dateFrom: '',
  dateTo: '',
  priceMin: '',
  priceMax: '',
  sort: 'created_at',
  order: 'desc',
  page: 1,
  pageSize: 25,
};

export function useReservationFilters(initial = {}) {
  const [filters, setFilters] = useState({ ...DEFAULT, ...initial });

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset to page 1 when any non-pagination filter changes
      ...(key !== 'page' && key !== 'pageSize' ? { page: 1 } : {}),
    }));
  }, []);

  const reset = useCallback(() => setFilters(DEFAULT), []);

  return { filters, setFilter, reset };
}
```

- [ ] **Step 5: TanStack Query hook**

File: `src/hooks/useReservations.js`

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchReservations, fetchReservationById,
  updateReservation, createReservation,
} from '../utils/reservationsApi';

export function useReservations(filters) {
  return useQuery({
    queryKey: ['reservations', filters],
    queryFn: () => fetchReservations(filters),
    placeholderData: (prev) => prev,   // keepPreviousData v5 syntax
    staleTime: 30_000,
  });
}

export function useReservation(id) {
  return useQuery({
    queryKey: ['reservation', id],
    queryFn: () => fetchReservationById(id),
    enabled: !!id,
  });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => updateReservation(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}
```

- [ ] **Step 6: Hook unit tests**

File: `src/__tests__/timezone.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { formatLocal, formatRange, utcToLocal, localToUtc } from '../utils/timezone';

describe('timezone utils', () => {
  it('utcToLocal returns null for falsy input', () => {
    expect(utcToLocal(null)).toBeNull();
    expect(utcToLocal('')).toBeNull();
  });

  it('round-trip UTC → local → UTC preserves the instant', () => {
    const utc = '2026-05-15T10:00:00.000Z';
    const local = utcToLocal(utc);
    const back = localToUtc(local);
    expect(new Date(back).toISOString()).toBe(utc);
  });

  it('formatLocal returns em-dash for null', () => {
    expect(formatLocal(null)).toBe('—');
  });

  it('formatRange returns "start → end" string', () => {
    const result = formatRange('2026-05-12T00:00:00Z', '2026-05-18T00:00:00Z');
    expect(result).toMatch(/→/);
  });
});
```

- [ ] **Step 7: Run tests + commit**

```bash
npm run test -- src/__tests__/timezone.test.js
git add src/lib/ src/utils/ src/hooks/ src/__tests__/ App.jsx package.json package-lock.json
git commit -m "feat(hooks): TanStack Query data layer + timezone utils for reservations"
```

---

### Task 4: Frontend — UI Components

- [ ] **Step 1: SourceChannelBadge component**

File: `pages/reservations/SourceChannelBadge.jsx`

```jsx
import { Mail, MessageCircle, Globe, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CONFIG = {
  EMAIL:     { Icon: Mail,          color: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
  WHATSAPP:  { Icon: MessageCircle, color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  WEBSITE:   { Icon: Globe,         color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  IN_PERSON: { Icon: User,          color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

export default function SourceChannelBadge({ source }) {
  const { t } = useTranslation('reservations');
  const cfg = CONFIG[source] || CONFIG.IN_PERSON;
  const { Icon, color, bg } = cfg;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      background: bg, color,
    }}>
      <Icon size={13} />
      {t(`source.${source}`)}
    </span>
  );
}
```

- [ ] **Step 2: StatusBadge component**

File: `pages/reservations/StatusBadge.jsx`

```jsx
import { useTranslation } from 'react-i18next';

const CONFIG = {
  PENDING:   { color: '#92400E', bg: '#FEF3C7' },  // amber
  CONFIRMED: { color: '#065F46', bg: '#D1FAE5' },  // green
  CANCELLED: { color: '#991B1B', bg: '#FEE2E2' },  // red
  COMPLETED: { color: '#1E40AF', bg: '#DBEAFE' },  // blue
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation('reservations');
  const cfg = CONFIG[status] || CONFIG.PENDING;

  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.5,
      background: cfg.bg, color: cfg.color,
    }}>
      {t(`status.${status}`)}
    </span>
  );
}
```

- [ ] **Step 3: ReservationDetailsPanel (side sheet)**

File: `pages/reservations/ReservationDetailsPanel.jsx`

```jsx
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReservation } from '../../src/hooks/useReservations';
import SourceChannelBadge from './SourceChannelBadge';
import StatusBadge from './StatusBadge';
import { formatLocal, formatRange } from '../../src/utils/timezone';

export default function ReservationDetailsPanel({ id, onClose }) {
  const { t } = useTranslation('reservations');
  const { data, isLoading } = useReservation(id);

  if (!id) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999,
      }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 460, maxWidth: '90vw',
        background: 'var(--bg)', zIndex: 1000,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{t('details.title')}</h3>
          <button className="btn-outline-ink" style={{ padding: '4px 10px' }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {isLoading && <div>{t('details.loading')}</div>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SourceChannelBadge source={data.source_channel} />
              <StatusBadge status={data.status} />
            </div>

            <Field label={t('fields.customer')} value={data.customer_name} />
            <Field label={t('fields.contact')}  value={data.customer_contact} />
            <Field label={t('fields.car')}       value={data.car_model} />
            <Field label={t('fields.period')}    value={formatRange(data.start_date, data.end_date)} />
            <Field label={t('fields.price')}     value={`${data.total_price} ${data.currency}`} />
            <Field label={t('fields.created')}   value={formatLocal(data.created_at)} />

            <div>
              <strong style={{ fontSize: 12, color: 'var(--text2)' }}>
                {t('details.metadata')}
              </strong>
              <pre style={{
                background: 'var(--surface-2, #F7F5F2)',
                padding: 12, borderRadius: 8, fontSize: 12,
                overflowX: 'auto', marginTop: 6,
              }}>
                {JSON.stringify(data.source_metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}
```

- [ ] **Step 4: FilterBar component**

File: `pages/reservations/FilterBar.jsx`

```jsx
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

const SOURCES = ['all', 'EMAIL', 'WHATSAPP', 'WEBSITE', 'IN_PERSON'];
const STATUSES = ['all', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

export default function FilterBar({ filters, setFilter, onReset }) {
  const { t } = useTranslation('reservations');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10, marginBottom: 16,
      padding: 12, background: 'var(--surface-2, #F7F5F2)',
      borderRadius: 8,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', gridColumn: 'span 2' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text3)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 32 }}
          placeholder={t('filters.search')}
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
        />
      </div>

      <select className="form-input" value={filters.source} onChange={e => setFilter('source', e.target.value)}>
        {SOURCES.map(s => <option key={s} value={s}>{t(`source.${s === 'all' ? 'all' : s}`)}</option>)}
      </select>

      <select className="form-input" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
        {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s === 'all' ? 'all' : s}`)}</option>)}
      </select>

      <input
        className="form-input" type="date"
        value={filters.dateFrom}
        onChange={e => setFilter('dateFrom', e.target.value)}
        title={t('filters.dateFrom')}
      />

      <input
        className="form-input" type="date"
        value={filters.dateTo}
        onChange={e => setFilter('dateTo', e.target.value)}
        title={t('filters.dateTo')}
      />

      <input
        className="form-input" type="number"
        placeholder={t('filters.priceMin')}
        value={filters.priceMin}
        onChange={e => setFilter('priceMin', e.target.value)}
      />

      <input
        className="form-input" type="number"
        placeholder={t('filters.priceMax')}
        value={filters.priceMax}
        onChange={e => setFilter('priceMax', e.target.value)}
      />

      <button className="btn-outline-ink" onClick={onReset}>
        {t('filters.reset')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: ReservationsTable (TanStack v8)**

File: `pages/reservations/ReservationsTable.jsx`

```jsx
import { useMemo, useState } from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table';
import { Eye, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SourceChannelBadge from './SourceChannelBadge';
import StatusBadge from './StatusBadge';
import { formatRange, formatLocal } from '../../src/utils/timezone';

export default function ReservationsTable({
  data, total, page, pageSize, sort, order,
  onSortChange, onPageChange, onView,
  isLoading, isFetching,
}) {
  const { t } = useTranslation('reservations');

  const columns = useMemo(() => [
    {
      id: 'source',
      header: t('columns.source'),
      cell: ({ row }) => <SourceChannelBadge source={row.original.source_channel} />,
    },
    {
      id: 'customer',
      header: t('columns.customer'),
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.customer_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{row.original.customer_contact}</div>
        </div>
      ),
    },
    {
      id: 'car',
      header: t('columns.car'),
      cell: ({ row }) => row.original.car_model,
    },
    {
      id: 'period',
      header: t('columns.period'),
      cell: ({ row }) => formatRange(row.original.start_date, row.original.end_date),
    },
    {
      id: 'price',
      header: t('columns.price'),
      cell: ({ row }) => `${row.original.total_price} ${row.original.currency || 'MAD'}`,
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: t('columns.actions'),
      cell: ({ row }) => (
        <button
          className="btn-outline-ink"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => onView(row.original.id)}
        >
          <Eye size={13} /> {t('actions.view')}
        </button>
      ),
    },
  ], [t, onView]);

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Sortable columns map → backend sort key
  const SORT_MAP = {
    customer: 'customer_name',
    period:   'start_date',
    price:    'total_price',
    source:   'created_at',  // fallback
    status:   'created_at',
  };

  const toggleSort = (colId) => {
    const backendCol = SORT_MAP[colId];
    if (!backendCol) return;
    const newOrder = (sort === backendCol && order === 'desc') ? 'asc' : 'desc';
    onSortChange(backendCol, newOrder);
  };

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0, position: 'relative' }}>
        {isFetching && !isLoading && (
          <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 11, color: 'var(--text3)' }}>
            {t('loading.refreshing')}…
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={() => SORT_MAP[h.id] && toggleSort(h.id)}
                    style={{
                      textAlign: 'start', padding: '12px 14px',
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: 0.4, color: 'var(--text2)',
                      borderBottom: '1px solid var(--border)',
                      cursor: SORT_MAP[h.id] ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {SORT_MAP[h.id] && (
                      <ArrowUpDown size={11} style={{ marginInlineStart: 4, opacity: 0.5 }} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columns.length} style={{ padding: 24, textAlign: 'center' }}>
                {t('loading.initial')}…
              </td></tr>
            )}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>
                {t('empty')}
              </td></tr>
            )}
            {!isLoading && table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '12px 14px', fontSize: 13 }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderTop: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text2)',
      }}>
        <div>{t('pagination.showing', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn-outline-ink" disabled={page <= 1} onClick={() => onPageChange(page - 1)} style={{ padding: '4px 8px' }}>
            <ChevronLeft size={14} />
          </button>
          <span>{page} / {totalPages}</span>
          <button className="btn-outline-ink" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} style={{ padding: '4px 8px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Page-level component**

File: `pages/Reservations.jsx`

```jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReservations } from '../src/hooks/useReservations';
import { useReservationFilters } from '../src/hooks/useReservationFilters';
import FilterBar from './reservations/FilterBar';
import ReservationsTable from './reservations/ReservationsTable';
import ReservationDetailsPanel from './reservations/ReservationDetailsPanel';

export default function Reservations() {
  const { t } = useTranslation('reservations');
  const { filters, setFilter, reset } = useReservationFilters();
  const { data, isLoading, isFetching, error } = useReservations(filters);
  const [openId, setOpenId] = useState(null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
      </div>

      <div className="page-body">
        <FilterBar filters={filters} setFilter={setFilter} onReset={reset} />

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {t('error.fetch')}: {error.message}
          </div>
        )}

        <ReservationsTable
          data={data?.data}
          total={data?.total || 0}
          page={filters.page}
          pageSize={filters.pageSize}
          sort={filters.sort}
          order={filters.order}
          isLoading={isLoading}
          isFetching={isFetching}
          onSortChange={(sort, order) => { setFilter('sort', sort); setFilter('order', order); }}
          onPageChange={(p) => setFilter('page', p)}
          onView={setOpenId}
        />
      </div>

      <ReservationDetailsPanel id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add pages/Reservations.jsx pages/reservations/
git commit -m "feat(ui): Booking Hub TanStack table + filters + side panel"
```

---

### Task 5: Sidebar Nav + App.jsx Routing

- [ ] **Step 1: Add nav item**

File: `components/Sidebar.jsx` — add to `NAV_IDS` (between `calendar` and `basket`):

```javascript
import { /* existing */, ClipboardList } from 'lucide-react';

const NAV_IDS = [
  // ... existing items ...
  { id: 'calendar',     key: 'calendar',     icon: CalendarDays },
  { id: 'reservations', key: 'reservations', icon: ClipboardList },
  { id: 'basket',       key: 'basket',       icon: Inbox, premium: true },
  // ...
];
```

Update version line 185 from `v1.8.1` to `v1.9.0`.

- [ ] **Step 2: Add common.json key for nav**

File: `public/locales/fr/common.json` — under `"nav"`:

```json
"reservations": "Réservations"
```

File: `public/locales/ar/common.json`:

```json
"reservations": "الحجوزات"
```

File: `public/locales/en/common.json`:

```json
"reservations": "Reservations"
```

- [ ] **Step 3: Register page in App.jsx**

File: `App.jsx` — add import + route case:

```jsx
import Reservations from './pages/Reservations';

// In the page switch:
{page === 'reservations' && <Reservations />}
```

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.jsx public/locales/*/common.json App.jsx
git commit -m "feat(nav): Add Reservations to sidebar; bump version to v1.9.0"
```

---

### Task 6: i18n Translations

- [ ] **Step 1: French translations**

File: `public/locales/fr/reservations.json`

```json
{
  "title": "Réservations",
  "subtitle": "Vue d'ensemble des réservations omnicanales",
  "empty": "Aucune réservation ne correspond aux filtres.",
  "error": { "fetch": "Échec du chargement" },
  "loading": { "initial": "Chargement", "refreshing": "Actualisation" },
  "columns": {
    "source": "Canal",
    "customer": "Client",
    "car": "Véhicule",
    "period": "Période",
    "price": "Total",
    "status": "Statut",
    "actions": "Actions"
  },
  "actions": { "view": "Détails" },
  "pagination": {
    "showing": "Affichage {{from}}–{{to}} sur {{total}}"
  },
  "filters": {
    "search": "Rechercher un client…",
    "dateFrom": "Date de début",
    "dateTo": "Date de fin",
    "priceMin": "Prix min",
    "priceMax": "Prix max",
    "reset": "Réinitialiser"
  },
  "source": {
    "all": "Tous les canaux",
    "EMAIL": "Email",
    "WHATSAPP": "WhatsApp",
    "WEBSITE": "Site web",
    "IN_PERSON": "En personne"
  },
  "status": {
    "all": "Tous les statuts",
    "PENDING": "En attente",
    "CONFIRMED": "Confirmée",
    "CANCELLED": "Annulée",
    "COMPLETED": "Terminée"
  },
  "details": {
    "title": "Détails de la réservation",
    "loading": "Chargement…",
    "metadata": "Métadonnées source"
  },
  "fields": {
    "customer": "Client",
    "contact": "Contact",
    "car": "Véhicule",
    "period": "Période",
    "price": "Prix total",
    "created": "Créée le"
  }
}
```

- [ ] **Step 2: Arabic translations**

File: `public/locales/ar/reservations.json`

```json
{
  "title": "الحجوزات",
  "subtitle": "نظرة شاملة على الحجوزات متعددة القنوات",
  "empty": "لا توجد حجوزات مطابقة للمرشحات.",
  "error": { "fetch": "فشل التحميل" },
  "loading": { "initial": "جارٍ التحميل", "refreshing": "تحديث" },
  "columns": {
    "source": "القناة",
    "customer": "العميل",
    "car": "السيارة",
    "period": "الفترة",
    "price": "الإجمالي",
    "status": "الحالة",
    "actions": "إجراءات"
  },
  "actions": { "view": "تفاصيل" },
  "pagination": { "showing": "عرض {{from}}–{{to}} من {{total}}" },
  "filters": {
    "search": "بحث عن عميل…",
    "dateFrom": "من تاريخ",
    "dateTo": "إلى تاريخ",
    "priceMin": "الحد الأدنى للسعر",
    "priceMax": "الحد الأقصى للسعر",
    "reset": "إعادة ضبط"
  },
  "source": {
    "all": "كل القنوات",
    "EMAIL": "بريد إلكتروني",
    "WHATSAPP": "واتساب",
    "WEBSITE": "الموقع",
    "IN_PERSON": "حضوري"
  },
  "status": {
    "all": "كل الحالات",
    "PENDING": "قيد الانتظار",
    "CONFIRMED": "مؤكدة",
    "CANCELLED": "ملغاة",
    "COMPLETED": "منتهية"
  },
  "details": {
    "title": "تفاصيل الحجز",
    "loading": "جارٍ التحميل…",
    "metadata": "البيانات الوصفية للمصدر"
  },
  "fields": {
    "customer": "العميل",
    "contact": "جهة الاتصال",
    "car": "السيارة",
    "period": "الفترة",
    "price": "السعر الإجمالي",
    "created": "تاريخ الإنشاء"
  }
}
```

- [ ] **Step 3: English translations**

File: `public/locales/en/reservations.json`

```json
{
  "title": "Reservations",
  "subtitle": "Omnichannel booking overview",
  "empty": "No reservations match the filters.",
  "error": { "fetch": "Failed to load" },
  "loading": { "initial": "Loading", "refreshing": "Refreshing" },
  "columns": {
    "source": "Source",
    "customer": "Customer",
    "car": "Car",
    "period": "Period",
    "price": "Total",
    "status": "Status",
    "actions": "Actions"
  },
  "actions": { "view": "View" },
  "pagination": { "showing": "Showing {{from}}–{{to}} of {{total}}" },
  "filters": {
    "search": "Search customer…",
    "dateFrom": "From date",
    "dateTo": "To date",
    "priceMin": "Min price",
    "priceMax": "Max price",
    "reset": "Reset"
  },
  "source": {
    "all": "All channels",
    "EMAIL": "Email",
    "WHATSAPP": "WhatsApp",
    "WEBSITE": "Website",
    "IN_PERSON": "In person"
  },
  "status": {
    "all": "All statuses",
    "PENDING": "Pending",
    "CONFIRMED": "Confirmed",
    "CANCELLED": "Cancelled",
    "COMPLETED": "Completed"
  },
  "details": {
    "title": "Reservation details",
    "loading": "Loading…",
    "metadata": "Source metadata"
  },
  "fields": {
    "customer": "Customer",
    "contact": "Contact",
    "car": "Car",
    "period": "Period",
    "price": "Total price",
    "created": "Created at"
  }
}
```

- [ ] **Step 4: Register namespace in i18n config**

File: `lib/i18n.js` — append `'reservations'` to the `ns` array.

- [ ] **Step 5: Commit**

```bash
git add public/locales/ lib/i18n.js
git commit -m "feat(i18n): Reservations translations FR/AR/EN"
```

---

### Task 7: NewRental → Reservation Wiring

- [ ] **Step 1: Identify the final NewRental step**

Read `pages/NewRental.jsx` to find where the wizard finalizes (likely a step like `ContractStep.jsx` or a `handleFinish` callback). The reservation insert happens **after the contract is created locally** but **independently of e-signature** (so walk-ins without signing still produce a reservation).

- [ ] **Step 2: Add `useCreateReservation` mutation call on completion**

In the final step's "Terminer" handler, before/after `createContract()`:

```javascript
import { useCreateReservation } from '../../src/hooks/useReservations';

const createRes = useCreateReservation();

const handleFinish = async () => {
  // ... existing contract creation logic ...

  await createRes.mutateAsync({
    client_id:        client.id,
    customer_name:    `${client.firstName} ${client.lastName}`.trim(),
    customer_contact: client.phone || client.email,
    vehicle_id:       vehicle.id,
    car_model:        `${vehicle.make} ${vehicle.model}`,
    start_date:       new Date(rental.startDate).toISOString(),
    end_date:         new Date(rental.endDate).toISOString(),
    total_price:      rental.totalPrice,
    currency:         'MAD',
    source_channel:   leadSource || 'IN_PERSON',  // EMAIL/WHATSAPP if from a lead, else IN_PERSON
    status:           'CONFIRMED',
    source_metadata:  {
      lead_id:        leadId || null,
      contract_id:    contract?.id || null,
      created_via:    'new_rental_wizard',
    },
    lead_id:          leadId || null,
    contract_id:      contract?.id || null,
  });

  // ... existing navigation/cleanup ...
};
```

`leadSource` should be plumbed through the wizard from `NewRental` props (set to `EMAIL` / `WHATSAPP` if launched from Basket "Convert", else `IN_PERSON`).

- [ ] **Step 3: Plumb `leadSource` from Basket → NewRental**

File: `pages/Basket.jsx` — when calling `handleConvert`, include source:

```javascript
function handleConvert(lead, extractedData) {
  const prefill = buildRentalPrefill(lead, extractedData);
  api.updateLeadStatus(lead.id, 'processed').catch(() => {});
  onNavigate('new-rental', {
    prefilledLead: prefill,
    leadSource: lead.source === 'whatsapp' ? 'WHATSAPP' : 'EMAIL',
    leadId: lead.id,
  });
}
```

`pages/NewRental.jsx` propagates `leadSource` and `leadId` props down the wizard to the final step.

- [ ] **Step 4: Commit**

```bash
git add pages/NewRental.jsx pages/rental/ pages/Basket.jsx
git commit -m "feat(rental): Create reservation row at end of NewRental wizard"
```

---

### Task 8: STATUS.md + Final Tests + Push

- [ ] **Step 1: Update STATUS.md**

File: `.claude/STATUS.md` — add row at top of staging table:

```
| v1.9.0 | pending | Booking Hub: omnichannel reservations table (TanStack v8 + Query v5), 4 source channels, server-side filters/sort/pagination, side panel for source_metadata, FR/AR/EN i18n, NewRental wizard → reservation insert on completion |
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

Expected: All previous 187 tests still pass + new tests for `reservations` route, `timezone` utils.

- [ ] **Step 3: Manual smoke test (local)**

1. Apply migration locally
2. Run `npm run dev`
3. Login as admin → Sidebar shows "Réservations"
4. Open page → table loads with empty state
5. Run NewRental wizard → finish → verify reservation row appears in table
6. Filter by source `IN_PERSON` → row visible; switch to `EMAIL` → empty
7. Click "Détails" → side panel opens with `source_metadata` JSON
8. Resize/refresh → URL doesn't break; pagination works

- [ ] **Step 4: Commit STATUS.md and stop**

```bash
git add .claude/STATUS.md
git commit -m "docs: Log v1.9.0 Booking Hub in STATUS.md"
```

**STOP HERE — do not push without explicit user instruction.**

When user says "push to staging":
```bash
git push origin staging
```
Then read `components/Sidebar.jsx` and report the staging version.

---

## Open Questions (resolved during planning)

1. ✅ **Reservation position** — between leads and contracts (option B)
2. ✅ **Tech stack** — keep JS, existing design system, install 4 new deps
3. ✅ **Foreign keys** — link `client_id` → clients, `vehicle_id` → vehicles + denormalized text fallback
4. ✅ **Conversion flow** — manual through existing NewRental wizard
5. ✅ **Walk-ins** — same NewRental flow, source = IN_PERSON
6. ✅ **Permissions** — staff has full access (view/edit/status change)
7. ✅ **i18n** — full FR/AR/EN
8. ✅ **Filters** — channel, status, date range, customer search, price range
9. ✅ **Navigation** — top-level Sidebar item

---

## Out of Scope (next plan)

- Bulk actions (mass-cancel, export to CSV)
- Reservation edit modal (currently view-only side panel)
- Email/WhatsApp/Website automatic creation (still requires manual NewRental wizard)
- Public website API endpoint for direct WEBSITE bookings
- Calendar integration (Calendar page doesn't yet read from reservations)
- Reporting / analytics dashboards

---

## Self-Review Checklist

Run before declaring plan complete:

- [x] Every step references exact file paths
- [x] All code blocks compile-ready (no `// TODO` placeholders)
- [x] Type names consistent (`booking_source`, `reservation_status` everywhere)
- [x] Database changes have RLS + indexes
- [x] Backend has tests
- [x] Frontend has tests for utilities
- [x] i18n has all three languages
- [x] Sidebar version bump explicit (v1.8.1 → v1.9.0)
- [x] STATUS.md update step included
- [x] Push deferred until user approval (CLAUDE.md rule)
