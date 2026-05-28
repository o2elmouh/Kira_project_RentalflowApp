# Prolongation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect client prolongation requests from inbound Gmail/WhatsApp, link the lead to the existing active contract, and let the agent resolve the request in one extra click from either the corbeille card or a banner on the contract card.

**Architecture:** Add a single nullable FK column on `pending_demands` linking a prolongation lead to its target contract. Backfill it at classification time using a client-by-email lookup (new for Gmail; phone-based lookup already exists for WhatsApp). Surface the lead in two places (corbeille + contract banner) that both open the same `ProlongationDialog` component extracted from the existing manual flow in `Contracts.jsx`.

**Tech Stack:** Node/Express + Supabase (Postgres + storage), React 18 + Vite, Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-05-28-prolongation-flow-design.md`

**Versioning rollout:**

| Phase | Bumps to | Stop and wait for push? |
|---|---|---|
| 1. Schema | v1.13.8 | yes |
| 2. Backend detection | v1.13.9 | yes |
| 3. Extract `ProlongationDialog` (pure refactor) | v1.13.10 | yes |
| 4. UI surfaces + i18n + banner | v1.14.0 | yes |

Per CLAUDE.md #7, NEVER push without explicit user instruction. Each phase ends with a STOP gate; resume only after the user says "push" and confirms the next phase.

---

## Phase 1 — Schema migration (v1.13.8)

### Task 1.1: Create migration file

**Files:**
- Create: `supabase/migrations/20260528_prolongation_target_contract.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260528_prolongation_target_contract.sql
--
-- Adds a nullable FK from pending_demands to contracts so a prolongation
-- lead can be linked to the active contract it refers to. Populated by
-- the inbound pipeline at classification time. NULL means either:
--   - the lead is not a prolongation, or
--   - the sender could not be matched to a single active contract
--     (in which case classification is downgraded to 'new_lead').

ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS prolongation_target_contract_id UUID
  REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pending_demands_prolongation_target_idx
  ON pending_demands (prolongation_target_contract_id)
  WHERE prolongation_target_contract_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration locally (optional — the user runs Supabase migrations as part of deploy)**

The Supabase migrations are version-controlled and apply automatically on push to staging. Do NOT run `supabase db push` from this session. Document only.

- [ ] **Step 3: Bump version**

Edit `components/Sidebar.jsx` line 167: `v1.13.7` → `v1.13.8`.

- [ ] **Step 4: Commit on staging**

```bash
git add supabase/migrations/20260528_prolongation_target_contract.sql components/Sidebar.jsx
git commit -m "feat(schema): add prolongation_target_contract_id to pending_demands (v1.13.8)

Nullable FK that the inbound pipeline will populate when a prolongation
classification is matched to exactly one of the sender's active
contracts. Partial index on non-null values supports the contract-banner
query in v1.14.0 without overhead on regular leads.

Migration is additive and safe to deploy before the code that reads it."
```

- [ ] **Step 5: STOP — request push**

Output to user: *"Phase 1 complete. Schema migration committed locally on staging as `<hash>`. Say 'push' to deploy v1.13.8 to staging, then we'll start Phase 2."*

Do not proceed to Phase 2 until the user confirms the push and says continue.

---

## Phase 2 — Backend detection (v1.13.9)

### Task 2.1: Add `getClientStatusByEmail` helper

**Files:**
- Modify: `server/routes/leads.js` (insert new function next to existing `getClientStatus` at line 550)
- Create: `server/__tests__/prolongationMatching.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/prolongationMatching.test.js`:

```js
/**
 * @vitest-environment node
 */
import { test, expect, vi, beforeEach } from 'vitest'

let _clientsByEmail = []
let _activeContracts = []

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: (_col1, _val1) => ({
              eq: (_col2, val2) => ({
                limit: () => Promise.resolve({
                  data: _clientsByEmail.filter(c => c.email === val2),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col2, val2) => ({
                eq: () => Promise.resolve({
                  data: _activeContracts.filter(c => c.client_id === val2),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  },
}))

const { getClientStatusByEmail, findActiveContractsForClient } = await import('../routes/leads.js')

beforeEach(() => {
  _clientsByEmail = []
  _activeContracts = []
})

test('getClientStatusByEmail returns no_contract when sender email is not on any client', async () => {
  _clientsByEmail = []
  expect(await getClientStatusByEmail('a1', 'unknown@example.com')).toBe('no_contract')
})

test('getClientStatusByEmail returns no_contract when client exists but has no active contract', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = []
  expect(await getClientStatusByEmail('a1', 'a@b.com')).toBe('no_contract')
})

test('getClientStatusByEmail returns active_contract when client has one active contract', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]
  expect(await getClientStatusByEmail('a1', 'a@b.com')).toBe('active_contract')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "C:/Users/otman/Downloads/01-RentaFlow-SAAS/Rental flow app SAAS" && npx vitest run server/__tests__/prolongationMatching.test.js
```

Expected: FAIL — `getClientStatusByEmail is not exported by server/routes/leads.js`.

- [ ] **Step 3: Implement `getClientStatusByEmail`**

In `server/routes/leads.js`, immediately after the existing `getClientStatus` function (ending at line 577), add:

```js
/**
 * Email-equivalent of getClientStatus(). Looks up a client by exact email,
 * then checks for any active contract. Used by the Gmail webhook so the
 * classifier knows whether the sender is a known active-contract client.
 *
 * @returns 'active_contract' | 'no_contract'
 */
export async function getClientStatusByEmail(agencyId, senderEmail) {
  try {
    if (!senderEmail) return 'no_contract'
    const normalized = String(senderEmail).trim().toLowerCase()
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('email', normalized)
      .limit(1)

    if (!clients?.length) return 'no_contract'

    const { data: contracts } = await supabaseAdmin
      .from('contracts')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('client_id', clients[0].id)
      .eq('status', 'active')

    return contracts?.length ? 'active_contract' : 'no_contract'
  } catch {
    return 'no_contract'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run server/__tests__/prolongationMatching.test.js
```

Expected: 3 tests pass. (The two `findActiveContractsForClient` tests added in Task 2.2 will be added shortly.)

- [ ] **Step 5: Commit**

```bash
git add server/routes/leads.js server/__tests__/prolongationMatching.test.js
git commit -m "feat(leads): getClientStatusByEmail helper for Gmail classifier input"
```

### Task 2.2: Add `findActiveContractsForClient` helper

**Files:**
- Modify: `server/routes/leads.js`
- Modify: `server/__tests__/prolongationMatching.test.js`

