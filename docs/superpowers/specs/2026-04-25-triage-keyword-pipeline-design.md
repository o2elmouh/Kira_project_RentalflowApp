# Triage Keyword Pipeline — Design Spec
**Date:** 2026-04-25
**Scope:** `server/routes/leads.js` — Gmail webhook + WhatsApp inbound handler
**Phase:** 1 of 2 (Phase 2 = Alerts dashboard, separate agent)

---

## Problem

The current triage gate calls Claude Haiku on every incoming message. It has no confidence threshold, no keyword grounding, and no language handling beyond French/Arabic/English. Messages unrelated to car rental occasionally pass through. Dutch and German tourist emails are not handled.

---

## Solution Overview

A three-step pre-filter runs **before** any Claude extraction call. Claude is only called for:
1. Translation of non-core languages (nl, de, and others)
2. AMBIGUOUS message summarization
3. Existing extraction pipeline (unchanged) for PASS messages

---

## Pipeline

```
Incoming message (Gmail or WhatsApp)
        │
        ▼
① franc → detect language
        │
        ├─ fr / ar / en ──────────────────────────────┐
        │                                             │
        └─ other → Claude Haiku translate → French    │
                                                      ▼
                                           ② keyword scan
                                                      │
                               ┌──────────────────────┼──────────────┐
                               ▼                      ▼              ▼
                             FAIL                AMBIGUOUS         PASS
                          (no hits)          (low signal only)  (high hit)
                               │                      │              │
                            drop               AMBIGUOUS flow    existing
                           silently                               extraction
```

---

## Step ① — Language Detection & Translation

- Use `franc` npm package (offline, zero API cost) to detect language
- Core languages (no translation needed): `fra` (French), `ara` (Arabic/Darija), `eng` (English)
- All other languages: single Claude Haiku call, `max_tokens: 200`
  ```
  System: "Translate the following message to French. Output only the translation, no explanation."
  ```
- Translated text is used for all subsequent steps
- If `franc` returns `und` (undetermined, e.g. very short text) → skip translation, proceed with original text

---

## Step ② — Keyword Dictionary

### Signal Tiers

**HIGH** — unambiguous rental intent. One hit → PASS immediately.

| Language | Keywords |
|---|---|
| French | `location, louer, réserver, réservation, prolongation, restitution, caution` |
| Darija (Arabic) | `كراء, كري, حجز, تأجير, تمديد` |
| English | `rental, rent, hire, reserve, booking, reservation` |
| Dutch | `huren, reservering, huurwagen, boeken` |
| German | `mieten, mietwagen, reservieren, buchen` |

**MEDIUM** — vehicle/contract context. Two hits → PASS. One hit alone → AMBIGUOUS.

| Language | Keywords |
|---|---|
| French | `voiture, véhicule, auto, contrat, assurance, panne, accident, permis, tarif, kilométrage` |
| Darija (Arabic) | `سيارة, طوموبيل, عقد, تأمين, رخصة, بنزين, حادث, بريكاج` |
| English | `car, vehicle, contract, insurance, breakdown, accident, license, mileage, fuel` |
| Dutch | `auto, voertuig, contract, verzekering, pech, ongeluk, rijbewijs` |
| German | `auto, fahrzeug, vertrag, versicherung, panne, unfall, führerschein` |

**LOW** — weak indicators. Three or more hits required to reach AMBIGUOUS.

| Language | Keywords |
|---|---|
| All | `prix, tarif, disponible, prijs, preis, price, rate, available, ثمن, سعر, متاح` |

### Scoring Rules

| Result | Condition |
|---|---|
| **PASS** | 1+ HIGH hit **OR** 2+ MEDIUM hits **OR** 1 MEDIUM + 2 LOW hits |
| **AMBIGUOUS** | 1 MEDIUM hit **OR** 3+ LOW hits (and no HIGH) |
| **FAIL** | No keyword hits at all |

Keyword matching is **case-insensitive**, applied to the (possibly translated) text.

---

## Step ③ — AMBIGUOUS Flow

When result is AMBIGUOUS:

1. **Translate** full message to French if not already French (reuse Step ① translation if available — no extra API call)
2. **Summarize** with Claude Haiku `max_tokens: 50`:
   ```
   System: "Tu es un assistant pour une agence de location de voitures.
   Résume le message suivant en UNE phrase courte (max 15 mots).
   Décris l'intention de l'expéditeur. Réponds uniquement avec la phrase, sans ponctuation finale."
   ```
3. **Save** to `pending_demands`:
   - `classification = "alert"`
   - `summary_for_agent` = the 15-word summary
   - `extracted_data.translated_body` = full translated text
   - All other lead fields left null
4. Return — no further extraction

---

## PASS Flow (unchanged)

When result is PASS, the existing pipeline runs exactly as before:
- Gmail: Claude Vision OCR for images, `classifyTextMessage` for text
- WhatsApp: `extractWithClaude` for images, `classifyTextMessage` for text
- No changes to extraction logic

---

## FAIL Flow

- Gmail: `return res.json({ ok: true, dropped: true })`
- WhatsApp: `return` (silent drop, same as current triage behavior)

---

## Implementation Scope

### Files modified
- `server/routes/leads.js` — all changes contained here
- `package.json` — add `franc` dependency

### No DB migration needed
- `classification = "alert"` reuses existing enum values approach (string field)
- `summary_for_agent` and `extracted_data` columns already exist

### Functions to add
```
detectLanguage(text) → string (franc language code)
translateToFrench(text) → Promise<string> (Claude Haiku, skipped if already fr/ar/en)
preFilter(text) → { result: 'pass'|'ambiguous'|'fail', matchedKeywords: string[] }
handleAmbiguous(text, translatedText, source) → Promise<void> (saves alert to DB)
```

### Integration points
- **Gmail webhook** (`POST /leads/webhook/gmail`): replace `triageMessage()` call with `preFilter()` + `handleAmbiguous()`
- **WhatsApp inbound** (`handleInboundWhatsApp`): same replacement
- Existing `triageMessage()` function: **removed** (fully replaced by `preFilter`)
- Existing `TRIAGE_SYSTEM_PROMPT`: **removed**

---

## Cost Impact

| Step | Model | max_tokens | Est. cost/message |
|---|---|---|---|
| Translation (non-core lang only) | Haiku | 200 | ~$0.00008 |
| AMBIGUOUS summary | Haiku | 50 | ~$0.00005 |
| PASS extraction | Haiku | existing | unchanged |
| FAIL | — | — | $0 |

Most messages (French/Arabic/English + clear keyword hit) cost **$0** for triage. Total triage cost approaches zero for typical Moroccan agency traffic.

---

## Out of Scope (Phase 2)

- Alerts dashboard UI section
- Manager triage actions on alerts (approve / dismiss)
- Push notifications for new alerts
- Alert threading / deduplication
