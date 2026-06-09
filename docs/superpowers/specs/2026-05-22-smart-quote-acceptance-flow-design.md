# Smart Quote Acceptance Flow — Design

**Date:** 2026-05-22
**Status:** Approved by user, ready for implementation plan
**Scope:** Offer message content, client reply handling, post-acceptance OCR routing, CNDP compliance page

---

## Problem

Three distinct gaps in the current WhatsApp offer pipeline:

1. **No data-protection disclosure.** The offer message sent to clients does not reference the Moroccan data protection law (09-08) or link to a privacy policy. This is a CNDP compliance gap.
2. **"Yes" replies are silently dropped on the floor.** `handleOfferResponse()` in `server/routes/leads.js` computes the client's intent via Claude but then unconditionally sets `status='waiting'`, regardless of whether the client accepted, refused, or asked a question. An orphaned `handleQuoteReply()` function has the correct branching logic but is never called from the inbound path. Result: accepted offers do not surface to the agent as accepted; the lead drops back to "Devis à préparer" with the agent's only signal being a buried `intent` field inside `raw_payload.replies[]`.
3. **Documents sent after acceptance create duplicate leads.** When an accepted client sends their CIN/permis photos, `findOfferSentLeadByPhone()` does not match (because the lead is no longer in `offer_sent` status). The photos fall through to normal triage, run OCR, and create a brand-new `pending_demands` row — disconnected from the original accepted lead.

Secondary issue: the SmartQuotePanel does not pre-fill `startDate` / `endDate` from the lead's `extracted_data`, forcing the agent to re-enter dates the AI already extracted.

---

## Goals

- Every offer message includes a CNDP loi 09-08 disclosure with a link to a hosted privacy page.
- Client "yes" replies move the lead to `accepted` status, fire an agency notification, and send the client an auto-acknowledgment asking only for documents not already extracted.
- Documents sent by accepted (or offer_sent) clients are merged into the existing lead's `extracted_data` rather than creating a new lead.
- Dates extracted by the AI from the first message flow through automatically into the offer.
- All status transitions remain observable in `raw_payload.replies[]` for the agent timeline.

## Non-goals

- Auto-converting an `accepted` lead to a rental contract (agent still clicks "Convert").
- Validating CIN / permis expiry dates or document authenticity.
- Per-agency customisation of the privacy page (single static page for all agencies in this iteration).
- Replacing the OCR / extraction model.

---

## Architecture Overview

```
Inbound WhatsApp message
        │
        ▼
┌─────────────────────────┐
│ findActiveLeadByPhone() │── matches status IN ('offer_sent', 'accepted')
└─────────────────────────┘
        │
        ├── match found?
        │       │
        │       ├── status = offer_sent
        │       │       ├── text  → handleOfferResponse()  ──┐
        │       │       └── image → mergeOcrIntoLead()       │
        │       │                                            │
        │       └── status = accepted                        │
        │               ├── text  → append to replies        │
        │               └── image → mergeOcrIntoLead()       │
        │                                                    │
        └── no match → existing triage / classification path │
                                                             │
                                                             ▼
                                            ┌─────────────────────────┐
                                            │   analyzeQuoteReply()   │ (Claude Haiku)
                                            └─────────────────────────┘
                                                             │
                                ┌────────────────────────────┼────────────────────────────┐
                                ▼                            ▼                            ▼
                          intent = accepted            intent = rejected            intent = question
                          ─────────────────            ─────────────────            ─────────────────
                          status → accepted            status → ignored             status unchanged
                          agency notif (✅)            agency notif (❌)            agency notif (💬)
                          auto-ack to client           (no client reply)            save last_client_note
                          + missing-docs CTA
```

---

## Section 1 — Privacy Landing Page (CNDP loi 09-08)

**New file:** `pages/Confidentialite.jsx` — public React page, no authentication required, follows the existing dark theme.

**Routing:** Add `'confidentialite'` to the page router in `App.jsx`. The page is NOT added to the sidebar — it is reachable only via the link embedded in the offer message and via direct URL.

