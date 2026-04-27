# Triage Keyword Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-step Claude triage gate with a three-step pipeline: language detection → keyword pre-filter → ambiguous summarization, applied to both Gmail and WhatsApp inbound handlers.

**Architecture:** `franc` detects the language offline; non-core languages are translated to French via Claude Haiku; a keyword dictionary with three signal tiers (HIGH/MEDIUM/LOW) scores each message as PASS / AMBIGUOUS / FAIL; AMBIGUOUS messages get a 15-word French summary and are saved as `classification="alert"` with no further extraction; PASS messages continue to the existing extraction pipeline unchanged.

**Tech Stack:** Node.js ESM, `franc` (npm, offline language detection), Claude Haiku (`claude-haiku-4-5-20251001`), Supabase, Vitest (tests run at root with `npm test`)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Create** | `server/lib/triage.js` | Keyword dictionary, `detectLanguage`, `translateToFrench`, `preFilter`, `handleAmbiguous` |
| **Create** | `src/test/triage.test.js` | Vitest unit tests for all triage functions |
| **Modify** | `server/routes/leads.js` | Replace `triageMessage()` calls in Gmail webhook + WhatsApp handler; remove old `TRIAGE_SYSTEM_PROMPT` and `triageMessage` |
| **Modify** | `server/package.json` | Add `franc` dependency |

---

## Task 1: Install `franc`

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install franc in the server directory**

```bash
cd server && npm install franc
```

Expected output: `added 1 package` (franc is ESM-only, no extra deps)

- [ ] **Step 2: Verify it resolves**

```bash
node --input-type=module <<'EOF'
import { franc } from 'franc'
console.log(franc('Bonjour je voudrais louer une voiture'))
EOF
```

Expected output: `fra`

- [ ] **Step 3: Commit**

```bash
cd server && git add package.json package-lock.json
git commit -m "chore(triage): install franc for offline language detection"
```

---

## Task 2: Create `server/lib/triage.js` — keyword dictionary + preFilter

**Files:**
- Create: `server/lib/triage.js`

- [ ] **Step 1: Write the failing test first**

Create `src/test/triage.test.js` at the project root (where Vitest is configured):

```js
import { describe, it, expect } from 'vitest'
import { preFilter, detectLanguage } from '../../server/lib/triage.js'

describe('detectLanguage', () => {
  it('detects French', () => {
    expect(detectLanguage('Bonjour je voudrais louer une voiture pour la semaine')).toBe('fra')
  })
  it('detects English', () => {
    expect(detectLanguage('Hi I would like to rent a car for the weekend')).toBe('eng')
  })
  it('returns und for very short text', () => {
    expect(detectLanguage('ok')).toBe('und')
  })
})

describe('preFilter', () => {
  it('PASS on HIGH signal keyword — French', () => {
    const r = preFilter('Bonjour, je souhaite faire une réservation pour samedi')
    expect(r.result).toBe('pass')
  })
  it('PASS on 2 MEDIUM keywords', () => {
    const r = preFilter('Ma voiture a eu un accident hier, j\'ai besoin d\'aide')
    expect(r.result).toBe('pass')
  })
  it('AMBIGUOUS on 1 MEDIUM keyword', () => {
    const r = preFilter('Bonjour, est-ce que la voiture est disponible ?')
    expect(r.result).toBe('ambiguous')
  })
  it('AMBIGUOUS on 3 LOW keywords', () => {
    const r = preFilter('Quel est le prix et le tarif disponible pour cette option ?')
    expect(r.result).toBe('ambiguous')
  })
  it('FAIL on no rental keywords', () => {
    const r = preFilter('Bonjour maman, comment tu vas aujourd\'hui ?')
    expect(r.result).toBe('fail')
  })
  it('PASS on HIGH signal — English', () => {
    const r = preFilter('I want to make a car rental booking for next Monday')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — Arabic/Darija', () => {
    const r = preFilter('بغيت نحجز سيارة ليوم الجمعة')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — German', () => {
    const r = preFilter('Ich möchte einen Mietwagen für nächste Woche buchen')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — Dutch', () => {
    const r = preFilter('Ik wil een auto huren voor het weekend')
    expect(r.result).toBe('pass')
  })
  it('returns matched keywords list', () => {
    const r = preFilter('Je veux louer une voiture')
    expect(r.matchedKeywords.length).toBeGreaterThan(0)
  })
  it('is case-insensitive', () => {
    const r = preFilter('LOCATION VOITURE DISPONIBLE')
    expect(r.result).toBe('pass')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- src/test/triage.test.js
```