- [ ] **Step 1: Append the failing tests** to `server/__tests__/prolongationMatching.test.js`:

```js
test('findActiveContractsForClient returns empty array when no active contract', async () => {
  _activeContracts = []
  const res = await findActiveContractsForClient('a1', 'cli-1')
  expect(res).toEqual([])
})

test('findActiveContractsForClient returns one row for a single active contract', async () => {
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]
  const res = await findActiveContractsForClient('a1', 'cli-1')
  expect(res.length).toBe(1)
  expect(res[0].id).toBe('ctr-1')
})

test('findActiveContractsForClient returns multiple rows for multi-contract clients', async () => {
  _activeContracts = [
    { id: 'ctr-1', client_id: 'cli-1' },
    { id: 'ctr-2', client_id: 'cli-1' },
  ]
  const res = await findActiveContractsForClient('a1', 'cli-1')
  expect(res.length).toBe(2)
})
```

You also need to extend the import line at the top of the test file:

```js
const { getClientStatusByEmail, findActiveContractsForClient } = await import('../routes/leads.js')
```

(Already present from Task 2.1 — no change needed.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run server/__tests__/prolongationMatching.test.js
```

Expected: 3 new tests FAIL — `findActiveContractsForClient is not a function`.

- [ ] **Step 3: Implement `findActiveContractsForClient`**

Add immediately after `getClientStatusByEmail` in `server/routes/leads.js`:

```js
/**
 * Returns all of a client's currently-active contracts (sorted newest first).
 * Used after classification = 'prolongation' to decide whether to link the
 * lead to one contract (1 row), let the agent pick (2+ rows), or downgrade
 * the lead to 'new_lead' (0 rows).
 */
export async function findActiveContractsForClient(agencyId, clientId) {
  try {
    if (!agencyId || !clientId) return []
    const { data: contracts } = await supabaseAdmin
      .from('contracts')
      .select('id, contract_number, vehicle_id, client_id, end_date, daily_rate, status, created_at')
      .eq('agency_id', agencyId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    return contracts || []
  } catch (err) {
    console.error('[leads/findActiveContractsForClient] error:', err.message)
    return []
  }
}
```

The test mock chains `.eq().eq().eq()` (agency, client, status); the production query adds `.order()` at the end. Update the test mock's `contracts` branch to support the chained order:

Replace the existing `if (table === 'contracts')` block in the test with:

```js
      if (table === 'contracts') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col2, val2) => ({
                eq: () => ({
                  order: () => Promise.resolve({
                    data: _activeContracts.filter(c => c.client_id === val2),
                  }),
                }),
              }),
            }),
          }),
        }
      }
```

Also update the existing `getClientStatusByEmail` chain — its contracts query terminates at the third `.eq()`. The test will now match the new query shape; the old `getClientStatusByEmail` tests must still pass. Re-verify by reading the function: it calls `.eq('agency_id').eq('client_id').eq('status', 'active')` — no `.order()`. We need both terminal shapes. Update the mock to expose both `.then`-like and `.order` paths:

```js
      if (table === 'contracts') {
        const buildTerminal = (clientId) => {
          const data = _activeContracts.filter(c => c.client_id === clientId)
          // Both shapes return the same payload; the function only needs `data`.
          const payload = { data }
          return {
            then: (resolve) => resolve(payload), // for the no-order chain
            order: () => Promise.resolve(payload), // for the ordered chain
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: (_col2, val2) => ({
                eq: () => buildTerminal(val2),
              }),
            }),
          }),
        }
      }
```

- [ ] **Step 4: Run tests to verify all 6 pass**

```bash
npx vitest run server/__tests__/prolongationMatching.test.js
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/leads.js server/__tests__/prolongationMatching.test.js
git commit -m "feat(leads): findActiveContractsForClient helper for prolongation linking"
```

### Task 2.3: Apply decision matrix in Gmail webhook

**Files:**
- Modify: `server/routes/leads.js` (Gmail webhook around current line 304 and the insert path around line 364)
- Create: `server/__tests__/gmailProlongationClassify.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/gmailProlongationClassify.test.js`:

```js
/**
 * @vitest-environment node
 */
import { test, expect, vi, beforeEach } from 'vitest'

process.env.ANTHROPIC_API_KEY = 'test-key'

let _classifyResponse = { classification: 'prolongation', confidence: 0.9, summary_for_agent: 'extension', extracted_data: { end_date: '2026-09-15' } }
let _clientsByEmail = []
let _activeContracts = []
const _insertCalls = []

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {}
    get messages() {
      return {
        create: async () => ({ content: [{ text: JSON.stringify(_classifyResponse) }] }),
      }
    }
  },
}))

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: (table) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col, val) => ({
                limit: () => Promise.resolve({ data: _clientsByEmail.filter(c => c.email === val) }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        const buildTerminal = (clientId) => {
          const data = _activeContracts.filter(c => c.client_id === clientId)
          const payload = { data }
          return { then: (r) => r(payload), order: () => Promise.resolve(payload) }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => buildTerminal(_clientsByEmail[0]?.id),
              }),
            }),
          }),
        }
      }
      if (table === 'pending_demands') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
              }),
            }),
          }),
          insert: (payload) => {
            _insertCalls.push({ payload })
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'new-id' }, error: null }) }) }
          },
        }
      }
      return {}
    },
  },
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'a1' }; next() },
}))
vi.mock('../lib/triage.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('fr'),
  translateToFrench: vi.fn().mockImplementation((t) => t),
  preFilter: vi.fn().mockReturnValue({ result: 'pass', matchedKeywords: ['location'] }),
  handleAmbiguous: vi.fn().mockResolvedValue(null),
  detectMissingDocs: vi.fn().mockReturnValue({ needsCIN: true, needsPermis: true }),
}))
vi.mock('../lib/conversation.js', () => ({ appendConversation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/pushNotifications.js', () => ({ sendToAgency: vi.fn().mockResolvedValue(undefined) }))

const express = (await import('express')).default
const supertest = (await import('supertest')).default
const leadsRouter = (await import('../routes/leads.js')).default

const app = express()
app.use(express.json())
process.env.INTERNAL_WEBHOOK_SECRET = 'test-secret'
app.use('/leads', leadsRouter)

beforeEach(() => {
  _classifyResponse = { classification: 'prolongation', confidence: 0.9, summary_for_agent: 'extension', extracted_data: { end_date: '2026-09-15' } }
  _clientsByEmail = []
  _activeContracts = []
  _insertCalls.length = 0
})

test('prolongation + matched client + 1 active contract → lead has prolongation_target_contract_id', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]

  const res = await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(res.status).toBe(200)
  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBe('ctr-1')
})

test('prolongation + no active contract → downgraded to new_lead, no target', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = []

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
})