**Production URL:** `https://app.rentaflow.ma/confidentialite` (read from `process.env.PUBLIC_APP_URL`, defaulting to that value).

**Content sections (French primary, Arabic + English available via i18n):**
- Intro paragraph: identity of the data controller (the agency), what data is collected (CIN, permis, phone, rental dates, location), purpose (rental contract execution and legal obligations).
- Plain-language summary of client rights under loi 09-08: access, rectification, deletion, opposition.
- Contact: "Pour exercer vos droits, contactez votre agence sur ce numéro WhatsApp."
- Footer reference: "Conforme à la loi 09-08 — CNDP (www.cndp.ma)".

**i18n:** New namespace `confidentialite` with `public/locales/{fr,ar,en}/confidentialite.json`. French copy is authoritative; Arabic and English provide translations.

**Out of scope:** Per-agency contact info on the page (Phase 2 — for now the page is generic).

---

## Section 2 — Offer Message Changes

**Backend file:** `server/routes/whatsapp.js` (`POST /whatsapp/send-offer`)
**Frontend file:** `components/SmartQuotePanel.jsx` (inside `LeadModal.jsx` / used by `Basket.jsx`)

### 2.1 Date pre-fill (frontend)

`SmartQuotePanel` initializes its `startDate` / `endDate` state from `lead.extracted_data.start_date` and `lead.extracted_data.end_date` when present. The agent can still override before sending. Backend is unchanged — it already includes the dates in the message body when both are provided.

### 2.2 CNDP block (backend)

Append a CNDP disclosure block at the end of the message body, before the Oui/Non prompt:

```
🔒 Vos données sont protégées (loi 09-08).
En savoir plus : {PUBLIC_APP_URL}/confidentialite
```

`PUBLIC_APP_URL` is read from environment variables with a fallback of `https://app.rentaflow.ma`.

### 2.3 Final message template

```
Bonjour ! 🚗 Suite à votre demande, nous vous proposons
une *{vehicleName}* pour *{priceTotal} MAD* au total.
📅 Du *{startDate}* au *{endDate}*        ← shown when both dates exist
{notes}                                    ← shown when present

🔒 Vos données sont protégées (loi 09-08).
En savoir plus : {PUBLIC_APP_URL}/confidentialite

Êtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.
```

### 2.4 Pure builder function

Extract message construction into a pure function `buildOfferMessage({ vehicleName, priceTotal, startDate, endDate, notes, publicAppUrl })` exported from `server/lib/offerMessage.js` so it can be unit-tested in isolation.

---

## Section 3 — "Yes" Response Flow Fix

**File:** `server/routes/leads.js`

### 3.1 Consolidation

Delete the orphaned `handleQuoteReply()` function. Rewrite `handleOfferResponse()` to incorporate intent-aware branching. Single canonical entry point called from `handleInboundWhatsApp()` and from the Gmail inbound path.

### 3.2 Intent → action table

| Intent | New status | Side effects |
|---|---|---|
| `accepted` | `accepted` | (1) Write `accepted_at = NOW()`; (2) agency notif "✅ Offre acceptée" with `{ type: 'lead', id, status: 'accepted' }`; (3) auto-ack WhatsApp to client (Section 4) |
| `rejected` | `ignored` | Agency notif "❌ Offre refusée" with reply text snippet; no client reply |
| `question` | unchanged (stays `offer_sent`) | Save `last_client_note`; agency notif "💬 Question sur l'offre" with the client text |

### 3.3 No fall-through to triage

The previous code's behavior of returning `null` for `question` intent (causing fall-through to `preFilter()` + classification) is removed. Once the lead is in `offer_sent` or `accepted`, all inbound text from that sender belongs to that conversation. A follow-up question like "et le prix tout inclus ?" must not re-trigger keyword triage and create a duplicate lead.

### 3.4 Conversation log

Every inbound reply (accepted / rejected / question) is appended to `raw_payload.replies[]` with `{ text, intent, timestamp }`. Capped at the most recent 50 entries per lead.

