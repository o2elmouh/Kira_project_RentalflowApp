# Smart Quote Acceptance Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CNDP loi 09-08 disclosure and link to outbound offer messages, fix the "yes" reply so leads transition to `accepted`, send an auto-acknowledgment with missing-doc CTA, and route follow-up photos into the existing lead via the OCR pipeline.

**Architecture:** Pure-function message builders in `server/lib/offerMessage.js` separated from delivery; intent-aware branching consolidated into a single `handleOfferResponse` in `server/routes/leads.js`; widened lookup (`findActiveLeadByPhone`) matches `offer_sent` or `accepted` so inbound photos merge non-destructively into the existing lead; new public Confidentialite page rendered by App.jsx router.

**Tech Stack:** Node/Express (Railway), Supabase (`supabaseAdmin`), Vitest (tests), React 18 + react-i18next, Anthropic Claude Haiku 4.5, Baileys (WhatsApp).

**Spec:** `docs/superpowers/specs/2026-05-22-smart-quote-acceptance-flow-design.md`

---

## File Map

### Create
- `supabase/migrations/20260522_lead_acceptance_timestamps.sql` — adds `accepted_at` + `docs_completed_at` columns
- `server/lib/offerMessage.js` — pure `buildOfferMessage` + `buildAcknowledgmentMessage` + `mergeExtractedData`
- `server/__tests__/offerMessage.test.js` — unit tests for the three pure helpers
- `pages/Confidentialite.jsx` — public CNDP page (no auth)
- `public/locales/fr/confidentialite.json` — French content (primary)
- `public/locales/ar/confidentialite.json` — Arabic content
- `public/locales/en/confidentialite.json` — English content

### Modify
- `App.jsx` — add `case 'confidentialite'` to router; allow unauthenticated access for this route
- `lib/i18n.js` — add `confidentialite` to `ns` array
- `components/SmartQuotePanel.jsx` — pre-fill `startDate` / `endDate` from `lead.extracted_data`
- `server/routes/whatsapp.js` — call `buildOfferMessage`; read `process.env.PUBLIC_APP_URL`
- `server/routes/leads.js` — rewrite `handleOfferResponse` (intent-aware); rename `findOfferSentLeadByPhone` → `findActiveLeadByPhone`; widen status filter; add image-merge branch; delete orphaned `handleQuoteReply`
- `server/lib/triage.js` — add `detectMissingDocs` export
- `server/__tests__/offerResponse.test.js` — update for new accepted/rejected/question branching
- `.env.example` — document `PUBLIC_APP_URL`
- `components/Sidebar.jsx` — bump version to `v1.12.1`

### Delete
- (None — `handleQuoteReply` function removed in-place from `leads.js`)

---

## Task 1: Database Migration for Acceptance Timestamps

**Files:**
- Create: `supabase/migrations/20260522_lead_acceptance_timestamps.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260522_lead_acceptance_timestamps.sql
-- Adds nullable timestamps that record when a lead was accepted by the client
-- and when all required documents (CIN + permis) were first captured.

ALTER TABLE public.pending_demands
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS docs_completed_at timestamptz NULL;

COMMENT ON COLUMN public.pending_demands.accepted_at
  IS 'Set when intent=accepted reply is received from the client.';

COMMENT ON COLUMN public.pending_demands.docs_completed_at
  IS 'Set once detectMissingDocs() first returns {}; gates the one-shot agency notif.';
```

- [ ] **Step 2: Apply the migration (Supabase CLI or dashboard)**

Run locally or via Supabase SQL Editor:
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260522_lead_acceptance_timestamps.sql
```
Expected: `ALTER TABLE` returned, no errors. Verify columns exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pending_demands' AND column_name IN ('accepted_at', 'docs_completed_at');
```
Expected: 2 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522_lead_acceptance_timestamps.sql
git commit -m "feat(db): add accepted_at and docs_completed_at to pending_demands"
```

---

## Task 2: Pure `buildOfferMessage` Builder

**Files:**
- Create: `server/lib/offerMessage.js`
- Create: `server/__tests__/offerMessage.test.js`

- [ ] **Step 1: Write failing tests for `buildOfferMessage`**

Add to `server/__tests__/offerMessage.test.js`:

```js
/**
 * Pure message builders — unit tests
 * @vitest-environment node
 */
import { test, expect, describe } from 'vitest'
import { buildOfferMessage } from '../lib/offerMessage.js'