test('prolongation + 2 active contracts → target null, candidates stored in extracted_data', async () => {
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [
    { id: 'ctr-1', client_id: 'cli-1' },
    { id: 'ctr-2', client_id: 'cli-1' },
  ]

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'extend', bodyText: 'je veux prolonger', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
  expect(_insertCalls[0].payload.extracted_data.prolongation_candidates).toEqual(['ctr-1', 'ctr-2'])
})

test('non-prolongation classification → no target set, unchanged behavior', async () => {
  _classifyResponse = { classification: 'new_lead', confidence: 0.9, summary_for_agent: 'wants car', extracted_data: { requested_car: 'Audi' } }
  _clientsByEmail = [{ id: 'cli-1', email: 'a@b.com' }]
  _activeContracts = [{ id: 'ctr-1', client_id: 'cli-1' }]

  await supertest(app)
    .post('/leads/webhook/gmail')
    .set('X-Internal-Secret', 'test-secret')
    .send({ agencyId: 'a1', senderEmail: 'a@b.com', subject: 'rent', bodyText: 'je veux louer une voiture', attachments: [] })

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('new_lead')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBeFalsy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run server/__tests__/gmailProlongationClassify.test.js
```

Expected: 4 tests FAIL — `prolongation_target_contract_id` never present on the insert payload.

- [ ] **Step 3: Modify Gmail webhook to use real `clientStatus`**

In `server/routes/leads.js`, find the line (currently 304):

```js
      const classification = await classifyTextMessage(textToClassify, 'no_contract')
```

Replace with:

```js
      const gmailClientStatus = await getClientStatusByEmail(agencyId, senderEmail)
      const classification = await classifyTextMessage(textToClassify, gmailClientStatus)
```

- [ ] **Step 4: Modify Gmail webhook to apply the decision matrix after classification, before insert**

In `server/routes/leads.js`, AFTER the entire text-classification block ends (current line ~338, right before `for (const a of (attachments || []))` at line ~341), insert:

```js
  // ── Prolongation linkage (Section 1 of design spec) ────────
  // When classification is 'prolongation', find the sender's active contracts
  // and decide where to link the lead:
  //   - 0 contracts  → downgrade to 'new_lead' (lead still surfaces in corbeille)
  //   - 1 contract   → set prolongation_target_contract_id
  //   - 2+ contracts → store candidates in extracted_data, leave target null
  let prolongationTargetContractId = null
  if (extractedData?.classification === 'prolongation') {
    const { data: gmailClients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('email', String(senderEmail).trim().toLowerCase())
      .limit(1)
    const matchedClientId = gmailClients?.[0]?.id || null
    const active = matchedClientId ? await findActiveContractsForClient(agencyId, matchedClientId) : []
    if (active.length === 0) {
      console.log(`[pipeline:gmail-wh] → prolongation downgraded to new_lead (0 active contracts)`)
      extractedData.classification = 'new_lead'
    } else if (active.length === 1) {
      prolongationTargetContractId = active[0].id
      console.log(`[pipeline:gmail-wh] → prolongation linked to contract ${active[0].id}`)
    } else {
      extractedData.prolongation_candidates = active.map(c => c.id)
      console.log(`[pipeline:gmail-wh] → prolongation has ${active.length} candidate contracts (deferred to agent)`)
    }
  }
```

- [ ] **Step 5: Add `prolongation_target_contract_id` to the insert payload**

In the same file, find the `.from('pending_demands').insert({` block in the Gmail webhook (currently line ~364–375). Add one line:

```js
    const { data: inserted, error } = await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'gmail',
      sender_id: senderEmail,
      raw_payload: { subject, bodyText: (bodyText || '').slice(0, 2000) },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: mediaUrls,
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
      classification: extractedData?.classification || null,
      prolongation_target_contract_id: prolongationTargetContractId,
    }).select('id').maybeSingle()
```

And the matching update path (currently line ~351–362) — add the same field at the end of the `.update({...})` object:

```js
      .update({
        extracted_data: { ...(match.demand.extracted_data || {}), ...(extractedData || {}) },
        media_urls: [...(match.demand.media_urls || []), ...mediaUrls],
        confidence_scores: extractedData?.confidenceScores || null,
        match_score: match.score,
        ...(extractedData?.classification ? { classification: extractedData.classification } : {}),
        ...(prolongationTargetContractId ? { prolongation_target_contract_id: prolongationTargetContractId } : {}),
      })
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run server/__tests__/gmailProlongationClassify.test.js
```

Expected: 4/4 PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/leads.js server/__tests__/gmailProlongationClassify.test.js
git commit -m "feat(leads): apply prolongation decision matrix in Gmail webhook"
```

### Task 2.4: Apply decision matrix in WhatsApp handler

**Files:**
- Modify: `server/routes/leads.js` `handleInboundWhatsApp`

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/prolongationMatching.test.js` (mock and import already there):

```js
test('handleInboundWhatsApp: prolongation + 1 active contract → lead links to it', async () => {
  // Note: this test requires the WhatsApp pipeline mocks already present
  // in server/__tests__/offerResponseTriageGate.test.js. For full coverage
  // see that file's regression suite. This task asserts only the linkage
  // value on the insert payload.
  //
  // Implemented in offerResponseTriageGate.test.js extension below; left
  // intentionally minimal here to avoid duplicating the full pipeline mock.
  expect(true).toBe(true) // placeholder — see offerResponseTriageGate
})
```

Then extend `server/__tests__/offerResponseTriageGate.test.js` with a new test:

```js
test('sender without offer + prolongation + 1 active contract → new lead with target id set', async () => {
  // The existing mock in this file already covers the WhatsApp pipeline.
  // We re-use the same _insertCalls / _classifyResponse plumbing.
  // Add to the offerResponseTriageGate file:
  _offerLead = null
  _classifyResponse = {
    classification: 'prolongation',
    confidence: 0.9,
    summary_for_agent: 'extend',
    extracted_data: { end_date: '2026-09-15' },
  }

  // The existing mock for `clients` and `contracts` tables is required.
  // Add (in the existing supabaseAdmin mock factory) branches for the new
  // findActiveContractsForClient lookup. See implementation in Task 2.4 Step 3.
  await handleInboundWhatsApp(AGENCY_ID, SENDER_JID, null, 'image/jpeg', 'je veux prolonger jusqu\'au 15 septembre')

  expect(_insertCalls.length).toBe(1)
  expect(_insertCalls[0].payload.classification).toBe('prolongation')
  expect(_insertCalls[0].payload.prolongation_target_contract_id).toBe('ctr-wa-1')
})
```

This test requires extending the existing `offerResponseTriageGate.test.js` mock to return a matching client + contract when the WhatsApp pipeline does the lookup. Add to that test file (alongside `_offerLead` etc.):

```js
let _waClientsByPhone = []
let _waActiveContracts = []
```

And extend the supabaseAdmin mock — in the existing `from: (table) =>` factory, add branches:

```js
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => Promise.resolve({ data: _waClientsByPhone }),
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        const buildTerminal = () => ({
          then: (r) => r({ data: _waActiveContracts }),
          order: () => Promise.resolve({ data: _waActiveContracts }),
        })
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => buildTerminal(),
                limit: () => Promise.resolve({ data: _waActiveContracts }),
              }),
            }),
          }),
        }
      }