### 3.5 Convert button enablement

`LeadModal.jsx` verifies the "Convert to Rental" button is visible for `status='accepted'` leads. The Basket sub-filter for `accepted` already exists (`SUB_FILTERS` in `Basket.jsx` includes it).

---

## Section 4 — Auto-Acknowledge + Missing Docs CTA

### 4.1 Missing-docs detection

New helper in `server/lib/triage.js`:

```js
export function detectMissingDocs(extractedData) {
  const hasCIN = Boolean(
    extractedData?.cin ||
    (extractedData?.documentType === 'cin' && extractedData?.documentNumber)
  )
  const hasPermis = Boolean(extractedData?.permis)
  return { needsCIN: !hasCIN, needsPermis: !hasPermis }
}
```

### 4.2 Message templates (French)

**Both missing:**
```
Parfait ! ✅ Nous préparons votre contrat.

Pour finaliser, merci de nous envoyer :
📄 Photo recto-verso de votre CIN
🚗 Photo de votre permis de conduire

Nous vous recontactons dès réception.
```

**Only CIN missing:** same intro, only the CIN line.
**Only permis missing:** same intro, only the permis line.
**Nothing missing:**
```
Parfait ! ✅ Nous avons tous vos documents.
Nous préparons votre contrat et revenons vers vous dans quelques minutes.
```

### 4.3 Pure builder

Extract message construction into `buildAcknowledgmentMessage({ needsCIN, needsPermis })` exported from `server/lib/offerMessage.js`, unit-testable in isolation.

### 4.4 Send path

Uses the existing `sendWhatsAppMessage(senderJid, body, agencyId)` from `lib/twilioClient.js`. Errors are caught and logged but do not block the status update — the lead is already `accepted` in the database, and the agent will see it even if the auto-ack delivery fails.

---

## Section 4b — OCR Pipeline for Active Leads

### 4b.1 Widen the lookup

Rename `findOfferSentLeadByPhone()` to `findActiveLeadByPhone()`. Updated query:

```js
.from('pending_demands')
.eq('agency_id', agencyId)
.in('status', ['offer_sent', 'accepted'])
.order('created_at', { ascending: false })
.limit(20)
```

### 4b.2 Branching when an active lead is found

| Inbound type | Lead status | Action |
|---|---|---|
| text only | `offer_sent` | `handleOfferResponse()` (Section 3) |
| text only | `accepted` | Append to `raw_payload.replies[]`; save `last_client_note`; agency notif "💬 Message client" |
| image | `offer_sent` | Run `extractWithClaude()`; merge into existing lead's `extracted_data` (Section 4b.3); re-check `detectMissingDocs`; if all docs now present, fire one-time "📂 Documents complets" notif |
| image | `accepted` | Same as above but on the `accepted` lead |

### 4b.3 Merge semantics — non-destructive

When merging OCR output into existing `extracted_data`:
- Only overwrite an existing field if the new value is non-empty AND the existing value is empty, OR the new confidence is strictly higher than the existing.
- Append photo URLs to `media_urls[]` so they appear in the LeadModal image panel.
- Never reduce confidence or wipe a previously captured field.

### 4b.4 Single notif on completion

Add `docs_completed_at` column to `pending_demands` (or store the timestamp inside `extracted_data._meta.docs_completed_at` to avoid a migration). The "documents complets" notif fires exactly once per lead — gated by this timestamp. Subsequent photos still update `media_urls` and `extracted_data` but do not re-notify.

### 4b.5 Out of scope

- Auto-converting to rental contract on docs-complete.
- Validating CIN / permis expiry dates.
- Detecting blurry / unreadable photos beyond what Claude's confidence score already flags.

---

## Data Model Changes

**`pending_demands` (no migration required if we use `extracted_data._meta`):**
- `accepted_at` (nullable timestamp) — set when intent=`accepted`. **Option A**: new column (small migration). **Option B**: store in `extracted_data._meta.accepted_at`. Pick A for queryability.
- `docs_completed_at` (nullable timestamp) — same options. Pick A for queryability and to gate the one-time notif.