Expected: FAIL — `Cannot find module '../../server/lib/triage.js'`

- [ ] **Step 3: Create `server/lib/triage.js`**

```js
import { franc } from 'franc'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from './supabaseAdmin.js'

// ── Core languages that skip translation ─────────────────
const CORE_LANGS = new Set(['fra', 'ara', 'eng'])

// ── Keyword dictionary ────────────────────────────────────
const KEYWORDS = {
  high: [
    // French
    'location', 'louer', 'réserver', 'réservation', 'prolongation', 'restitution', 'caution',
    // Darija / Arabic
    'كراء', 'كري', 'حجز', 'تأجير', 'تمديد',
    // English
    'rental', 'rent', 'hire', 'reserve', 'booking', 'reservation',
    // Dutch
    'huren', 'reservering', 'huurwagen', 'boeken',
    // German
    'mieten', 'mietwagen', 'reservieren', 'buchen',
  ],
  medium: [
    // French
    'voiture', 'véhicule', 'contrat', 'assurance', 'panne', 'accident', 'permis', 'tarif', 'kilométrage',
    // Darija / Arabic
    'سيارة', 'طوموبيل', 'عقد', 'تأمين', 'رخصة', 'بنزين', 'حادث', 'بريكاج',
    // English
    'car', 'vehicle', 'contract', 'insurance', 'breakdown', 'accident', 'license', 'mileage', 'fuel',
    // Dutch
    'voertuig', 'verzekering', 'pech', 'ongeluk', 'rijbewijs',
    // German
    'fahrzeug', 'vertrag', 'versicherung', 'panne', 'unfall', 'führerschein',
  ],
  low: [
    'prix', 'tarif', 'disponible', 'disponibilité',
    'prijs', 'preis',
    'price', 'rate', 'available',
    'ثمن', 'سعر', 'متاح',
  ],
}

// ── detectLanguage ────────────────────────────────────────
export function detectLanguage(text) {
  if (!text?.trim()) return 'und'
  return franc(text) ?? 'und'
}

// ── preFilter ─────────────────────────────────────────────
export function preFilter(text) {
  if (!text?.trim()) return { result: 'fail', matchedKeywords: [] }

  const lower = text.toLowerCase()
  const matched = { high: [], medium: [], low: [] }

  for (const word of KEYWORDS.high) {
    if (lower.includes(word.toLowerCase())) matched.high.push(word)
  }
  for (const word of KEYWORDS.medium) {
    if (lower.includes(word.toLowerCase())) matched.medium.push(word)
  }
  for (const word of KEYWORDS.low) {
    if (lower.includes(word.toLowerCase())) matched.low.push(word)
  }

  const allMatched = [...matched.high, ...matched.medium, ...matched.low]

  // PASS conditions
  if (matched.high.length >= 1) return { result: 'pass', matchedKeywords: allMatched }
  if (matched.medium.length >= 2) return { result: 'pass', matchedKeywords: allMatched }
  if (matched.medium.length >= 1 && matched.low.length >= 2) return { result: 'pass', matchedKeywords: allMatched }

  // AMBIGUOUS conditions
  if (matched.medium.length >= 1) return { result: 'ambiguous', matchedKeywords: allMatched }
  if (matched.low.length >= 3) return { result: 'ambiguous', matchedKeywords: allMatched }

  return { result: 'fail', matchedKeywords: [] }
}

// ── translateToFrench ─────────────────────────────────────
export async function translateToFrench(text) {
  if (!process.env.ANTHROPIC_API_KEY || !text?.trim()) return text
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Traduis le message suivant en français. Réponds uniquement avec la traduction, sans explication.',
      messages: [{ role: 'user', content: text }],
    })
    return msg.content?.[0]?.text?.trim() ?? text
  } catch (err) {
    console.error('[triage/translate] error:', err.message)
    return text
  }
}

// ── summarizeForAlert ─────────────────────────────────────
async function summarizeForAlert(frenchText) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: `Tu es un assistant pour une agence de location de voitures.
Résume le message suivant en UNE phrase courte (max 15 mots).
Décris l'intention de l'expéditeur. Réponds uniquement avec la phrase, sans ponctuation finale.`,
      messages: [{ role: 'user', content: frenchText }],
    })
    return msg.content?.[0]?.text?.trim() ?? null
  } catch (err) {
    console.error('[triage/summarize] error:', err.message)
    return null
  }
}

// ── handleAmbiguous ───────────────────────────────────────
/**
 * Translates (if needed), summarizes, and saves an ambiguous message as an alert.
 * @param {object} params
 * @param {string} params.agencyId
 * @param {string} params.senderId       — email or WhatsApp JID
 * @param {string} params.source         — 'gmail' | 'whatsapp'
 * @param {string} params.originalText   — raw message text
 * @param {string|null} params.translatedText — pre-translated text (from Step 1) or null
 * @param {object} [params.rawPayload]   — original raw payload for audit trail
 */
export async function handleAmbiguous({ agencyId, senderId, source, originalText, translatedText, rawPayload }) {
  const lang = detectLanguage(originalText)
  const frenchText = translatedText ?? (CORE_LANGS.has(lang) ? originalText : await translateToFrench(originalText))
  const summary = await summarizeForAlert(frenchText)

  const { error } = await supabaseAdmin.from('pending_demands').insert({
    agency_id: agencyId,
    source,
    sender_id: senderId,
    raw_payload: rawPayload ?? { body: originalText },
    extracted_data: {
      classification: 'alert',
      translated_body: frenchText,
      summary_for_agent: summary,
    },
    classification: 'alert',
  })

  if (error) console.error(`[triage/handleAmbiguous] insert error:`, error.message)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/test/triage.test.js
```

Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/triage.js src/test/triage.test.js
git commit -m "feat(triage): add keyword pre-filter, language detection, and ambiguous handler"
```

---

## Task 3: Wire triage into the Gmail webhook

**Files:**
- Modify: `server/routes/leads.js` lines 13-19 (imports) and lines 264-272 (triage gate)

- [ ] **Step 1: Add import at the top of `server/routes/leads.js`**

Find this block (line ~13):
```js
import { Router } from 'express'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'
```

Replace with:
```js
import { Router } from 'express'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from '../lib/supabaseAdmin.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePremium } from '../middleware/premium.js'
import { detectLanguage, translateToFrench, preFilter, handleAmbiguous } from '../lib/triage.js'
```

- [ ] **Step 2: Replace the Gmail triage gate**

Find this block (line ~264):
```js
  // Triage gate — always runs on any available text before any extraction
  const textForTriage = [subject, bodyText].filter(Boolean).join('\n\n')
  if (textForTriage) {
    const triage = await triageMessage(textForTriage)
    if (triage && !triage.is_rental_business) {
      console.log(`[leads/gmail] triage dropped: ${triage.category} (${triage.confidence}%) — ${triage.reason}`)
      return res.json({ ok: true, dropped: true })
    }
  }
