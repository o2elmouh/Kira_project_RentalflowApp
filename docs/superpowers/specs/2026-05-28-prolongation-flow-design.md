# Prolongation flow — design spec

**Status:** approved
**Date:** 2026-05-28
**Target versions:** v1.13.8 → v1.14.0 (staged across 4 deploys)
**Author:** otman / Claude session

## Problem

A client with an active rental contract emails the agency to ask for a rental extension ("prolongation"). The system today does one of two things, both wrong:

1. Classifies the inbound message as `new_lead` and creates a brand-new corbeille entry covering the full requested period (e.g. 1 August → 15 September instead of "extend by 15 days"). The agent has no signal that the message relates to an existing contract.
2. Even if classification were correct, there is no UI flow that turns a prolongation lead into an extension of the existing contract — only conversion to a new contract.

Concrete trigger: active contract 1–31 August. Client emails *"je veux prolonger jusqu'au 15 septembre."* The corbeille shows a new lead with dates 2026-08-01 → 2026-09-15.

## Root causes

### Detection (Layer A)
- `server/routes/leads.js` Gmail webhook calls `classifyTextMessage(text, 'no_contract')` with `clientStatus` hardcoded to `'no_contract'`. Claude never sees that the sender is a recognized active-contract client, so the routing prompt cannot reach the `prolongation` branch.
- `getClientStatus` exists for WhatsApp (phone-based lookup) but no equivalent for Gmail (email-based lookup).
- Even when WhatsApp classifies correctly, the lead is not linked to a specific contract — there is no `prolongation_target_contract_id` on `pending_demands`.

### Resolution (Layer B)
- `pages/Contracts.jsx` already has a working manual prolongation flow: open a panel → enter new end date + daily rate → confirm → `updateContract` + `saveInvoice` directly via the frontend. The backend `/contracts/:id/extend` endpoint exists but is unused by the UI.
- The corbeille (`LeadModal` / `Basket.jsx`) has no awareness of prolongation: its action buttons are *Ignorer / Sauvegarder / Préparer Devis / Convertir en contrat* — none of which resolve a prolongation request.
- The Contracts page has no surface for incoming prolongation requests; the agent must coincidentally notice the lead in the corbeille and remember to act on the contract side.

## Goals

1. Detect prolongation intent from both Gmail and WhatsApp inbound messages when the sender matches a client with an active contract.
2. Surface the request in two places: the corbeille AND the relevant contract card.
3. Let the agent resolve the request in one extra click from either surface (the existing extend dialog, pre-filled with the requested new end date).
4. Reuse the existing manual-prolongation logic — no parallel code path, no new server endpoint.

## Non-goals (v1)

- No auto-reply to the client after confirmation.
- No retroactive re-classification of leads created before this ships.
- No supplementary contract or extension PDF generation.
- No notifications on the dashboard or calendar.
- No redesign of the existing manual *Prolonger* button — only an under-the-hood refactor to share code.
- No deletion of the unused backend `/contracts/:id/extend` endpoint (separate cleanup task).

## Design

### Decision matrix (Layer A inputs)

After classification, the inbound pipeline runs `findActiveContractsForClient(agencyId, clientId)` whenever `classification === 'prolongation'`:

| Sender match | Active contracts found | classification stored | `prolongation_target_contract_id` | `extracted_data.prolongation_candidates` |
|---|---|---|---|---|
| No client record | n/a | downgraded to `new_lead` | NULL | — |
| Client found | 0 | downgraded to `new_lead` | NULL | — |
| Client found | 1 | `prolongation` | that contract's id | — |
| Client found | 2+ | `prolongation` | NULL | `[id1, id2, …]` |

The downgrade ensures unmatched prolongation requests do not get stuck in a UI state with no available contract to act on; they surface as ordinary new leads and the agent can manually link a client.

### Lifecycle (Layer B states)

A prolongation lead reuses the existing `pending_demands.status` enum — no new state machine:

- `pending` → waiting for the agent
- `accepted` → agent confirmed the extension; lead removed from corbeille and from the contract banner
- `ignored` → agent dismissed (covers both "Ignorer" and "Refuser"; the difference is only recorded in the conversation log)

### Schema change