**Migration file:** `supabase/migrations/<timestamp>_lead_acceptance_timestamps.sql` adding both nullable timestamp columns with NULL defaults. No data backfill needed; existing rows simply have NULL.

---

## Environment Variables

Add to `.env.example` and Railway:

```
PUBLIC_APP_URL=https://app.rentaflow.ma
```

Defaults to `https://app.rentaflow.ma` if unset.

---

## Testing Strategy

**Unit:**
- `buildOfferMessage()` — with and without dates, with and without notes, CNDP block always present, URL respects env var.
- `buildAcknowledgmentMessage()` — four cases (both missing, CIN only, permis only, nothing missing).
- `detectMissingDocs()` — four cases matching the message variants.
- New `handleOfferResponse()` — three branches (accepted / rejected / question) with mocked `analyzeQuoteReply` and Supabase.
- `findActiveLeadByPhone()` — returns leads in both `offer_sent` and `accepted` status, ordered by recency.

**Integration:**
- Existing offer-response tests adapted to the new branching (status assertions per intent).
- New: inbound image to an `accepted` lead merges into existing extracted_data without creating a new row.
- New: inbound image to an `offer_sent` lead merges and, when docs become complete, fires the one-time notif.

**Manual smoke (staging):**
- Send a test WhatsApp inbound → receive offer with CNDP block → reply "oui" → verify status=`accepted`, auto-ack received, agency notification fired.
- Send CIN photo while accepted → verify lead's `extracted_data` updated, no new lead row created.

---

## Files Touched

**New:**
- `pages/Confidentialite.jsx`
- `public/locales/fr/confidentialite.json`
- `public/locales/ar/confidentialite.json`
- `public/locales/en/confidentialite.json`
- `server/lib/offerMessage.js` (pure builders)
- `supabase/migrations/<ts>_lead_acceptance_timestamps.sql`

**Modified:**
- `App.jsx` (route)
- `components/SmartQuotePanel.jsx` (date pre-fill)
- `server/routes/whatsapp.js` (uses `buildOfferMessage`, reads `PUBLIC_APP_URL`)
- `server/routes/leads.js` (rewritten `handleOfferResponse`, deleted `handleQuoteReply`, renamed `findOfferSentLeadByPhone` → `findActiveLeadByPhone`, new merge logic for inbound images on active leads)
- `server/lib/triage.js` (adds `detectMissingDocs`)
- `.env.example` (adds `PUBLIC_APP_URL`)

**Deleted:**
- The orphaned `handleQuoteReply()` function in `server/routes/leads.js`.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Auto-ack lands in client's spam / fails silently | Errors logged but don't block status update; agent still sees lead is `accepted` |
| Claude misreads "ça coûte combien ?" as `accepted` | `analyzeQuoteReply` has explicit Darija + French keyword rules; conservative — falls back to `question` on ambiguity; agent can manually correct |
| Merge clobbers good OCR data with worse OCR data | Confidence-gated overwrite (Section 4b.3); only overwrites empty fields or strictly-higher confidence |
| Photo upload before status transitions to accepted (race) | Lookup is by status `IN (offer_sent, accepted)` — both paths merge into the same lead |
| One-time notif fires twice across concurrent inbound photos | DB-level guard: only fire if `docs_completed_at` was NULL before the update; use a conditional update returning affected rows |

---

## Success Criteria

- A client who receives an offer sees the CNDP block and can open the privacy page.
- A client who replies "oui" moves the lead to `accepted` within 5 seconds and receives the auto-ack.
- A client who replies "non" moves the lead to `ignored` and does not receive a reply.
- A client who replies "et avec l'assurance ?" sees the lead stay at `offer_sent`, the agent receives a notification with the question text, and no duplicate lead is created.
- A client who sends CIN + permis photos after acceptance has both fields populated in the same lead's `extracted_data`, with photos visible in the LeadModal image panel.
- The Basket "accepted" sub-filter shows the lead with a working "Convert to Rental" button.