```

Replace with:
```js
  // Triage gate — language detection → keyword pre-filter → ambiguous handler
  const textForTriage = [subject, bodyText].filter(Boolean).join('\n\n')
  if (textForTriage) {
    const lang = detectLanguage(textForTriage)
    const CORE = new Set(['fra', 'ara', 'eng'])
    const translatedText = (!CORE.has(lang) && lang !== 'und')
      ? await translateToFrench(textForTriage)
      : null
    const textToFilter = translatedText ?? textForTriage
    const { result, matchedKeywords } = preFilter(textToFilter)

    if (result === 'fail') {
      console.log(`[leads/gmail] pre-filter dropped: no rental keywords (lang=${lang})`)
      return res.json({ ok: true, dropped: true })
    }

    if (result === 'ambiguous') {
      console.log(`[leads/gmail] pre-filter ambiguous: keywords=[${matchedKeywords.join(',')}]`)
      await handleAmbiguous({
        agencyId,
        senderId: senderEmail,
        source: 'gmail',
        originalText: textForTriage,
        translatedText,
        rawPayload: { subject, bodyText: (bodyText || '').slice(0, 2000) },
      })
      return res.json({ ok: true, alert: true })
    }

    // result === 'pass' — continue to extraction below
    console.log(`[leads/gmail] pre-filter pass: keywords=[${matchedKeywords.join(',')}]`)
  }
```

- [ ] **Step 3: Remove old `TRIAGE_SYSTEM_PROMPT` and `triageMessage` function**

Find and delete the entire block (lines ~109-149):
```js
// ── Triage prompt (pre-extraction gate) ──────────────────
const TRIAGE_SYSTEM_PROMPT = `You are a strict message classifier...`