```sql
-- supabase/migrations/20260528_prolongation_target_contract.sql
ALTER TABLE pending_demands
  ADD COLUMN prolongation_target_contract_id UUID
  REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pending_demands_prolongation_target_idx
  ON pending_demands (prolongation_target_contract_id)
  WHERE prolongation_target_contract_id IS NOT NULL;
```

The partial index supports the contract-banner query without overhead on non-prolongation rows.

### Components and files affected

| Layer | File | Change |
|---|---|---|
| Schema | `supabase/migrations/20260528_prolongation_target_contract.sql` | new |
| Backend lib | `server/routes/leads.js` (or `server/lib/inboundPipeline.js`) | add `getClientStatusByEmail`, `findActiveContractsForClient` |
| Backend webhook | `server/routes/leads.js` Gmail webhook | replace hardcoded `'no_contract'` with `getClientStatusByEmail` call; apply decision matrix |
| Backend handler | `server/routes/leads.js` `handleInboundWhatsApp` | apply decision matrix after WhatsApp classification |
| Reusable UI | `components/ProlongationDialog.jsx` | new — extracted from `Contracts.jsx` lines 396–460 |
| Existing UI | `pages/Contracts.jsx` | uses new dialog; adds banner above contract cards |
| Corbeille UI | `components/LeadModal.jsx` and/or `pages/Basket.jsx` | render PROLONGATION badge, contract reference, candidate selector, action button row |
| i18n | `public/locales/{fr,ar,en}/{contracts,common}.json` | new keys (see below) |

### Data flow

```
Inbound email/whatsapp
        │
        ▼
preFilter (keyword)
        │
        ▼
classifyTextMessage(text, clientStatus)   <-- Gmail now passes real status
        │
        ├── classification === 'prolongation' ──┐
        │                                       │
        │                                       ▼
        │                          findActiveContractsForClient
        │                                       │
        │           ┌───────────────────────────┼───────────────────────────┐
        │           ▼                           ▼                           ▼
        │   0 contracts → downgrade        1 contract                  2+ contracts
        │   to new_lead, NULL target       set target id              store candidate ids
        │           │                           │                           │
        ▼           ▼                           ▼                           ▼
new_lead path                       insert pending_demands row with classification='prolongation'
                                          │
                                          ▼
                          Corbeille card + (if target set) contract banner
                                          │
                                  agent clicks "Prolonger contrat →"
                                          │
                                          ▼
                              ProlongationDialog (pre-filled end_date)
                                          │
                                  agent confirms
                                          │
                                          ▼
                          updateContract + saveInvoice (existing logic)
                                          │
                                          ▼
                          patch pending_demands.status='accepted'
```

### Component spec: `ProlongationDialog.jsx`

```js
ProlongationDialog({
  contract,            // full contract object
  vehicle,             // joined vehicle (for default daily rate)
  prefilledEndDate,    // string YYYY-MM-DD or null
  onClose,             // called on cancel and after success
  onConfirmed,         // called after successful extend (passes the updated contract)
})
```

Internal state:
- `newEndDate` (init: `prefilledEndDate` or `''`)
- `newDailyRate` (init: `contract.dailyRate ?? vehicle.dailyRate ?? ''`)
- `msg` (success / error string)

Body:
- Date input bound to `newEndDate`
- Rate input bound to `newDailyRate`
- Computed preview line: `"X jours · +Y MAD"`

CTA row: *Annuler* · *Confirmer la prolongation*.

On confirm: the function that today lives as `confirmProlongation` in `Contracts.jsx` (frontend write via `updateContract` + invoice handling). After success, call `onConfirmed(updatedContract)` then `onClose()`.

### Corbeille card spec (prolongation variant)

When `lead.classification === 'prolongation'`:

- Header: orange `PROLONGATION` badge, replaces the green `NOUVEAU LEAD` badge.
- Subtitle: `Contrat {contractNumber} — {vehicle} — {clientName}`, fetched from a joined lookup. Only rendered when `prolongation_target_contract_id` is set.
- Multi-candidate state: instead of subtitle, a small select listing each candidate `Contrat CTR-XXXX — {vehicle}`. The "Prolonger contrat →" button is disabled until one is picked. Picking writes the chosen contract id into local component state — no DB write until confirmation.
- Dates section: shows only `Date de fin demandée: {extracted_data.end_date}`. `start_date` and `requested_car` rows are hidden — they aren't meaningful for an extension.
- Body: `extracted_data.summary_for_agent` (Claude's summary), unchanged.
- Bottom button row:
  - **Ignorer** — existing handler, status → `ignored`, no log tag.
  - **Refuser** — same status change, but appends a conversation log entry `{ role: 'agent', type: 'prolongation_refused' }` for audit.
  - **Prolonger contrat →** — opens `ProlongationDialog` with `contract = the matched contract`, `prefilledEndDate = extracted_data.end_date`. On `onConfirmed`, patches the lead to `accepted`.

### Contract banner spec

In `Contracts.jsx`, after the contracts list loads:

```js
const { data: prolongLeads } = await supabaseAdmin
  .from('pending_demands')
  .select('id, prolongation_target_contract_id, extracted_data, created_at')
  .eq('agency_id', agencyId)
  .eq('status', 'pending')
  .eq('classification', 'prolongation')
  .in('prolongation_target_contract_id', visibleContractIds)
  .order('created_at', { ascending: false })
```

Build a map `contractId → leadsArray`. For each contract card, if the map has an entry:

```
┌─────────────────────────────────────────────────────────┐
│ 🔔 Prolongation demandée jusqu'au {end_date}   [Voir →] │
└─────────────────────────────────────────────────────────┘
```

If multiple leads exist for the same contract (client emailed twice), show the most recent and append `+N autre(s)` next to the date.

`[Voir →]` opens the existing side panel for that contract and auto-opens `ProlongationDialog` with the lead's `extracted_data.end_date`. After confirmation:
- Lead status → `accepted` (patches all linked leads for that contract, not just the displayed one).
- Banner disappears on next list refresh.

### i18n keys

`public/locales/fr/contracts.json`:
- `panel.prolongationBadge`: "Prolongation"
- `panel.prolongationRequestedUntil`: "Prolongation demandée jusqu'au {{date}}"
- `panel.prolongationOther`: "+{{count}} autre"
- `panel.prolongationOtherPlural`: "+{{count}} autres"
- `panel.prolongationCTA`: "Prolonger contrat →"
- `panel.prolongationView`: "Voir"
- `panel.prolongationRefuse`: "Refuser"
- `panel.prolongationPickContract`: "Quel contrat prolonger ?"
- `panel.prolongationRefContract`: "Contrat {{number}} — {{vehicle}} — {{client}}"

Same keys mirrored in `ar/contracts.json` and `en/contracts.json`.

### API surface

No new backend endpoints. Reuses:
- `supabase` direct read for `pending_demands` (already used elsewhere)
- `updateContract`, `saveInvoice`, `updateInvoice`, `getInvoices` from `lib/db.js` (already used by today's `confirmProlongation`)
- Lead status patch through the same Supabase admin path used by the existing Ignorer flow

### Failure handling

| Failure | Behavior |
|---|---|
| Email-based client lookup throws | Fall back to `'no_contract'` (graceful, same as WhatsApp's `getClientStatus` catch) |
| `findActiveContractsForClient` throws | Treat as 0 matches → downgrade to `new_lead` |
| `updateContract` fails inside dialog | Show error toast in dialog, lead stays `pending`, no state mutation |
| Lead status patch fails after successful extension | Log error; contract is correctly extended; lead reverts to `pending` and shows again on next load — agent can manually Ignorer |

The dialog never auto-closes on partial failure; the agent gets an explicit error string.

## Testing

Per CLAUDE.md #8, every new behavior gets a test.

| Test file | Asserts |
|---|---|
| `server/__tests__/prolongationMatching.test.js` | `getClientStatusByEmail` returns `'active_contract'` only when a matching client has any active contract; `findActiveContractsForClient` returns 0/1/N rows; downgrade rule applied when 0 matches |
| `server/__tests__/gmailProlongationClassify.test.js` | Gmail webhook calls `classifyTextMessage` with `'active_contract'` (not hardcoded) when sender matches an active-contract client |
| `src/test/prolongationDialog.test.jsx` | Extra days computed correctly across month boundaries; rate-change path creates a new invoice; no rate change updates the existing invoice; cancel resets state |
| `src/test/leadModalProlongation.test.jsx` | Card renders PROLONGATION badge when classification matches; multi-candidate dropdown gates the CTA; on-success patches lead status |

All under `npm run test` (vitest). Total expected: +12–15 new tests.

## Rollout

Each step is independently shippable on `staging`. Push only on explicit user instruction per CLAUDE.md #7.

| Step | Version | Risk |
|---|---|---|
| 1. Schema migration | v1.13.8 | Low — additive column, no rows touched |
| 2. Backend detection (decision matrix + helpers) | v1.13.9 | Medium — affects every inbound classification path; covered by tests |
| 3. Extract `ProlongationDialog` (pure refactor) | v1.13.10 | Low — behavior identical, surface verified by existing manual flow |
| 4–6. UI surfaces + i18n | v1.14.0 | Medium — user-visible changes; minor bump |

Migration step 1 can be deployed alone safely; the column simply isn't read until step 2 backfills it for new leads. Old leads remain `null` and continue to render as today.

## Open follow-ups (out of v1)

- Auto-reply to the client after confirmed extension (Resend + WhatsApp templates).
- Decide fate of unused backend `/contracts/:id/extend` endpoint — either wire the UI to it for consistency, or remove it.
- Calendar/Dashboard surfacing (current scope is corbeille + contract card only).
- Retroactive scan: a one-time script to re-classify existing `new_lead`s whose sender has an active contract.
- Supplementary contract document / extension addendum PDF — currently extension is invoice-only.

## Function reference index — landed in v1.13.8 → v1.14.2

Code identifiers (with exact source paths) that implement this spec. Keep
this list in sync with the actual exports so it's grep-friendly and
graphify can build edges from this document into the code graph.

### Backend
- `getClientStatusByEmail(agencyId, senderEmail)` — `server/routes/leads.js`
  Mirrors `getClientStatus` but matches `clients.email`. Returns
  `'active_contract' | 'no_contract'`. Used by the Gmail webhook before
  calling `classifyTextMessage`.
- `findActiveContractsForClient(agencyId, clientId)` — `server/routes/leads.js`
  Returns the client's active `contracts` rows newest-first. Drives the
  0 / 1 / 2+ decision matrix.
- `classifyTextMessage(bodyText, clientStatus)` — `server/routes/leads.js`
  Runs `ROUTING_SYSTEM_PROMPT` against Claude haiku. Returns
  `{classification, confidence, summary_for_agent, extracted_data}`.
- `handleInboundWhatsApp(agencyId, senderJid, imageBuffer, mimeType, bodyText)` — `server/routes/leads.js`
  WhatsApp inbound entry point. Houses the WhatsApp half of the
  decision matrix.

### Frontend (shared)
- `ProlongationDialog({ contract, vehicle, prefilledEndDate, onClose, onConfirmed })` — `components/ProlongationDialog.jsx`
  Reusable dialog used by both the contract panel and the corbeille's
  prolongation CTA.
- `ContractDetailPanel({…})` — `components/ContractDetailPanel.jsx`
  Side panel extracted from `pages/Contracts.jsx` so the panel state is
  isolated and the page stays readable.
- `ProlongationBanner({ leads, colSpan, onView })` — `components/ProlongationBanner.jsx`
  The 🔔 row above each contract card that has a pending prolongation lead.
- `acceptProlongationLeadsForContract(contractId, prolongLeadsByContract, api)` — `utils/contractActions.js`
  Patches every linked prolongation lead to `status='accepted'` via
  `api.updateLeadStatus`. Failures are logged, never re-thrown.
- `describeSignatureState(contract)` — `utils/contractSuccess.js`
  Helper for the `ContractSuccess` heading/subline (electronic vs in-person flow).

### Database
- `pending_demands.prolongation_target_contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL`
  Migration: `supabase/migrations/20260528_prolongation_target_contract.sql`.

### Tests
- `server/__tests__/prolongationMatching.test.js`
- `server/__tests__/gmailProlongationClassify.test.js`
- `server/__tests__/offerResponseTriageGate.test.js`
- `src/test/prolongationDialog.test.jsx`
- `src/test/leadModalProlongation.test.jsx`
- `src/test/contractActions.test.js`