describe('buildOfferMessage', () => {
  const base = {
    vehicleName: 'Dacia Logan',
    priceTotal: 1500,
    publicAppUrl: 'https://app.rentaflow.ma',
  }

  test('includes vehicle and price in opening line', () => {
    const msg = buildOfferMessage(base)
    expect(msg).toContain('Dacia Logan')
    expect(msg).toContain('1500 MAD')
  })

  test('includes dates when both startDate and endDate provided', () => {
    const msg = buildOfferMessage({ ...base, startDate: '2026-05-20', endDate: '2026-05-23' })
    expect(msg).toContain('📅 Du *2026-05-20* au *2026-05-23*')
  })

  test('omits dates line when startDate missing', () => {
    const msg = buildOfferMessage({ ...base, endDate: '2026-05-23' })
    expect(msg).not.toContain('📅')
  })

  test('omits dates line when endDate missing', () => {
    const msg = buildOfferMessage({ ...base, startDate: '2026-05-20' })
    expect(msg).not.toContain('📅')
  })

  test('appends notes when provided', () => {
    const msg = buildOfferMessage({ ...base, notes: 'Livraison gare ONCF' })
    expect(msg).toContain('Livraison gare ONCF')
  })

  test('always includes CNDP block with privacy URL', () => {
    const msg = buildOfferMessage(base)
    expect(msg).toContain('loi 09-08')
    expect(msg).toContain('https://app.rentaflow.ma/confidentialite')
  })

  test('respects custom publicAppUrl', () => {
    const msg = buildOfferMessage({ ...base, publicAppUrl: 'https://staging.rentaflow.ma' })
    expect(msg).toContain('https://staging.rentaflow.ma/confidentialite')
    expect(msg).not.toContain('app.rentaflow.ma/confidentialite')
  })

  test('ends with the Oui/Non prompt', () => {
    const msg = buildOfferMessage(base)
    expect(msg.trim().endsWith('Répondez *Oui* pour confirmer ou *Non* pour décliner.')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: All 8 tests FAIL with "Cannot find module '../lib/offerMessage.js'".

- [ ] **Step 3: Implement `buildOfferMessage`**

Create `server/lib/offerMessage.js`:

```js
/**
 * Pure builders for outbound WhatsApp messages in the offer/acceptance flow.
 * No side effects, no I/O, fully unit-testable.
 */

const DEFAULT_PUBLIC_APP_URL = 'https://app.rentaflow.ma'

/**
 * Build the offer message body sent when the agent dispatches a smart quote.
 * @param {object} args
 * @param {string} args.vehicleName       — "Dacia Logan", "Renault Clio", etc.
 * @param {number} args.priceTotal        — MAD, integer
 * @param {string} [args.startDate]       — ISO date (YYYY-MM-DD), optional
 * @param {string} [args.endDate]         — ISO date (YYYY-MM-DD), optional
 * @param {string} [args.notes]           — free-form agent notes, optional
 * @param {string} [args.publicAppUrl]    — base URL for the privacy page link
 * @returns {string} the message body
 */
export function buildOfferMessage({ vehicleName, priceTotal, startDate, endDate, notes, publicAppUrl } = {}) {
  const baseUrl = publicAppUrl || DEFAULT_PUBLIC_APP_URL
  const lines = []

  lines.push(`Bonjour ! 🚗 Suite à votre demande, nous vous proposons une *${vehicleName}* pour *${priceTotal} MAD* au total.`)

  if (startDate && endDate) {
    lines.push(`📅 Du *${startDate}* au *${endDate}*`)
  }

  if (notes) {
    lines.push('')
    lines.push(notes)
  }

  lines.push('')
  lines.push('🔒 Vos données sont protégées (loi 09-08).')
  lines.push(`En savoir plus : ${baseUrl}/confidentialite`)
  lines.push('')
  lines.push('Êtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.')

  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/offerMessage.js server/__tests__/offerMessage.test.js
git commit -m "feat(server): add pure buildOfferMessage with CNDP block"
```

---

## Task 3: Pure `buildAcknowledgmentMessage` Builder

**Files:**
- Modify: `server/lib/offerMessage.js`
- Modify: `server/__tests__/offerMessage.test.js`

- [ ] **Step 1: Write failing tests**

Append to `server/__tests__/offerMessage.test.js`:

```js
import { buildAcknowledgmentMessage } from '../lib/offerMessage.js'

describe('buildAcknowledgmentMessage', () => {
  test('both missing → asks for CIN and permis', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: true, needsPermis: true })
    expect(msg).toContain('Nous préparons votre contrat')
    expect(msg).toContain('Photo recto-verso de votre CIN')
    expect(msg).toContain('Photo de votre permis de conduire')
  })

  test('only CIN missing → asks for CIN only', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: true, needsPermis: false })
    expect(msg).toContain('Photo recto-verso de votre CIN')
    expect(msg).not.toContain('permis de conduire')
  })

  test('only permis missing → asks for permis only', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: false, needsPermis: true })
    expect(msg).toContain('Photo de votre permis de conduire')
    expect(msg).not.toContain('CIN')
  })

  test('nothing missing → no CTA, only confirmation', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: false, needsPermis: false })
    expect(msg).toContain('Nous avons tous vos documents')
    expect(msg).not.toContain('CIN')
    expect(msg).not.toContain('permis')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: 4 new tests FAIL ("buildAcknowledgmentMessage is not a function"); previous 8 still PASS.

- [ ] **Step 3: Implement `buildAcknowledgmentMessage`**

Append to `server/lib/offerMessage.js`:

```js
/**
 * Build the auto-acknowledgment message sent after the client accepts the offer.
 * @param {object} args
 * @param {boolean} args.needsCIN     — true when CIN photo not yet captured
 * @param {boolean} args.needsPermis  — true when permis photo not yet captured
 * @returns {string} the message body
 */
export function buildAcknowledgmentMessage({ needsCIN, needsPermis } = {}) {
  if (!needsCIN && !needsPermis) {
    return [
      'Parfait ! ✅ Nous avons tous vos documents.',
      'Nous préparons votre contrat et revenons vers vous dans quelques minutes.',
    ].join('\n')
  }

  const lines = []
  lines.push('Parfait ! ✅ Nous préparons votre contrat.')
  lines.push('')
  lines.push('Pour finaliser, merci de nous envoyer :')
  if (needsCIN)    lines.push('📄 Photo recto-verso de votre CIN')
  if (needsPermis) lines.push('🚗 Photo de votre permis de conduire')
  lines.push('')
  lines.push('Nous vous recontactons dès réception.')
  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: 12 PASS (8 + 4).

- [ ] **Step 5: Commit**

```bash
git add server/lib/offerMessage.js server/__tests__/offerMessage.test.js
git commit -m "feat(server): add buildAcknowledgmentMessage with missing-docs CTA"
```

---

## Task 4: `detectMissingDocs` Helper

**Files:**
- Modify: `server/lib/triage.js`
- Create: `server/__tests__/detectMissingDocs.test.js`

- [ ] **Step 1: Write failing tests**

Create `server/__tests__/detectMissingDocs.test.js`:

```js
/**
 * detectMissingDocs — unit tests
 * @vitest-environment node
 */
import { test, expect, describe } from 'vitest'
import { detectMissingDocs } from '../lib/triage.js'

describe('detectMissingDocs', () => {
  test('empty extracted_data → both missing', () => {
    expect(detectMissingDocs({})).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('null/undefined → both missing', () => {
    expect(detectMissingDocs(null)).toEqual({ needsCIN: true, needsPermis: true })
    expect(detectMissingDocs(undefined)).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('cin field present → CIN not missing', () => {
    expect(detectMissingDocs({ cin: 'AB123456' })).toEqual({ needsCIN: false, needsPermis: true })
  })

  test('documentType=cin with documentNumber → CIN not missing', () => {
    expect(detectMissingDocs({ documentType: 'cin', documentNumber: 'AB123456' }))
      .toEqual({ needsCIN: false, needsPermis: true })
  })

  test('documentType=cin without documentNumber → still missing', () => {
    expect(detectMissingDocs({ documentType: 'cin' })).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('permis present → permis not missing', () => {
    expect(detectMissingDocs({ permis: 'P-987654' })).toEqual({ needsCIN: true, needsPermis: false })
  })

  test('both present → nothing missing', () => {
    expect(detectMissingDocs({ cin: 'AB123456', permis: 'P-987654' }))
      .toEqual({ needsCIN: false, needsPermis: false })
  })

  test('empty-string values count as missing', () => {
    expect(detectMissingDocs({ cin: '', permis: '' })).toEqual({ needsCIN: true, needsPermis: true })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run server/__tests__/detectMissingDocs.test.js`
Expected: all FAIL ("detectMissingDocs is not exported").

- [ ] **Step 3: Add the helper to `server/lib/triage.js`**

Append at the end of `server/lib/triage.js`:

```js
// ── detectMissingDocs ───────────────────────────────────────
/**
 * Inspect a lead's extracted_data to determine which of the two
 * Moroccan rental documents (CIN, permis) have not yet been captured.
 *
 * @param {object|null|undefined} extractedData
 * @returns {{ needsCIN: boolean, needsPermis: boolean }}
 */
export function detectMissingDocs(extractedData) {
  const ex = extractedData || {}
  const hasCIN = Boolean(
    ex.cin ||
    (ex.documentType === 'cin' && ex.documentNumber)
  )
  const hasPermis = Boolean(ex.permis)
  return { needsCIN: !hasCIN, needsPermis: !hasPermis }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/detectMissingDocs.test.js`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/triage.js server/__tests__/detectMissingDocs.test.js
git commit -m "feat(server): add detectMissingDocs helper to triage"
```

---

## Task 5: `mergeExtractedData` Non-Destructive Merge

**Files:**
- Modify: `server/lib/offerMessage.js`
- Modify: `server/__tests__/offerMessage.test.js`

- [ ] **Step 1: Write failing tests**

Append to `server/__tests__/offerMessage.test.js`:

```js
import { mergeExtractedData } from '../lib/offerMessage.js'

describe('mergeExtractedData', () => {
  test('returns new object — does not mutate input', () => {
    const existing = { cin: '' }
    const result = mergeExtractedData(existing, { cin: 'AB123' })
    expect(existing.cin).toBe('')
    expect(result.cin).toBe('AB123')
  })

  test('fills empty fields from incoming', () => {
    const result = mergeExtractedData(
      { cin: '', permis: '' },
      { cin: 'AB123', permis: 'P-987' }
    )
    expect(result).toMatchObject({ cin: 'AB123', permis: 'P-987' })
  })

  test('does NOT overwrite existing non-empty field when no confidence info', () => {
    const result = mergeExtractedData(
      { cin: 'OLD-VALUE' },
      { cin: 'NEW-VALUE' }
    )
    expect(result.cin).toBe('OLD-VALUE')
  })

  test('overwrites when incoming confidence is strictly higher', () => {
    const result = mergeExtractedData(
      { cin: 'OLD', confidenceScores: { cin: 0.5 } },
      { cin: 'NEW', confidenceScores: { cin: 0.9 } }
    )
    expect(result.cin).toBe('NEW')
    expect(result.confidenceScores.cin).toBe(0.9)
  })

  test('does NOT overwrite when incoming confidence equal or lower', () => {
    const result = mergeExtractedData(
      { cin: 'OLD', confidenceScores: { cin: 0.9 } },
      { cin: 'NEW', confidenceScores: { cin: 0.5 } }
    )
    expect(result.cin).toBe('OLD')
    expect(result.confidenceScores.cin).toBe(0.9)
  })

  test('ignores empty incoming values', () => {
    const result = mergeExtractedData({ cin: 'KEEP' }, { cin: '', permis: '' })
    expect(result.cin).toBe('KEEP')
    expect(result.permis).toBeUndefined()
  })

  test('preserves unrelated existing fields', () => {
    const result = mergeExtractedData(
      { firstName: 'Ahmed', cin: '' },
      { cin: 'AB123' }
    )
    expect(result.firstName).toBe('Ahmed')
    expect(result.cin).toBe('AB123')
  })

  test('handles null existing', () => {
    const result = mergeExtractedData(null, { cin: 'AB123' })
    expect(result).toEqual({ cin: 'AB123' })
  })

  test('handles null incoming', () => {
    const result = mergeExtractedData({ cin: 'AB123' }, null)
    expect(result).toEqual({ cin: 'AB123' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: 9 new tests FAIL.

- [ ] **Step 3: Implement `mergeExtractedData`**

Append to `server/lib/offerMessage.js`:

```js
/**
 * Non-destructive merge of OCR / classification output into an existing
 * extracted_data object. Rules:
 *  - Empty incoming values are ignored.
 *  - Existing non-empty values are preserved UNLESS the incoming value
 *    carries a strictly-higher confidenceScores[field] than the existing.
 *  - Unrelated existing fields are preserved.
 *  - Returns a new object (input is not mutated).
 *
 * @param {object|null} existing
 * @param {object|null} incoming
 * @returns {object}
 */
export function mergeExtractedData(existing, incoming) {
  const out = { ...(existing || {}) }
  if (!incoming) return out

  const existingConf = (existing && existing.confidenceScores) || {}
  const incomingConf = incoming.confidenceScores || {}
  const mergedConf = { ...existingConf }

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'confidenceScores') continue
    if (value === null || value === undefined || value === '') continue

    const existingValue = out[key]
    const isExistingEmpty = existingValue === null || existingValue === undefined || existingValue === ''

    if (isExistingEmpty) {
      out[key] = value
      if (incomingConf[key] !== undefined) mergedConf[key] = incomingConf[key]
    } else if (incomingConf[key] !== undefined && existingConf[key] !== undefined && incomingConf[key] > existingConf[key]) {
      out[key] = value
      mergedConf[key] = incomingConf[key]
    }
  }

  if (Object.keys(mergedConf).length > 0) out.confidenceScores = mergedConf
  return out
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run server/__tests__/offerMessage.test.js`
Expected: 21 PASS (12 + 9).

- [ ] **Step 5: Commit**

```bash
git add server/lib/offerMessage.js server/__tests__/offerMessage.test.js
git commit -m "feat(server): add non-destructive mergeExtractedData"
```

---

## Task 6: Wire `buildOfferMessage` into `/whatsapp/send-offer`

**Files:**
- Modify: `server/routes/whatsapp.js`
- Modify: `.env.example`

- [ ] **Step 1: Replace inline message construction with the builder**

In `server/routes/whatsapp.js`, locate the existing `body` construction block (around lines 150-154) and replace it. Before:

```js
let body = `Bonjour ! 🚗 Suite à votre demande, nous vous proposons une *${vehicleName}* pour *${priceTotal} MAD* au total.`
if (startDate && endDate) body += `\n📅 Du *${startDate}* au *${endDate}*`
if (notes) body += `\n\n${notes}`
body += `\n\nÊtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.`
```

After:

```js
const body = buildOfferMessage({
  vehicleName,
  priceTotal,
  startDate,
  endDate,
  notes,
  publicAppUrl: process.env.PUBLIC_APP_URL,
})
```

Add the import at the top of the file (after the existing imports):

```js
import { buildOfferMessage } from '../lib/offerMessage.js'
```

- [ ] **Step 2: Add `PUBLIC_APP_URL` to `.env.example`**

Append to `.env.example`:

```
# Base URL used in outbound WhatsApp links (e.g. CNDP privacy page).
# Defaults to https://app.rentaflow.ma when unset.
PUBLIC_APP_URL=https://app.rentaflow.ma
```

- [ ] **Step 3: Run existing tests to ensure nothing broke**

Run: `npm run test`
Expected: all suites PASS (existing offer + Baileys tests should still work — the body is now built differently but `sendWhatsAppMessage(phone, body, agencyId)` is unchanged).

- [ ] **Step 4: Commit**

```bash
git add server/routes/whatsapp.js .env.example
git commit -m "feat(whatsapp): use buildOfferMessage in send-offer route"
```

---

## Task 7: SmartQuotePanel — Pre-fill Dates from `extracted_data`

**Files:**
- Modify: `components/SmartQuotePanel.jsx`

- [ ] **Step 1: Initialize date state from extracted_data**

In `components/SmartQuotePanel.jsx`, change the two date `useState` initializers (lines 9-10).

Before:
```js
const [startDate, setStartDate] = useState('')
const [endDate, setEndDate]     = useState('')
```

After:
```js
const ex = lead?.extracted_data || {}
const [startDate, setStartDate] = useState(ex.start_date || '')
const [endDate, setEndDate]     = useState(ex.end_date || '')
```

(Place the `const ex = ...` line just above the date hooks.)

- [ ] **Step 2: Manual smoke test**

Start dev server: `npm run dev`. Open Basket → click a lead whose `extracted_data` contains `start_date` and `end_date` (e.g. one that came in via the routing prompt). Open the SmartQuotePanel — the date inputs should be pre-filled. Agent can still override.

- [ ] **Step 3: Commit**

```bash
git add components/SmartQuotePanel.jsx
git commit -m "feat(smart-quote): pre-fill dates from extracted_data"
```

---

## Task 8: Rename `findOfferSentLeadByPhone` → `findActiveLeadByPhone`

**Files:**
- Modify: `server/routes/leads.js`

- [ ] **Step 1: Rename function and widen status filter**

In `server/routes/leads.js`, locate `findOfferSentLeadByPhone` (around line 548). Before:

```js
async function findOfferSentLeadByPhone(agencyId, senderJid) {
  try {
    const digits9 = (senderJid || '').replace(/\D/g, '').slice(-9)
    if (!digits9) return null
    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id, raw_payload, extracted_data')
      .eq('agency_id', agencyId)
      .eq('status', 'offer_sent')
      .order('created_at', { ascending: false })
      .limit(20)
    return (leads || []).find(l =>
      (l.sender_id || '').replace(/\D/g, '').slice(-9) === digits9
    ) || null
  } catch (err) {
    console.error('[leads/findOfferSentLeadByPhone] error:', err.message)
    return null
  }
}
```

After:

```js
async function findActiveLeadByPhone(agencyId, senderJid) {
  try {
    const digits9 = (senderJid || '').replace(/\D/g, '').slice(-9)
    if (!digits9) return null
    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id, status, raw_payload, extracted_data, docs_completed_at, media_urls')
      .eq('agency_id', agencyId)
      .in('status', ['offer_sent', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(20)
    return (leads || []).find(l =>
      (l.sender_id || '').replace(/\D/g, '').slice(-9) === digits9
    ) || null
  } catch (err) {
    console.error('[leads/findActiveLeadByPhone] error:', err.message)
    return null
  }
}
```

- [ ] **Step 2: Update the call site in `handleInboundWhatsApp`**

Search for `findOfferSentLeadByPhone(` in `server/routes/leads.js`. Replace each call with `findActiveLeadByPhone(`. The single existing call at the top of `handleInboundWhatsApp` becomes:

```js
const activeLead = await findActiveLeadByPhone(agencyId, senderJid)
```

(Rename the local variable from `offerLead` to `activeLead` for clarity throughout the block.)

- [ ] **Step 3: Run existing tests**

Run: `npm run test`
Expected: tests pass; offer-response tests still hit the same code path because the lead in those fixtures is `offer_sent`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.js
git commit -m "ref(leads): rename findOfferSentLeadByPhone to findActiveLeadByPhone, widen status filter"
```

---

## Task 9: Rewrite `handleOfferResponse` with Intent Branching

**Files:**
- Modify: `server/routes/leads.js`
- Modify: `server/__tests__/offerResponse.test.js`

- [ ] **Step 1: Update tests to assert per-intent status transitions**

Open `server/__tests__/offerResponse.test.js`. Add three new tests (preserving existing structure for mocks). Insert after the existing test cases:

```js
import { sendToAgency } from '../lib/notifyAgency.js'
vi.mock('../lib/notifyAgency.js', () => ({
  sendToAgency: vi.fn().mockResolvedValue(undefined),
}))

import { sendWhatsAppMessage } from '../lib/twilioClient.js'
vi.mock('../lib/twilioClient.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
  formatWhatsAppNumber: (p) => `${p}@s.whatsapp.net`,
}))

test('accepted intent → status=accepted, accepted_at set, agency notif + auto-ack sent', async () => {
  _intentReply = '{"intent":"accepted"}'
  _offerLead = { id: 'lead-1', sender_id: '212600000001@s.whatsapp.net', status: 'offer_sent', raw_payload: {}, extracted_data: {} }
  _updateCalls.length = 0

  const { handleInboundWhatsApp } = await import('../routes/leads.js')
  await handleInboundWhatsApp('agency-1', '212600000001@s.whatsapp.net', null, null, 'Oui parfait')

  const update = _updateCalls.find(c => c.table === 'pending_demands')
  expect(update.payload.status).toBe('accepted')
  expect(update.payload.accepted_at).toBeTruthy()
  expect(sendToAgency).toHaveBeenCalledWith(
    'agency-1',
    expect.stringContaining('Offre acceptée'),
    expect.any(String),
    expect.objectContaining({ status: 'accepted' })
  )
  expect(sendWhatsAppMessage).toHaveBeenCalled()
})

test('rejected intent → status=ignored, agency notif, no client reply', async () => {
  _intentReply = '{"intent":"rejected"}'
  _offerLead = { id: 'lead-2', sender_id: '212600000002@s.whatsapp.net', status: 'offer_sent', raw_payload: {}, extracted_data: {} }
  _updateCalls.length = 0
  sendWhatsAppMessage.mockClear()

  const { handleInboundWhatsApp } = await import('../routes/leads.js')
  await handleInboundWhatsApp('agency-1', '212600000002@s.whatsapp.net', null, null, 'Non merci')

  const update = _updateCalls.find(c => c.table === 'pending_demands')
  expect(update.payload.status).toBe('ignored')
  expect(sendToAgency).toHaveBeenCalledWith(
    'agency-1',
    expect.stringContaining('refusée'),
    expect.any(String),
    expect.any(Object)
  )
  expect(sendWhatsAppMessage).not.toHaveBeenCalled()
})

test('question intent → status unchanged, last_client_note saved, agency notif, no reply', async () => {
  _intentReply = '{"intent":"question"}'
  _offerLead = { id: 'lead-3', sender_id: '212600000003@s.whatsapp.net', status: 'offer_sent', raw_payload: {}, extracted_data: {} }
  _updateCalls.length = 0
  sendWhatsAppMessage.mockClear()

  const { handleInboundWhatsApp } = await import('../routes/leads.js')
  await handleInboundWhatsApp('agency-1', '212600000003@s.whatsapp.net', null, null, 'Et avec assurance ?')

  const update = _updateCalls.find(c => c.table === 'pending_demands')
  expect(update.payload.status).toBeUndefined()         // no status change
  expect(update.payload.last_client_note).toBe('Et avec assurance ?')
  expect(sendToAgency).toHaveBeenCalled()
  expect(sendWhatsAppMessage).not.toHaveBeenCalled()
})
```

You may also need to extend the existing `supabaseAdmin` mock to capture the table + payload of `update()` calls. Locate the mock's `.update()` handler and adjust to push `{ table, payload }` into `_updateCalls`.

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run server/__tests__/offerResponse.test.js`
Expected: 3 new tests FAIL — the old `handleOfferResponse` always sets `status='waiting'`.

- [ ] **Step 3: Rewrite `handleOfferResponse` in `server/routes/leads.js`**

Locate the existing `handleOfferResponse` function (around lines 585-602). Replace with:

```js
async function handleOfferResponse(agencyId, senderJid, text, lead, source) {
  console.log(`[pipeline:${source}] → offer response | lead=${lead.id} | sender=${senderJid}`)

  const intent = text?.trim() ? await analyzeQuoteReply(text) : 'question'
  const existingReplies = lead.raw_payload?.replies || []
  const newReply = { text: (text || '').slice(0, 500), intent, timestamp: new Date().toISOString() }
  const baseUpdate = {
    last_client_note: (text || '').slice(0, 500),
    raw_payload: { ...(lead.raw_payload || {}), replies: [...existingReplies, newReply].slice(-50) },
  }

  if (intent === 'accepted') {
    const acceptedAt = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('pending_demands')
      .update({ ...baseUpdate, status: 'accepted', accepted_at: acceptedAt })
      .eq('id', lead.id)
      .eq('agency_id', agencyId)
    if (error) {
      console.error(`[pipeline:${source}] ✗ accepted update error:`, error.message)
      return
    }
    console.log(`[pipeline:${source}] ✓ lead ${lead.id} → accepted`)

    sendToAgency(
      agencyId,
      '✅ Offre acceptée',
      `Le client a accepté votre devis : « ${(text || '').slice(0, 80)} »`,
      { type: 'lead', id: lead.id, status: 'accepted' }
    ).catch(() => {})

    // Auto-ack (Task 10) — only on WhatsApp; Gmail clients don't expect WA replies
    if (source === 'whatsapp') {
      const { needsCIN, needsPermis } = detectMissingDocs(lead.extracted_data)
      const ackBody = buildAcknowledgmentMessage({ needsCIN, needsPermis })
      try {
        await sendWhatsAppMessage(senderJid, ackBody, agencyId)
        console.log(`[pipeline:${source}] → auto-ack sent | lead=${lead.id} | needsCIN=${needsCIN} needsPermis=${needsPermis}`)
      } catch (err) {
        console.error(`[pipeline:${source}] ✗ auto-ack send error:`, err.message)
      }
    }
    return
  }

  if (intent === 'rejected') {
    const { error } = await supabaseAdmin
      .from('pending_demands')
      .update({ ...baseUpdate, status: 'ignored' })
      .eq('id', lead.id)
      .eq('agency_id', agencyId)
    if (error) console.error(`[pipeline:${source}] ✗ rejected update error:`, error.message)
    else console.log(`[pipeline:${source}] ✓ lead ${lead.id} → ignored`)

    sendToAgency(
      agencyId,
      '❌ Offre refusée',
      `Le client a décliné : « ${(text || '').slice(0, 80)} »`,
      { type: 'lead', id: lead.id, status: 'ignored' }
    ).catch(() => {})
    return
  }

  // intent === 'question' — keep status unchanged
  const { error } = await supabaseAdmin
    .from('pending_demands')
    .update(baseUpdate)                                  // NOTE: no status field
    .eq('id', lead.id)
    .eq('agency_id', agencyId)
  if (error) console.error(`[pipeline:${source}] ✗ question update error:`, error.message)
  else console.log(`[pipeline:${source}] ✓ lead ${lead.id} | question noted`)

  sendToAgency(
    agencyId,
    '💬 Question sur l\'offre',
    (text || '').slice(0, 160),
    { type: 'lead', id: lead.id, status: lead.status }
  ).catch(() => {})
}
```

Add the imports at the top of `server/routes/leads.js` (under the existing imports):

```js
import { detectMissingDocs } from '../lib/triage.js'
import { buildAcknowledgmentMessage, mergeExtractedData } from '../lib/offerMessage.js'
import { sendWhatsAppMessage } from '../lib/twilioClient.js'
```

(`sendToAgency` is already imported per existing usage.)

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/offerResponse.test.js`
Expected: 3 new tests PASS; existing tests may need their assertions updated if they previously checked for `status='waiting'`. Update each old assertion that expected `'waiting'` to instead pick the correct branch (or delete the now-obsolete test if it tested only the old buggy behavior).

- [ ] **Step 5: Commit**

```bash
git add server/routes/leads.js server/__tests__/offerResponse.test.js
git commit -m "fix(leads): intent-aware handleOfferResponse with accepted/rejected/question branching"
```

---

## Task 10: Delete Orphaned `handleQuoteReply`

**Files:**
- Modify: `server/routes/leads.js`

- [ ] **Step 1: Confirm no callers**

Run: `npx grep -rn "handleQuoteReply" server/ components/ pages/ lib/`
Expected: only the export + definition in `server/routes/leads.js`.

- [ ] **Step 2: Delete the function**

In `server/routes/leads.js`, delete the entire `handleQuoteReply` function (lines ~785-845) including its JSDoc.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.js
git commit -m "ref(leads): remove orphaned handleQuoteReply (logic consolidated into handleOfferResponse)"
```

---

## Task 11: Image Branch for Active Leads in `handleInboundWhatsApp`

**Files:**
- Modify: `server/routes/leads.js`

- [ ] **Step 1: Add the image-merge branch**

In `server/routes/leads.js`, locate the block in `handleInboundWhatsApp` that calls `findActiveLeadByPhone` (top of the function after the log). Before:

```js
const activeLead = await findActiveLeadByPhone(agencyId, senderJid)
if (activeLead) {
  await handleOfferResponse(agencyId, senderJid, bodyText, activeLead, 'whatsapp')
  return
}
```

After:

```js
const activeLead = await findActiveLeadByPhone(agencyId, senderJid)
if (activeLead) {
  // Image from an active lead → run OCR, merge into existing lead
  if (imageBuffer && process.env.ANTHROPIC_API_KEY) {
    console.log(`[pipeline:wa] → active-lead image | lead=${activeLead.id} status=${activeLead.status}`)
    try {
      const imageBlock = { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBuffer.toString('base64') } }
      const incoming = await extractWithClaude([imageBlock], bodyText)
      if (incoming) {
        const merged = mergeExtractedData(activeLead.extracted_data, incoming)
        const update = {
          extracted_data: merged,
          media_urls: [...(activeLead.media_urls || []), ...(incoming._mediaUrls || [])],
        }

        // First time docs become complete → one-time notif (gated by docs_completed_at)
        const { needsCIN, needsPermis } = detectMissingDocs(merged)
        if (!needsCIN && !needsPermis && !activeLead.docs_completed_at) {
          update.docs_completed_at = new Date().toISOString()
        }

        const { data: rows, error } = await supabaseAdmin
          .from('pending_demands')
          .update(update)
          .eq('id', activeLead.id)
          .is('docs_completed_at', update.docs_completed_at ? null : activeLead.docs_completed_at)
          .select('id, docs_completed_at')
        if (error) console.error('[pipeline:wa] ✗ active-lead merge error:', error.message)
        else console.log(`[pipeline:wa] ✓ active-lead merged | lead=${activeLead.id} docs_complete=${!needsCIN && !needsPermis}`)

        if (update.docs_completed_at && rows && rows.length > 0) {
          sendToAgency(
            agencyId,
            '📂 Documents complets',
            'Le client a envoyé tous les documents requis — prêt à convertir.',
            { type: 'lead', id: activeLead.id, status: activeLead.status }
          ).catch(() => {})
        }
      }
    } catch (err) {
      console.error('[pipeline:wa] ✗ active-lead OCR error:', err.message)
    }
    return
  }

  // Text on an accepted lead → log only, no triage fall-through
  if (activeLead.status === 'accepted') {
    const existingReplies = activeLead.raw_payload?.replies || []
    const newReply = { text: (bodyText || '').slice(0, 500), intent: 'post-accept-note', timestamp: new Date().toISOString() }
    await supabaseAdmin
      .from('pending_demands')
      .update({
        last_client_note: (bodyText || '').slice(0, 500),
        raw_payload: { ...(activeLead.raw_payload || {}), replies: [...existingReplies, newReply].slice(-50) },
      })
      .eq('id', activeLead.id)
    sendToAgency(
      agencyId,
      '💬 Message client',
      (bodyText || '').slice(0, 160),
      { type: 'lead', id: activeLead.id, status: 'accepted' }
    ).catch(() => {})
    return
  }

  // Text on an offer_sent lead → run intent branching
  await handleOfferResponse(agencyId, senderJid, bodyText, activeLead, 'whatsapp')
  return
}
```

- [ ] **Step 2: Add tests for the image-on-active-lead branch**

Append to `server/__tests__/offerResponse.test.js`:

```js
test('image on accepted lead → OCR merged into existing extracted_data, no new row', async () => {
  _intentReply = '{"intent":"accepted"}'                  // unused for image path
  _offerLead = {
    id: 'lead-img-1',
    sender_id: '212600000004@s.whatsapp.net',
    status: 'accepted',
    raw_payload: {},
    extracted_data: { firstName: 'Ahmed' },
    media_urls: [],
    docs_completed_at: null,
  }
  _updateCalls.length = 0

  // Stub extractWithClaude to return CIN extraction
  vi.doMock('../routes/leads.js', async (orig) => {
    const mod = await orig()
    mod.__test_extractWithClaude = async () => ({ cin: 'AB123456', documentType: 'cin', documentNumber: 'AB123456' })
    return mod
  })

  const { handleInboundWhatsApp } = await import('../routes/leads.js')
  await handleInboundWhatsApp('agency-1', '212600000004@s.whatsapp.net', Buffer.from('fakeimg'), 'image/jpeg', '')

  const update = _updateCalls.find(c => c.table === 'pending_demands')
  expect(update.payload.extracted_data.firstName).toBe('Ahmed')       // preserved
  expect(update.payload.extracted_data.cin).toBe('AB123456')          // merged in
  // No insert into pending_demands — no duplicate row
  expect(_updateCalls.filter(c => c.op === 'insert').length).toBe(0)
})
```

(Note: in practice you may need to refactor `extractWithClaude` into a separately-importable module to make it mockable per-test; if so, do that refactor as part of this task.)

- [ ] **Step 3: Run tests**

Run: `npx vitest run server/__tests__/offerResponse.test.js`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.js server/__tests__/offerResponse.test.js
git commit -m "feat(leads): merge OCR from active-lead photos into existing extracted_data"
```

---

## Task 12: Confidentialite Frontend Page

**Files:**
- Create: `pages/Confidentialite.jsx`
- Create: `public/locales/fr/confidentialite.json`
- Create: `public/locales/ar/confidentialite.json`
- Create: `public/locales/en/confidentialite.json`
- Modify: `lib/i18n.js`
- Modify: `App.jsx`

- [ ] **Step 1: Create French copy**

`public/locales/fr/confidentialite.json`:

```json
{
  "title": "Confidentialité et protection des données",
  "intro": "RentaFlow et votre agence de location partenaire traitent vos données personnelles conformément à la loi marocaine 09-08 sur la protection des personnes physiques à l'égard du traitement des données à caractère personnel.",
  "collectedTitle": "Données collectées",
  "collected": [
    "Identité : nom, prénom, CIN",
    "Permis de conduire",
    "Numéro de téléphone (WhatsApp)",
    "Dates et lieux de location"
  ],
  "purposeTitle": "Finalité du traitement",
  "purpose": "Vos données sont utilisées exclusivement pour l'exécution du contrat de location et le respect des obligations légales (assurance, autorités).",
  "rightsTitle": "Vos droits",
  "rights": [
    "Accès à vos données",
    "Rectification en cas d'inexactitude",
    "Suppression (sous réserve des obligations légales)",
    "Opposition au traitement"
  ],
  "contactTitle": "Exercer vos droits",
  "contact": "Pour exercer vos droits, contactez votre agence sur ce même numéro WhatsApp.",
  "footer": "Conforme à la loi 09-08 — Commission Nationale de contrôle de la Protection des Données à caractère Personnel (CNDP — www.cndp.ma)."
}
```

- [ ] **Step 2: Create Arabic copy**

`public/locales/ar/confidentialite.json`:

```json
{
  "title": "السرية وحماية البيانات",
  "intro": "تعالج RentaFlow ووكالة الكراء الشريكة بياناتك الشخصية وفقا للقانون المغربي 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي.",
  "collectedTitle": "البيانات المجمعة",
  "collected": [
    "الهوية : الاسم الكامل، البطاقة الوطنية",
    "رخصة السياقة",
    "رقم الهاتف (واتساب)",
    "تواريخ وأماكن الكراء"
  ],
  "purposeTitle": "غاية المعالجة",
  "purpose": "تستعمل بياناتك حصريا لتنفيذ عقد الكراء واحترام الالتزامات القانونية (التأمين، السلطات).",
  "rightsTitle": "حقوقك",
  "rights": [
    "الاطلاع على بياناتك",
    "التصحيح في حالة عدم الدقة",
    "الحذف (مع مراعاة الالتزامات القانونية)",
    "الاعتراض على المعالجة"
  ],
  "contactTitle": "ممارسة حقوقك",
  "contact": "لممارسة حقوقك، تواصل مع وكالتك على نفس رقم الواتساب.",
  "footer": "مطابق للقانون 09-08 — اللجنة الوطنية لمراقبة حماية المعطيات ذات الطابع الشخصي (CNDP — www.cndp.ma)."
}
```

- [ ] **Step 3: Create English copy**

`public/locales/en/confidentialite.json`:

```json
{
  "title": "Privacy and Data Protection",
  "intro": "RentaFlow and your partner rental agency process your personal data in accordance with Moroccan Law 09-08 on the protection of natural persons with regard to the processing of personal data.",
  "collectedTitle": "Data collected",
  "collected": [
    "Identity: first name, last name, national ID (CIN)",
    "Driving licence",
    "Phone number (WhatsApp)",
    "Rental dates and locations"
  ],
  "purposeTitle": "Purpose of processing",
  "purpose": "Your data is used exclusively for the execution of the rental contract and compliance with legal obligations (insurance, authorities).",
  "rightsTitle": "Your rights",
  "rights": [
    "Access to your data",
    "Rectification in case of inaccuracy",
    "Deletion (subject to legal obligations)",
    "Opposition to processing"
  ],
  "contactTitle": "Exercise your rights",
  "contact": "To exercise your rights, contact your agency on the same WhatsApp number.",
  "footer": "Compliant with Law 09-08 — National Commission for the Protection of Personal Data (CNDP — www.cndp.ma)."
}
```

- [ ] **Step 4: Register the namespace in i18n**

In `lib/i18n.js`, change the existing line:

```js
ns: ['common'],
```

To:

```js
ns: ['common', 'confidentialite'],
```

- [ ] **Step 5: Create the React page**

`pages/Confidentialite.jsx`:

```jsx
import { useTranslation } from 'react-i18next'

export default function Confidentialite() {
  const { t } = useTranslation('confidentialite')

  const collected = t('collected', { returnObjects: true })
  const rights    = t('rights',    { returnObjects: true })

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '48px 24px',
      color: 'var(--text-primary)',
      lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 26, marginBottom: 24 }}>{t('title')}</h1>
      <p style={{ marginBottom: 24 }}>{t('intro')}</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('collectedTitle')}</h2>
      <ul>
        {Array.isArray(collected) && collected.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('purposeTitle')}</h2>
      <p>{t('purpose')}</p>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('rightsTitle')}</h2>
      <ul>
        {Array.isArray(rights) && rights.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{t('contactTitle')}</h2>
      <p>{t('contact')}</p>

      <hr style={{ margin: '40px 0', border: 0, borderTop: '1px solid var(--border)' }} />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('footer')}</p>
    </div>
  )
}
```

- [ ] **Step 6: Wire the route in App.jsx (unauthenticated)**

In `App.jsx`, locate the `renderPage` (or equivalent) switch with the existing `case 'privacy-policy'` line and add a sibling case:

```js
case 'confidentialite': return <Confidentialite />
```

Add the import at the top of `App.jsx`:

```js
import Confidentialite from './pages/Confidentialite.jsx'
```

**IMPORTANT:** This route must be accessible without authentication. Locate the auth-gate logic in `App.jsx` (the block that redirects unauthenticated users to `Auth`). Add a guard so that `page === 'confidentialite'` bypasses the auth check:

```js
// Inside the render — before the auth gate
if (page === 'confidentialite') return <Confidentialite />
```

(If the existing structure already short-circuits on certain pages, mirror that pattern.)

- [ ] **Step 7: Manual smoke test**

Run `npm run dev` and visit `http://localhost:5173/?page=confidentialite` (or use the URL pattern your app uses). The page must render without requiring login. Switch language to Arabic — RTL direction applied and Arabic content visible.

- [ ] **Step 8: Commit**

```bash
git add pages/Confidentialite.jsx public/locales/fr/confidentialite.json public/locales/ar/confidentialite.json public/locales/en/confidentialite.json lib/i18n.js App.jsx
git commit -m "feat(legal): add CNDP loi 09-08 client confidentialite page"
```

---

## Task 13: Version Bump

**Files:**
- Modify: `components/Sidebar.jsx`

- [ ] **Step 1: Bump version**

In `components/Sidebar.jsx`, find the current version string `v1.12.0` and change to `v1.12.1`.

- [ ] **Step 2: Commit**

```bash
git add components/Sidebar.jsx
git commit -m "chore: bump version to v1.12.1"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all suites PASS (target: ≥190 tests, up from 189).

- [ ] **Step 2: Manual end-to-end on staging**

After pushing to staging:

1. Send a test WhatsApp message that triggers a lead (e.g., "Bonjour, je veux louer une voiture pour 3 jours du 25 mai au 28 mai").
2. Open the lead in Basket → SmartQuotePanel — confirm dates are pre-filled from `extracted_data`.
3. Click **Envoyer le devis** with a vehicle + price.
4. Receiving phone: verify message contains:
   - vehicle + price
   - dates line (📅)
   - 🔒 CNDP block with `/confidentialite` link
   - Oui/Non prompt
5. Open the `/confidentialite` link in a browser — page renders without login.
6. Reply "Oui" from the test phone.
7. Verify:
   - Lead status → `accepted` in DB
   - Lead appears in Basket → Leads → Accepté tab
   - Auto-ack received on the test phone, asking for CIN + permis
   - Agency receives in-app notif "✅ Offre acceptée"
8. From the test phone, send a CIN photo.
9. Verify:
   - No new lead row created
   - The accepted lead's `extracted_data.documentType = 'cin'` and `documentNumber` populated
   - `media_urls` updated
10. Send a permis photo. Verify:
    - `extracted_data.permis` populated
    - `docs_completed_at` set
    - Agency receives one-time notif "📂 Documents complets"
11. Open the lead — "Convert to Rental" button works, opens NewRental prefilled.

- [ ] **Step 3: Manual reject path**

Repeat with a different sender, but reply "Non merci".
Expected: lead status → `ignored`, agency notif "❌ Offre refusée", no auto-ack.

- [ ] **Step 4: Manual question path**

Repeat with a different sender, but reply "Et avec l'assurance ?".
Expected: lead status stays `offer_sent`, agency notif "💬 Question sur l'offre", no auto-ack, **no duplicate lead created**.

---

## Spec Coverage Checklist

| Spec section | Covered by |
|---|---|
| Section 1 — Confidentialite page + i18n + route | Task 12 |
| Section 2.1 — Date pre-fill in SmartQuotePanel | Task 7 |
| Section 2.2 — CNDP block in offer message | Tasks 2, 6 |
| Section 2.3 — Final message template | Tasks 2, 6 |
| Section 2.4 — Pure `buildOfferMessage` | Task 2 |
| Section 3.1 — Consolidation (delete `handleQuoteReply`) | Task 10 |
| Section 3.2 — Intent → status table | Task 9 |
| Section 3.3 — No fall-through to triage | Task 9 (question branch has no `return null`) |
| Section 3.4 — Conversation log in `raw_payload.replies[]` | Task 9 |
| Section 3.5 — Convert button for accepted | Verified in Task 14 step 2 (LeadModal already shows for accepted status via existing logic) |
| Section 4.1 — `detectMissingDocs` | Task 4 |
| Section 4.2 — Acknowledgment templates | Task 3 |
| Section 4.3 — `buildAcknowledgmentMessage` | Task 3 |
| Section 4.4 — Send path errors don't block | Task 9 (try/catch around `sendWhatsAppMessage`) |
| Section 4b.1 — `findActiveLeadByPhone` widened | Task 8 |
| Section 4b.2 — Branching by inbound type + status | Task 11 |
| Section 4b.3 — `mergeExtractedData` non-destructive | Task 5 |
| Section 4b.4 — One-time docs-complete notif | Task 11 (conditional update + `docs_completed_at` guard) |
| Data model — `accepted_at`, `docs_completed_at` columns | Task 1 |
| Env var — `PUBLIC_APP_URL` | Task 6 |
| Testing strategy — unit + integration | Tasks 2-5, 9, 11 |

---

## Plan Self-Review Notes

- All step-level code blocks are concrete (no "// TODO" or "// implement here").
- Function/method names are consistent across tasks: `buildOfferMessage`, `buildAcknowledgmentMessage`, `mergeExtractedData`, `detectMissingDocs`, `findActiveLeadByPhone`, `handleOfferResponse`.
- Each task ends with an explicit commit step with a real message.
- TDD order preserved: failing test → run-fail → implement → run-pass → commit.
- Migration (Task 1) lands first so subsequent code can rely on the new columns.
- Image-merge branch (Task 11) depends on `mergeExtractedData` (Task 5) and `detectMissingDocs` (Task 4) — both land before Task 11.
- `extractWithClaude` is referenced in Task 11 — it already exists in `server/routes/leads.js` (no new code needed for the function itself, only the call).