async function triageMessage(text) {
  ...
}
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.js
git commit -m "feat(triage): wire keyword pre-filter into Gmail webhook"
```

---

## Task 4: Wire triage into the WhatsApp inbound handler

**Files:**
- Modify: `server/routes/leads.js` lines ~501-508 (WhatsApp triage gate)

- [ ] **Step 1: Replace the WhatsApp triage gate**

Find this block (line ~501):
```js
  // Triage gate — always runs on any text before extraction (covers text, audio transcript, and image captions)
  if (bodyText?.trim()) {
    const triage = await triageMessage(bodyText)
    if (triage && !triage.is_rental_business) {
      console.log(`[leads/inbound-wa] triage dropped: ${triage.category} (${triage.confidence}%) — ${triage.reason}`)
      return
    }
  }
```

Replace with:
```js
  // Triage gate — language detection → keyword pre-filter → ambiguous handler
  if (bodyText?.trim()) {
    const lang = detectLanguage(bodyText)
    const CORE = new Set(['fra', 'ara', 'eng'])
    const translatedText = (!CORE.has(lang) && lang !== 'und')
      ? await translateToFrench(bodyText)
      : null
    const textToFilter = translatedText ?? bodyText
    const { result, matchedKeywords } = preFilter(textToFilter)

    if (result === 'fail') {
      console.log(`[leads/inbound-wa] pre-filter dropped: no rental keywords (lang=${lang})`)
      return
    }

    if (result === 'ambiguous') {
      console.log(`[leads/inbound-wa] pre-filter ambiguous: keywords=[${matchedKeywords.join(',')}]`)
      await handleAmbiguous({
        agencyId,
        senderId: senderJid,
        source: 'whatsapp',
        originalText: bodyText,
        translatedText,
        rawPayload: { body: bodyText, from: senderJid },
      })
      return
    }

    // result === 'pass' — continue to extraction below
    console.log(`[leads/inbound-wa] pre-filter pass: keywords=[${matchedKeywords.join(',')}]`)
  }
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/leads.js
git commit -m "feat(triage): wire keyword pre-filter into WhatsApp inbound handler"
```

---

## Task 5: Verify full test suite passes + smoke test

**Files:** none modified

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass, no regressions

- [ ] **Step 2: Smoke test Gmail path manually**

Send a POST to the Gmail webhook with a non-rental message and verify it returns `{ ok: true, dropped: true }`:

```bash
curl -X POST http://localhost:3000/leads/webhook/gmail \
  -H "Content-Type: application/json" \
  -d '{"agencyId":"test-agency","senderEmail":"test@test.com","subject":"Bonjour","bodyText":"Comment vas-tu ? La famille va bien ?"}'
```

Expected response: `{"ok":true,"dropped":true}`

- [ ] **Step 3: Smoke test with a rental message**

```bash
curl -X POST http://localhost:3000/leads/webhook/gmail \
  -H "Content-Type: application/json" \
  -d '{"agencyId":"test-agency","senderEmail":"client@test.com","subject":"Location voiture","bodyText":"Bonjour, je souhaite réserver une voiture du 1er au 5 mai"}'
```

Expected response: `{"ok":true}` (lead created in DB)

- [ ] **Step 4: Smoke test Dutch email (foreign language path)**

```bash
curl -X POST http://localhost:3000/leads/webhook/gmail \
  -H "Content-Type: application/json" \
  -d '{"agencyId":"test-agency","senderEmail":"dutch@test.com","subject":"Auto huren","bodyText":"Ik wil graag een auto huren voor volgende week"}'
```

Expected response: `{"ok":true}` (translated → PASS → lead created)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(triage): keyword pipeline complete — Gmail + WhatsApp, 5 languages"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `franc` language detection → Task 1
- ✅ Keyword dictionary (5 languages, 3 tiers) → Task 2
- ✅ PASS / AMBIGUOUS / FAIL scoring rules → Task 2 (`preFilter`)
- ✅ Translation for non-core languages → Task 2 (`translateToFrench`)
- ✅ AMBIGUOUS: translate → summarize → save as alert → Task 2 (`handleAmbiguous`)
- ✅ `summary_for_agent` populated → Task 2 (`summarizeForAlert`)
- ✅ `translated_body` stored in `extracted_data` → Task 2 (`handleAmbiguous`)
- ✅ Gmail webhook wired → Task 3
- ✅ Old `triageMessage` removed → Task 3
- ✅ WhatsApp handler wired → Task 4
- ✅ Tests cover all signal tiers + all 5 languages → Task 2

**No placeholders found.**

**Type consistency:** `preFilter` returns `{ result, matchedKeywords }` — consumed as `{ result, matchedKeywords }` in Tasks 3 and 4. ✅ `handleAmbiguous` signature defined in Task 2, called identically in Tasks 3 and 4. ✅