```

And populate the test state in the new test:

```js
  _waClientsByPhone = [{ id: 'cli-wa-1' }]
  _waActiveContracts = [{ id: 'ctr-wa-1', client_id: 'cli-wa-1' }]
```

Place these lines BEFORE the `await handleInboundWhatsApp(...)` call in the new test, and reset them in `resetState`:

```js
  _waClientsByPhone = []
  _waActiveContracts = []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run server/__tests__/offerResponseTriageGate.test.js
```

Expected: new prolongation test FAILS — `prolongation_target_contract_id` not present.

- [ ] **Step 3: Apply the decision matrix in `handleInboundWhatsApp`**

In `server/routes/leads.js`, find the WhatsApp insert path (currently line ~903). BEFORE the call to `findMatchingDemand` (currently line ~888), insert the prolongation decision block:

```js
  // ── Prolongation linkage (mirror of Gmail webhook) ─────────
  let waProlongationTargetContractId = null
  if (extractedData?.classification === 'prolongation') {
    const digits = senderJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    const localVariants = [digits, digits.replace(/^212/, '0')]
    const { data: waClients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('agency_id', agencyId)
      .in('phone', localVariants)
      .limit(1)
    const matchedClientId = waClients?.[0]?.id || null
    const active = matchedClientId ? await findActiveContractsForClient(agencyId, matchedClientId) : []
    if (active.length === 0) {
      console.log(`[pipeline:wa] → prolongation downgraded to new_lead (0 active contracts)`)
      extractedData.classification = 'new_lead'
    } else if (active.length === 1) {
      waProlongationTargetContractId = active[0].id
      console.log(`[pipeline:wa] → prolongation linked to contract ${active[0].id}`)
    } else {
      extractedData.prolongation_candidates = active.map(c => c.id)
      console.log(`[pipeline:wa] → prolongation has ${active.length} candidates (deferred to agent)`)
    }
  }
```

Then in both update and insert payloads in `handleInboundWhatsApp` (currently lines 892 and 903), add the field. For update:

```js
    const { error } = await supabaseAdmin.from('pending_demands').update({
      extracted_data: { ...(match.demand.extracted_data || {}), ...(extractedData || {}) },
      media_urls: match.demand.media_urls || [],
      confidence_scores: extractedData?.confidenceScores || null,
      match_score: match.score,
      raw_payload: { ...match.demand.raw_payload, latestBody: bodyText },
      ...(extractedData?.classification ? { classification: extractedData.classification } : {}),
      ...(waProlongationTargetContractId ? { prolongation_target_contract_id: waProlongationTargetContractId } : {}),
    }).eq('id', match.demand.id)
```

For insert:

```js
    const { data: inserted, error } = await supabaseAdmin.from('pending_demands').insert({
      agency_id: agencyId,
      source: 'whatsapp',
      sender_id: senderJid,
      raw_payload: { body: bodyText, from: senderJid },
      extracted_data: extractedData,
      confidence_scores: extractedData?.confidenceScores || null,
      media_urls: [],
      match_score: match?.score || null,
      merged_with_id: match?.type === 'potential' ? match.demand.id : null,
      classification: extractedData?.classification || null,
      prolongation_target_contract_id: waProlongationTargetContractId,
    }).select('id').maybeSingle()
```

- [ ] **Step 4: Run all server tests to verify they pass**

```bash
npm test
```

Expected: all tests pass (including the new prolongation WhatsApp test and all 6 prolongationMatching tests).

- [ ] **Step 5: Bump version**

`components/Sidebar.jsx` line 167: `v1.13.8` → `v1.13.9`.

- [ ] **Step 6: Commit**

```bash
git add server/routes/leads.js server/__tests__/offerResponseTriageGate.test.js server/__tests__/prolongationMatching.test.js components/Sidebar.jsx
git commit -m "feat(leads): apply prolongation decision matrix in WhatsApp handler + bump v1.13.9

Symmetric to the Gmail-side change. Both inbound channels now look up
the sender's active contracts when classification = 'prolongation' and
either: link the lead to the single match, store candidates for the
agent to pick from, or downgrade to 'new_lead' on no match."
```

- [ ] **Step 7: STOP — request push**

Output: *"Phase 2 complete. Backend detection committed locally as `<hash>` (v1.13.9). Tests pass. Say 'push' to deploy."*

Do not proceed to Phase 3 until the user confirms.

---

## Phase 3 — Extract `ProlongationDialog` (v1.13.10)

This phase is a pure refactor: the existing manual-prolongation panel in `Contracts.jsx` becomes a reusable component. No behavior change. The component is what Phase 4 will reuse from the corbeille and the contract banner.

### Task 3.1: Create the component

**Files:**
- Create: `components/ProlongationDialog.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/prolongationDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../../lib/db.js', () => ({
  updateContract: vi.fn().mockResolvedValue(undefined),
  saveInvoice: vi.fn().mockResolvedValue(undefined),
  updateInvoice: vi.fn().mockResolvedValue(undefined),
  getInvoices: vi.fn().mockResolvedValue([]),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => opts?.defaultValue || k }),
}))

import ProlongationDialog from '../../components/ProlongationDialog.jsx'
import * as db from '../../lib/db.js'

const baseContract = {
  id: 'ctr-1',
  clientId: 'cli-1',
  clientName: 'Karim El Fassi',
  contractNumber: 'CTR-00003',
  vehicleId: 'veh-1',
  vehicleName: 'Audi A1',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  dailyRate: 200,
  totalTTC: 6000,
  days: 30,
}

beforeEach(() => {
  db.updateContract.mockClear()
  db.saveInvoice.mockClear()
  db.updateInvoice.mockClear()
  db.getInvoices.mockClear()
})

describe('ProlongationDialog', () => {
  it('pre-fills newEndDate from prefilledEndDate prop', () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    const dateInput = screen.getByLabelText(/date de fin/i)
    expect(dateInput.value).toBe('2026-09-15')
  })

  it('computes extra days and amount from contract endDate to new endDate', () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    // 31 Aug → 15 Sep = 15 extra days, rate 200, +3000
    expect(screen.getByText(/15 jour/i)).toBeInTheDocument()
    expect(screen.getByText(/3000/)).toBeInTheDocument()
  })

  it('calls updateContract and onConfirmed on confirm', async () => {
    const onConfirmed = vi.fn()
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={onConfirmed}
      />
    )
    fireEvent.click(screen.getByText(/confirmer/i))
    await waitFor(() => expect(db.updateContract).toHaveBeenCalled())
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
  })

  it('creates a new invoice when daily rate changes', async () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    const rateInput = screen.getByLabelText(/tarif/i)
    fireEvent.change(rateInput, { target: { value: '250' } })
    fireEvent.click(screen.getByText(/confirmer/i))
    await waitFor(() => expect(db.saveInvoice).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/prolongationDialog.test.jsx
```

Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `components/ProlongationDialog.jsx`. Extract the logic from `pages/Contracts.jsx` `confirmProlongation` (currently lines 187–242) and the JSX panel (currently lines 396–460):

```jsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateContract, saveInvoice, updateInvoice, getInvoices } from '../lib/db'

const daysBetween = (start, end) => {
  if (!start || !end) return 0
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

/**
 * Reusable prolongation dialog. Used by:
 *   - the contract panel in pages/Contracts.jsx (existing manual flow)
 *   - the prolongation corbeille card in components/LeadModal.jsx (Phase 4)
 *   - the prolongation banner on contract cards (Phase 4)
 *
 * On confirm: extends the contract via direct DB write (mirrors existing
 * behavior, not the unused backend /extend endpoint) and creates/updates
 * an invoice for the extra days.
 */
export default function ProlongationDialog({
  contract,
  vehicle,
  prefilledEndDate = '',
  onClose,
  onConfirmed,
}) {
  const { t } = useTranslation('contracts')
  const [newEndDate, setNewEndDate] = useState(prefilledEndDate || '')
  const [newDailyRate, setNewDailyRate] = useState(
    contract?.dailyRate || vehicle?.dailyRate || ''
  )
  const [msg, setMsg] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { extra, amount } = useMemo(() => {
    const e = daysBetween(contract?.endDate, newEndDate)
    const a = e * Number(newDailyRate || 0)
    return { extra: e, amount: a }
  }, [contract?.endDate, newEndDate, newDailyRate])

  const handleConfirm = async () => {
    if (!newEndDate || extra <= 0) return
    setSubmitting(true)
    setMsg(null)
    try {
      const rate = Number(newDailyRate)
      const extraAmount = extra * rate
      const newTotalTTC = (Number(contract.totalTTC) || 0) + extraAmount
      const newTotalHT = newTotalTTC / 1.20
      const newTva = newTotalTTC - newTotalHT
      const updated = {
        ...contract,
        endDate: newEndDate,
        days: (contract.days || daysBetween(contract.startDate, contract.endDate)) + extra,
        totalTTC: Math.round(newTotalTTC * 100) / 100,
        totalHT: Math.round(newTotalHT * 100) / 100,
        tva: Math.round(newTva * 100) / 100,
      }
      await updateContract(updated)

      const originalRate = Number(contract.dailyRate) || 0
      const rateChanged = rate !== originalRate && originalRate > 0
      if (rateChanged) {
        await saveInvoice({
          clientId: contract.clientId,
          clientName: contract.clientName,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          vehicleName: contract.vehicleName,
          items: [{ label: `Prolongation ${extra} jour(s)`, qty: extra, unitPrice: rate }],
          totalHT: Math.round((extraAmount / 1.20) * 100) / 100,
          tva: Math.round((extraAmount - extraAmount / 1.20) * 100) / 100,
          totalTTC: Math.round(extraAmount * 100) / 100,
          notes: 'Facture de prolongation',
        })
        setMsg(t('panel.extendSuccess', { defaultValue: 'Prolongation enregistrée.' }))
      } else {
        const invoices = await getInvoices()
        const existing = invoices.find(i => i.contractId === contract.id)
        if (existing) {
          await updateInvoice({
            ...existing,
            totalTTC: Math.round(((existing.totalTTC || 0) + extraAmount) * 100) / 100,
            totalHT: Math.round(((existing.totalHT || 0) + extraAmount / 1.20) * 100) / 100,
            tva: Math.round(((existing.tva || 0) + extraAmount - extraAmount / 1.20) * 100) / 100,
          })
        }
        setMsg(t('panel.extendSuccessUpdated', { defaultValue: 'Prolongation enregistrée (facture mise à jour).' }))
      }

      if (onConfirmed) onConfirmed(updated)
      if (onClose) onClose()
    } catch (err) {
      console.error('[ProlongationDialog] confirm error:', err)
      setMsg(t('panel.extendError', { defaultValue: 'Erreur lors de la prolongation. Veuillez réessayer.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        {t('panel.prolongationTitle', { defaultValue: 'Prolonger le contrat' })}
      </div>

      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {t('panel.newEndDate', { defaultValue: 'Nouvelle date de fin' })}
        </div>
        <input
          type="date"
          aria-label="Nouvelle date de fin"
          value={newEndDate}
          onChange={(e) => setNewEndDate(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {t('panel.dailyRate', { defaultValue: 'Tarif journalier (MAD)' })}
        </div>
        <input
          type="number"
          aria-label="Tarif journalier"
          value={newDailyRate}
          onChange={(e) => setNewDailyRate(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
      </label>

      {extra > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Prolongation : {extra} jour{extra > 1 ? 's' : ''} · +{amount} MAD
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{msg}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
        >
          {t('panel.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting || extra <= 0 || !newDailyRate}
          style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
        >
          {submitting
            ? t('panel.confirming', { defaultValue: 'Confirmation…' })
            : t('panel.confirmProlongation', { defaultValue: 'Confirmer la prolongation' })}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/prolongationDialog.test.jsx
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ProlongationDialog.jsx src/test/prolongationDialog.test.jsx
git commit -m "feat(ui): extract reusable ProlongationDialog component

Pure extraction of the prolongation form currently inline in
pages/Contracts.jsx. Behavior identical: direct updateContract write +
invoice creation/update on confirm. Will be reused by the corbeille
prolongation card and the contract banner in v1.14.0."
```

### Task 3.2: Wire `Contracts.jsx` to use the new component

**Files:**
- Modify: `pages/Contracts.jsx`

- [ ] **Step 1: Replace the inline panel with the new component**

In `pages/Contracts.jsx`:

1. At the top of the file, add:
   ```jsx
   import ProlongationDialog from '../components/ProlongationDialog'
   ```

2. Delete the existing `confirmProlongation` function (lines 187–242).

3. Delete the existing `openProlonger` body — keep the function but simplify:
   ```jsx
   const openProlonger = (_contract) => {
     setProlongMsg(null)
     setShowProlonger(true)
   }
   ```
   (The form state `prolongForm` is no longer needed — the dialog owns it. Remove the `prolongForm` and `setProlongForm` declarations from the component state.)

4. Replace the JSX panel (currently lines 396–460) with:
   ```jsx
   {showProlonger && panelContract && (
     <ProlongationDialog
       contract={panelContract}
       vehicle={panelVehicle}
       onClose={() => setShowProlonger(false)}
       onConfirmed={async () => {
         const refreshed = await getContracts()
         setContracts(refreshed)
         setShowProlonger(false)
       }}
     />
   )}
   ```

5. Verify no other usage of the deleted symbols (`prolongForm`, `setProlongForm`, `confirmProlongation`). If found, remove or update.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. The existing Contracts page still works manually (verify visually after push).

- [ ] **Step 3: Bump version**

`components/Sidebar.jsx` line 167: `v1.13.9` → `v1.13.10`.

- [ ] **Step 4: Commit**

```bash
git add pages/Contracts.jsx components/Sidebar.jsx
git commit -m "ref(contracts): wire pages/Contracts.jsx to use ProlongationDialog (v1.13.10)

Behavior-preserving refactor. The manual Prolonger button on a contract
panel now opens the extracted component instead of an inline form.
Refresh-after-confirm happens via the onConfirmed callback."
```

- [ ] **Step 5: STOP — request push**

Output: *"Phase 3 complete. Refactor committed locally as `<hash>` (v1.13.10). Manual prolongation flow visually verifiable on staging — please verify after push, then say 'continue Phase 4'."*

---

## Phase 4 — UI surfaces + i18n (v1.14.0)

### Task 4.1: Add i18n strings

**Files:**
- Modify: `public/locales/fr/contracts.json`
- Modify: `public/locales/ar/contracts.json`
- Modify: `public/locales/en/contracts.json`

- [ ] **Step 1: Edit `public/locales/fr/contracts.json`**

Find the `"panel": { ... }` object and add the new keys (alphabetize where appropriate):

```json
"panel": {
  ...,
  "prolongationBadge": "Prolongation",
  "prolongationRequestedUntil": "Prolongation demandée jusqu'au {{date}}",
  "prolongationOther_one": "+{{count}} autre",
  "prolongationOther_other": "+{{count}} autres",
  "prolongationCTA": "Prolonger contrat →",
  "prolongationView": "Voir",
  "prolongationRefuse": "Refuser",
  "prolongationPickContract": "Quel contrat prolonger ?",
  "prolongationRefContract": "Contrat {{number}} — {{vehicle}} — {{client}}"
}
```

- [ ] **Step 2: Edit `public/locales/ar/contracts.json`** with the same keys translated to Moroccan Arabic. Use these translations:

```json
"panel": {
  ...,
  "prolongationBadge": "تمديد",
  "prolongationRequestedUntil": "طلب تمديد إلى {{date}}",
  "prolongationOther_one": "+{{count}} آخر",
  "prolongationOther_other": "+{{count}} أخرى",
  "prolongationCTA": "تمديد العقد ←",
  "prolongationView": "عرض",
  "prolongationRefuse": "رفض",
  "prolongationPickContract": "أي عقد تريد تمديده؟",
  "prolongationRefContract": "عقد {{number}} — {{vehicle}} — {{client}}"
}
```

- [ ] **Step 3: Edit `public/locales/en/contracts.json`** with the same keys in English:

```json
"panel": {
  ...,
  "prolongationBadge": "Extension",
  "prolongationRequestedUntil": "Extension requested until {{date}}",
  "prolongationOther_one": "+{{count}} more",
  "prolongationOther_other": "+{{count}} more",
  "prolongationCTA": "Extend contract →",
  "prolongationView": "View",
  "prolongationRefuse": "Decline",
  "prolongationPickContract": "Which contract to extend?",
  "prolongationRefContract": "Contract {{number}} — {{vehicle}} — {{client}}"
}
```

- [ ] **Step 4: Commit**

```bash
git add public/locales/fr/contracts.json public/locales/ar/contracts.json public/locales/en/contracts.json
git commit -m "i18n: add prolongation strings (fr, ar, en)"
```

### Task 4.2: Corbeille card — prolongation variant

**Files:**
- Modify: `components/LeadModal.jsx`
- Create: `src/test/leadModalProlongation.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/leadModalProlongation.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => opts?.defaultValue || k }),
}))

vi.mock('../../lib/db.js', () => ({
  getContractById: vi.fn().mockResolvedValue({
    id: 'ctr-1',
    contractNumber: 'CTR-00003',
    vehicleName: 'Audi A1',
    clientName: 'Karim El Fassi',
    endDate: '2026-08-31',
    dailyRate: 200,
    totalTTC: 6000,
  }),
  getVehicle: vi.fn().mockResolvedValue({ id: 'veh-1', dailyRate: 200 }),
  updateContract: vi.fn().mockResolvedValue(undefined),
  saveInvoice: vi.fn().mockResolvedValue(undefined),
  updateInvoice: vi.fn().mockResolvedValue(undefined),
  getInvoices: vi.fn().mockResolvedValue([]),
}))

import LeadModal from '../../components/LeadModal.jsx'

const prolongationLead = {
  id: 'lead-1',
  classification: 'prolongation',
  status: 'pending',
  prolongation_target_contract_id: 'ctr-1',
  extracted_data: {
    classification: 'prolongation',
    summary_for_agent: 'Client wants to extend until 15 Sept',
    end_date: '2026-09-15',
  },
}

const multiCandidateLead = {
  id: 'lead-2',
  classification: 'prolongation',
  status: 'pending',
  prolongation_target_contract_id: null,
  extracted_data: {
    classification: 'prolongation',
    end_date: '2026-09-15',
    prolongation_candidates: ['ctr-1', 'ctr-2'],
  },
}

beforeEach(() => vi.clearAllMocks())

describe('LeadModal — prolongation variant', () => {
  it('renders the Prolongation badge for prolongation leads', () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(screen.getByText(/prolongation/i)).toBeInTheDocument()
  })

  it('renders the Prolonger contrat CTA for a linked prolongation lead', () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(screen.getByRole('button', { name: /prolonger contrat/i })).toBeEnabled()
  })

  it('disables the CTA when multi-candidate lead has no selection', () => {
    render(<LeadModal lead={multiCandidateLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(screen.getByRole('button', { name: /prolonger contrat/i })).toBeDisabled()
  })

  it('opens the ProlongationDialog when CTA clicked', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /prolonger contrat/i }))
    expect(await screen.findByLabelText(/nouvelle date de fin/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/leadModalProlongation.test.jsx
```

Expected: FAIL — the prolongation CTA does not exist yet.

- [ ] **Step 3: Modify `LeadModal.jsx`**

In `components/LeadModal.jsx`:

1. Add imports at top:
   ```jsx
   import { useState, useEffect } from 'react'
   import ProlongationDialog from './ProlongationDialog'
   import { getContractById, getVehicle } from '../lib/db'
   ```
   (`useState`, `useEffect` may already be imported — verify.)

2. Inside the component, add state for the prolongation flow:
   ```jsx
   const [showProlongDialog, setShowProlongDialog] = useState(false)
   const [targetContract, setTargetContract] = useState(null)
   const [targetVehicle, setTargetVehicle] = useState(null)
   const [pickedContractId, setPickedContractId] = useState(
     lead.prolongation_target_contract_id || ''
   )
   ```

3. Lookup the linked contract when the modal mounts:
   ```jsx
   useEffect(() => {
     const id = lead.prolongation_target_contract_id || pickedContractId
     if (!id) return
     let cancelled = false
     ;(async () => {
       const c = await getContractById(id)
       if (cancelled || !c) return
       setTargetContract(c)
       if (c.vehicleId) {
         const v = await getVehicle(c.vehicleId)
         if (!cancelled) setTargetVehicle(v)
       }
     })()
     return () => { cancelled = true }
   }, [lead.prolongation_target_contract_id, pickedContractId])
   ```

4. Inside the classification block (around current line 188, just before the closing `</div>` of the "Routing lead" branch), add the prolongation-specific UI:

   ```jsx
   {extracted.classification === 'prolongation' && (
     <div style={{ marginTop: 16, padding: 12, background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.15)' }}>
       {targetContract ? (
         <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
           {t('panel.prolongationRefContract', {
             defaultValue: 'Contrat {{number}} — {{vehicle}} — {{client}}',
             number: targetContract.contractNumber,
             vehicle: targetContract.vehicleName,
             client: targetContract.clientName,
           })}
         </div>
       ) : extracted.prolongation_candidates?.length > 1 ? (
         <div>
           <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
             {t('panel.prolongationPickContract', { defaultValue: 'Quel contrat prolonger ?' })}
           </div>
           <select
             value={pickedContractId}
             onChange={(e) => setPickedContractId(e.target.value)}
             style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
           >
             <option value="">—</option>
             {extracted.prolongation_candidates.map(id => (
               <option key={id} value={id}>{id}</option>
             ))}
           </select>
         </div>
       ) : null}
     </div>
   )}
   ```
   (You'll need `useTranslation` imported and `const { t } = useTranslation('contracts')` inside the component. Verify whether this is already imported — if not, add it.)

5. In the footer button row (around current line 237), make the prolongation buttons additive rather than replacing the existing footer.

   First, **gate the existing footer buttons** so they don't render for prolongation leads. Wrap the existing `Ignorer` / `Sauvegarder` / `Préparer Devis` block (around the existing lines 238–294) in a conditional:

   ```jsx
   {extracted.classification !== 'prolongation' && (
     <>
       {/* existing footer button JSX stays exactly as it is — no edits inside */}
     </>
   )}
   ```

   To avoid touching the existing button code, place this opening fragment immediately BEFORE the existing `<button>` for Ignorer (current line 238), and place the matching `)}` AFTER the closing tag of the last existing button in the footer (the Convertir button, around line 294). The buttons themselves stay byte-for-byte identical — you only insert one opening fragment and one closing fragment around them.

   Then, **add the prolongation footer block** as a sibling inside the same footer div, immediately AFTER the gated existing block:

   ```jsx
   {extracted.classification === 'prolongation' && localStatus === 'pending' && (
     <>
       <button
         onClick={() => {
           onClose()
           Promise.resolve(onStatusChange(lead.id, 'ignored')).catch(() => {})
         }}
         style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
       >
         {t('panel.cancel', { defaultValue: 'Ignorer' })}
       </button>
       <button
         onClick={() => {
           onClose()
           Promise.resolve(onStatusChange(lead.id, 'ignored')).catch(() => {})
         }}
         style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
       >
         {t('panel.prolongationRefuse', { defaultValue: 'Refuser' })}
       </button>
       <button
         onClick={() => setShowProlongDialog(true)}
         disabled={!targetContract}
         style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: targetContract ? 'pointer' : 'not-allowed', fontSize: 13, opacity: targetContract ? 1 : 0.5 }}
       >
         {t('panel.prolongationCTA', { defaultValue: 'Prolonger contrat →' })}
       </button>
     </>
   )}
   ```

   Note: `Refuser` currently does the same `status='ignored'` write as `Ignorer`. The spec mentions adding a conversation-log audit tag to differentiate; that's deferred — see "Out-of-scope follow-ups" at the end of this plan.

6. After the modal body, render the dialog overlay when `showProlongDialog`:

   ```jsx
   {showProlongDialog && targetContract && (
     <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
       <div style={{ maxWidth: 480, width: '90%' }}>
         <ProlongationDialog
           contract={targetContract}
           vehicle={targetVehicle}
           prefilledEndDate={extracted.end_date || ''}
           onClose={() => setShowProlongDialog(false)}
           onConfirmed={() => {
             setShowProlongDialog(false)
             onClose()
             Promise.resolve(onStatusChange(lead.id, 'accepted')).catch(() => {})
           }}
         />
       </div>
     </div>
   )}
   ```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/test/leadModalProlongation.test.jsx
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/LeadModal.jsx src/test/leadModalProlongation.test.jsx
git commit -m "feat(ui): prolongation variant of LeadModal — contract ref, candidate picker, dialog launcher

When a lead's classification is 'prolongation' the modal swaps the
footer buttons for Ignorer / Refuser / Prolonger contrat → and shows a
reference card with the linked contract. Multi-candidate leads render
a select; the CTA stays disabled until the agent picks one. CTA opens
the shared ProlongationDialog overlay."
```

### Task 4.3: Contract banner

**Files:**
- Modify: `pages/Contracts.jsx`

- [ ] **Step 1: Fetch pending prolongation leads when contracts load**

In `pages/Contracts.jsx`, find the existing `useEffect` that loads contracts (search for `getContracts()` invocation in a load effect). Add a parallel fetch from `supabase`:

```jsx
import { supabase } from '../lib/supabase'
```

In the load effect:

```jsx
const [prolongLeadsByContract, setProlongLeadsByContract] = useState({})

useEffect(() => {
  let cancelled = false
  ;(async () => {
    const all = await getContracts()
    if (cancelled) return
    setContracts(all)
    const ids = all.map(c => c.id)
    if (!ids.length) return
    const { data: leads } = await supabase
      .from('pending_demands')
      .select('id, prolongation_target_contract_id, extracted_data, created_at')
      .eq('status', 'pending')
      .eq('classification', 'prolongation')
      .in('prolongation_target_contract_id', ids)
      .order('created_at', { ascending: false })
    if (cancelled) return
    const byContract = {}
    for (const l of (leads || [])) {
      const cid = l.prolongation_target_contract_id
      if (!cid) continue
      if (!byContract[cid]) byContract[cid] = []
      byContract[cid].push(l)
    }
    setProlongLeadsByContract(byContract)
  })()
  return () => { cancelled = true }
}, [])
```

- [ ] **Step 2: Render the banner above each affected contract card**

Find the loop that renders contract cards (the `.map(c => ...)` in the JSX). Add the banner inside each card:

```jsx
{prolongLeadsByContract[c.id]?.length > 0 && (
  <div style={{ padding: '6px 10px', background: 'rgba(59,130,246,0.08)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.2)', fontSize: 12, color: '#2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
    <span>
      🔔 {t('panel.prolongationRequestedUntil', {
        defaultValue: 'Prolongation demandée jusqu\'au {{date}}',
        date: prolongLeadsByContract[c.id][0].extracted_data?.end_date,
      })}
      {prolongLeadsByContract[c.id].length > 1 && (
        <span style={{ marginLeft: 8, opacity: 0.7 }}>
          {t('panel.prolongationOther', {
            defaultValue: '+{{count}} autres',
            count: prolongLeadsByContract[c.id].length - 1,
          })}
        </span>
      )}
    </span>
    <button
      onClick={(e) => {
        e.stopPropagation()
        setSelected(c.id)
        setShowProlonger(true)
      }}
      style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, cursor: 'pointer' }}
    >
      {t('panel.prolongationView', { defaultValue: 'Voir' })} →
    </button>
  </div>
)}
```

- [ ] **Step 3: Pre-fill the dialog with the requested end date when opened from the banner**

The `ProlongationDialog` invocation in `pages/Contracts.jsx` (set up in Task 3.2) currently has no `prefilledEndDate` prop. Pass the pending lead's end_date when one exists:

```jsx
{showProlonger && panelContract && (
  <ProlongationDialog
    contract={panelContract}
    vehicle={panelVehicle}
    prefilledEndDate={prolongLeadsByContract[panelContract.id]?.[0]?.extracted_data?.end_date || ''}
    onClose={() => setShowProlonger(false)}
    onConfirmed={async () => {
      // Patch all linked prolongation leads to accepted
      const linked = prolongLeadsByContract[panelContract.id] || []
      if (linked.length) {
        await supabase
          .from('pending_demands')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .in('id', linked.map(l => l.id))
      }
      const refreshed = await getContracts()
      setContracts(refreshed)
      setProlongLeadsByContract({})
      setShowProlonger(false)
    }}
  />
)}
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Bump version**

`components/Sidebar.jsx` line 167: `v1.13.10` → `v1.14.0`.

- [ ] **Step 6: Commit**

```bash
git add pages/Contracts.jsx components/Sidebar.jsx
git commit -m "feat(contracts): prolongation banner on active contract cards (v1.14.0)

Fetches pending prolongation leads alongside the contracts list, groups
them by target contract id, and renders a small blue banner above any
contract card with an outstanding request. The banner's Voir button
opens the existing side panel and auto-launches the prolongation dialog
pre-filled with the requested end date. Confirmation patches all linked
leads to accepted in one go."
```

- [ ] **Step 7: STOP — request push**

Output: *"Phase 4 complete. v1.14.0 committed locally as `<hash>`. End-to-end prolongation flow is in place. Say 'push' to deploy."*

---

## Self-review checklist (run after the plan above is implemented)

After all four phases ship:

- [ ] Send a test prolongation email from a Gmail address that matches an active-contract client's email. Verify the corbeille shows a `Prolongation` badge with the contract reference.
- [ ] Verify the Contracts page shows the banner on that contract card.
- [ ] Click the corbeille CTA → dialog opens with `end_date` pre-filled.
- [ ] Confirm → contract `end_date` updated, invoice updated, lead status = `accepted`, banner gone, badge gone.
- [ ] Edge case: send another prolongation from a sender with no email on file → should appear as `new_lead` (downgrade).
- [ ] Edge case: send a prolongation from a client with 2 active contracts (manually engineered) → corbeille shows candidate picker.

---

## Out-of-scope follow-ups (do NOT include in this plan)

- Auto-reply email/WhatsApp confirming the extension to the client.
- Retroactive script to re-classify pre-shipping `new_lead`s where sender matches an active-contract client.
- Removal of unused backend `POST /contracts/:id/extend` endpoint (separate cleanup task).
- Calendar / Dashboard surfacing.
- Supplementary contract / extension PDF document.
- Conversation-log audit tag for the `Refuser` action (distinct from `Ignorer`). The two buttons currently produce the same `status='ignored'` outcome — only the label differs. A future task can extend `onStatusChange` consumers to record the tag.

These are tracked in the spec's "Open follow-ups" section.
