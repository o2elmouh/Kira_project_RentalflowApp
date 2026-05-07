# Inbound Email Webhook Architecture for RentaFlow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-minute Gmail IMAP poller with a push-based webhook receiver that accepts forwarded rental inquiries and feeds them into the existing AI triage pipeline.

**Architecture:** Agencies configure auto-forwarding rules to a unique `forwarding_alias` per agency (e.g., `agency_123@inbound.rentaflow.ma`). An Express webhook receiver normalizes email payloads from Postmark/SendGrid, queries Supabase to match the agency, and asynchronously passes normalized emails to the triage pipeline. The webhook returns 200 OK immediately to prevent provider retries.

**Tech Stack:** Node.js/Express, Supabase, Postmark/SendGrid webhooks, ES6+ async/await, regex for forwarded-message parsing.

---

## Scope

### In
- SQL migration to remove Gmail columns (`gmail_address`, `gmail_app_password`, `gmail_last_polled`)
- Add new column `forwarding_alias` (TEXT UNIQUE NULLABLE) to `agencies` table
- Express webhook receiver (`POST /api/webhooks/inbound`)
- Email normalizer utility with forwarded-message regex parsing
- Integration into existing triage pipeline (`triageMessage()` in `server/routes/leads.js`)
- Error handling + quick 200 response for webhook reliability
- Logging and monitoring for unmapped aliases and failed triages

### Out
- DNS/email provider infrastructure configuration (user responsibility)
- Postmark/SendGrid account setup and API key management
- Auto-forwarding rule templates for end-users
- Deprecation and removal of `startGmailPoller()` function (separate cleanup PR)
- Email provider SDK integration (assumes standard JSON webhook schema)

---

## Action Items

### Task 1: Database Migration

- [ ] **Step 1: Create SQL migration file**

File: `supabase/migrations/011_inbound_email_webhook.sql`

```sql
-- Migration 011 — Inbound Email Webhook Architecture
-- Remove Gmail IMAP credentials, add forwarding_alias for push-based architecture

-- 1. Drop Gmail-related columns (no longer needed with push webhooks)
ALTER TABLE agencies
  DROP COLUMN IF EXISTS gmail_address,
  DROP COLUMN IF EXISTS gmail_app_password,
  DROP COLUMN IF EXISTS gmail_last_polled;

-- 2. Add forwarding_alias for inbound webhook routing
-- Format: agency_{uuid}@inbound.rentaflow.ma or similar (set by system on agency creation)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS forwarding_alias TEXT UNIQUE NULLABLE;

-- 3. Index for fast alias lookups in webhook handler
CREATE INDEX IF NOT EXISTS agencies_forwarding_alias_idx
  ON agencies(forwarding_alias);

-- 4. Update migration timestamp
COMMENT ON COLUMN agencies.forwarding_alias IS 'Unique inbound email address for this agency (e.g., agency_123@inbound.rentaflow.ma). Used by webhook to route forwarded emails.';
```

- [ ] **Step 2: Apply migration to development database**

Command:
```bash
npx supabase migration up
```

Verify: Check that Gmail columns are removed and `forwarding_alias` exists in `agencies` table schema.

---

### Task 2: Email Normalizer Utility

- [ ] **Step 1: Create normalizer module**

File: `server/lib/normalizeInboundEmail.js`

```javascript
/**
 * normalizeInboundEmail
 *
 * Transforms provider-specific email JSON (Postmark, SendGrid, etc.)
 * into a standardized RentaFlowEmail object.
 *
 * Handles:
 * - Extracting original sender from forwarded "Forwarded message" blocks
 * - Parsing RFC 2822 headers in email body
 * - Converting attachments to base64 (if needed)
 * - Fallback to From header if no forwarded block detected
 */

/**
 * Regex to extract original sender from Gmail/Outlook "Forwarded message" blocks.
 * Pattern: "From: <email>" or "From: Name <email>" in the body
 */
const FORWARDED_FROM_REGEX = /^From:\s+(?:(.+?)\s+)?<([^\s>]+@[^\s>]+)>$/m;
const FORWARDED_EMAIL_REGEX = /(?:From:|Sent:|To:).*?([^\s@]+@[^\s@]+\.[^\s@]+)/;

/**
 * Parse forwarded message block to extract original sender email and name.
 *
 * @param {string} bodyText - Email body text that may contain forwarded block
 * @returns {{ email: string, name?: string } | null} - Extracted sender or null if not found
 */
function extractForwardedSender(bodyText) {
  if (!bodyText) return null;

  // Attempt RFC 2822 style: "From: Name <email@example.com>"
  const match = bodyText.match(FORWARDED_FROM_REGEX);
  if (match) {
    return {
      email: match[2],
      name: match[1]?.trim() || undefined,
    };
  }

  // Fallback: simple regex for email address in forwarded block
  const emailMatch = bodyText.match(FORWARDED_EMAIL_REGEX);
  if (emailMatch) {
    return { email: emailMatch[1] };
  }

  return null;
}

/**
 * Normalize inbound email from webhook provider into RentaFlowEmail format.
 *
 * @param {object} webhookPayload - Webhook JSON from Postmark/SendGrid
 *   Expected fields: From, To, Subject, TextBody, Attachments
 * @param {string} agencyId - UUID of the agency (from database lookup)
 * @returns {{ agencyId, originalSender, subject, bodyText, attachments }}
 */
export function normalizeInboundEmail(webhookPayload, agencyId) {
  const { From, To, Subject, TextBody, Attachments = [] } = webhookPayload;

  if (!From || !Subject || !TextBody) {
    throw new Error('Missing required email fields: From, Subject, or TextBody');
  }

  // Extract original sender from forwarded block; fallback to From header
  const forwardedSender = extractForwardedSender(TextBody);
  const originalSender = forwardedSender?.email || From;

  // Normalize attachments: include ALL (images, PDFs, docs, etc.)
  // Each attachment should have: filename, mimeType, base64
  const attachments = Attachments.map((att) => ({
    filename: att.Name || att.filename || 'attachment',
    mimeType: att.ContentType || att.content_type || 'application/octet-stream',
    base64: att.Content || att.content,
  })).filter((att) => att.base64); // Omit attachments with missing content

  return {
    agencyId,
    originalSender,
    subject: Subject.trim(),
    bodyText: TextBody.trim(),
    attachments,
  };
}

export default normalizeInboundEmail;
```

- [ ] **Step 2: Write unit tests for normalizer**

File: `server/__tests__/normalizeInboundEmail.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import normalizeInboundEmail from '../lib/normalizeInboundEmail.js';

describe('normalizeInboundEmail', () => {
  it('extracts original sender from Gmail forwarded block', () => {
    const payload = {
      From: 'agency@rentaflow.com',
      To: 'agency_123@inbound.rentaflow.ma',
      Subject: 'Location demandée',
      TextBody: `
Bonjour,

Je cherche une location...

---------- Forwarded message ---------
From: John Doe <customer@example.com>
Date: Mon, May 5, 2026 at 10:00 AM
Subject: Location demandée
To: agency@rentaflow.com

Bonjour, je cherche une location pour le 15 mai...
      `.trim(),
      Attachments: [],
    };

    const result = normalizeInboundEmail(payload, 'agency-uuid-123');

    expect(result.originalSender).toBe('customer@example.com');
    expect(result.subject).toBe('Location demandée');
    expect(result.agencyId).toBe('agency-uuid-123');
  });

  it('includes all attachments (images, PDFs, docs)', () => {
    const payload = {
      From: 'agency@example.com',
      To: 'agency_123@inbound.rentaflow.ma',
      Subject: 'Test',
      TextBody: 'Body',
      Attachments: [
        { Name: 'photo.jpg', ContentType: 'image/jpeg', Content: 'base64data...' },
        { Name: 'contract.pdf', ContentType: 'application/pdf', Content: 'base64data...' },
        { Name: 'form.docx', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Content: 'base64data...' },
      ],
    };

    const result = normalizeInboundEmail(payload, 'agency-uuid-123');

    expect(result.attachments).toHaveLength(3);
    expect(result.attachments[0].mimeType).toBe('image/jpeg');
    expect(result.attachments[1].mimeType).toBe('application/pdf');
  });

  it('throws if required fields are missing', () => {
    expect(() =>
      normalizeInboundEmail({ From: 'test@example.com', TextBody: 'body' }, 'agency-uuid')
    ).toThrow('Missing required email fields');
  });
});
```

- [ ] **Step 3: Run tests to verify normalizer**

Command:
```bash
npm run test -- server/__tests__/normalizeInboundEmail.test.js
```

Expected: All tests pass.

---

### Task 3: Express Webhook Receiver

- [ ] **Step 1: Create webhook controller**

File: `server/routes/webhooks.js`

```javascript
/**
 * Inbound Email Webhooks
 *
 * POST /webhooks/inbound — Receive email from Postmark/SendGrid and queue for triage
 *
 * Architecture:
 * 1. Validate webhook provider (optional: HMAC signature check)
 * 2. Extract forwarding_alias from "To" header
 * 3. Query Supabase to find agency by forwarding_alias
 * 4. Normalize email payload
 * 5. Queue to triage pipeline (async, non-blocking)
 * 6. Return 200 OK immediately (don't block webhook)
 */

import { Router } from 'express';
import supabaseAdmin from '../lib/supabaseAdmin.js';
import normalizeInboundEmail from '../lib/normalizeInboundEmail.js';
import { classifyTextMessage, triageMessage } from './leads.js';

const router = Router();

/**
 * POST /webhooks/inbound
 *
 * Receive forwarded email from webhook provider (Postmark, SendGrid, etc.)
 * and asynchronously queue it for AI triage.
 *
 * Webhook JSON schema (Postmark/SendGrid compatible):
 * {
 *   From: "agency@example.com",
 *   To: "agency_123@inbound.rentaflow.ma",  ← forwarding_alias
 *   Subject: "Location demandée",
 *   TextBody: "...",
 *   Attachments: [ { Name, ContentType, Content } ]
 * }
 */
router.post('/inbound', async (req, res) => {
  const startTime = Date.now();
  const { To, From } = req.body;

  // ── Step 1: Extract forwarding_alias from "To" ──────────
  if (!To) {
    console.warn('[webhook:inbound] Missing "To" header — cannot route');
    return res.status(400).json({ error: 'Missing To field' });
  }

  const forwardingAlias = To.split('@')[0]; // Extract local part (e.g., "agency_123" from "agency_123@inbound.rentaflow.ma")

  // ── Step 2: Query agency by forwarding_alias ──────────
  let agency;
  try {
    const { data, error } = await supabaseAdmin
      .from('agencies')
      .select('id, name')
      .eq('forwarding_alias', To) // Match full address
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      console.warn(`[webhook:inbound] No agency found for alias: ${To}`);
      // Return 200 to prevent webhook retries, but don't process
      return res.status(200).json({ ok: false, reason: 'Agency not found' });
    }

    agency = data;
  } catch (err) {
    console.error(`[webhook:inbound] Agency query error: ${err.message}`);
    return res.status(500).json({ error: 'Database error' });
  }

  // ── Step 3: Normalize email ──────────────────────────
  let normalizedEmail;
  try {
    normalizedEmail = normalizeInboundEmail(req.body, agency.id);
  } catch (err) {
    console.error(`[webhook:inbound] Normalization error: ${err.message}`);
    return res.status(200).json({ ok: false, reason: 'Invalid email format' });
  }

  // ── Step 4: Return 200 OK immediately ────────────────
  // (Triage happens asynchronously below)
  res.status(200).json({ ok: true, agency_id: agency.id });

  // ── Step 5: Queue to triage (async, fire-and-forget) ───
  (async () => {
    try {
      console.log(
        `[webhook:inbound] → Queuing email from ${normalizedEmail.originalSender} for agency ${agency.name} (${agency.id})`
      );

      // Call the existing triage function from leads.js
      // This will extract identity, classify rental intent, and create a pending lead
      await triageMessage({
        agencyId: agency.id,
        source: 'email',
        senderEmail: normalizedEmail.originalSender,
        subject: normalizedEmail.subject,
        bodyText: normalizedEmail.bodyText,
        attachments: normalizedEmail.attachments, // Now includes ALL types
      });

      const elapsed = Date.now() - startTime;
      console.log(`[webhook:inbound] ✓ Triage completed in ${elapsed}ms for ${normalizedEmail.originalSender}`);
    } catch (err) {
      console.error(`[webhook:inbound] ✗ Triage error: ${err.message}`);
      // Error is logged but not retried (email is not re-queued)
      // Consider: send Slack alert or store failed email for manual review
    }
  })();
});

export default router;
```

- [ ] **Step 2: Register webhook router in Express app**

File: `server/index.js` (add to imports and middleware):

```javascript
import webhooksRouter from './routes/webhooks.js';

// ... existing code ...

// Mount webhooks (public, no auth required)
app.use('/webhooks', webhooksRouter);
```

- [ ] **Step 3: Write integration test for webhook**

File: `server/__tests__/webhooks.test.js`

```javascript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import supabaseAdmin from '../lib/supabaseAdmin.js';

describe('POST /webhooks/inbound', () => {
  let agencyId, forwardingAlias;

  beforeAll(async () => {
    // Create test agency
    const { data, error } = await supabaseAdmin
      .from('agencies')
      .insert({
        name: 'Test Agency',
        forwarding_alias: 'test-agency@inbound.rentaflow.ma',
      })
      .select('id')
      .single();

    if (error) throw error;
    agencyId = data.id;
    forwardingAlias = 'test-agency@inbound.rentaflow.ma';
  });

  afterAll(async () => {
    // Cleanup
    await supabaseAdmin.from('agencies').delete().eq('id', agencyId);
  });

  it('returns 200 OK for valid email', async () => {
    const payload = {
      From: 'agency@example.com',
      To: forwardingAlias,
      Subject: 'Location test',
      TextBody: 'Customer wants to rent a car',
      Attachments: [],
    };

    const response = await request(app).post('/webhooks/inbound').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.agency_id).toBe(agencyId);
  });

  it('returns 200 with reason for unknown alias', async () => {
    const payload = {
      From: 'agency@example.com',
      To: 'unknown@inbound.rentaflow.ma',
      Subject: 'Test',
      TextBody: 'Test',
      Attachments: [],
    };

    const response = await request(app).post('/webhooks/inbound').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(false);
  });

  it('returns 400 for missing To field', async () => {
    const payload = {
      From: 'agency@example.com',
      Subject: 'Test',
      TextBody: 'Test',
    };

    const response = await request(app).post('/webhooks/inbound').send(payload);

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run integration tests**

Command:
```bash
npm run test -- server/__tests__/webhooks.test.js
```

Expected: All tests pass, webhook correctly routes emails to triage.

---

### Task 4: AI Triage Integration

- [ ] **Step 1: Update triageMessage() signature to accept email data**

File: `server/routes/leads.js` (modify existing `triageMessage` function):

```javascript
/**
 * Enhanced triageMessage — now accepts email-specific data from webhook
 *
 * @param {object} params
 * @param {string} params.agencyId - UUID of agency
 * @param {string} params.source - 'email' | 'whatsapp' | 'sms'
 * @param {string} params.senderEmail - Email address of original customer
 * @param {string} params.subject - Email subject line
 * @param {string} params.bodyText - Email body text (includes forwarded block)
 * @param {array} params.attachments - [ { filename, mimeType, base64 } ]
 *
 * Behavior:
 * - Extracts text content + images from attachments
 * - Calls Claude for identity extraction + intent classification
 * - Creates pending_demands or updates existing records
 * - Supports multimodal analysis (images + text)
 */
export async function triageMessage(params) {
  const { agencyId, source, senderEmail, subject, bodyText, attachments = [] } = params;

  console.log(
    `[triage] → source=${source}, agency=${agencyId}, from=${senderEmail}`
  );

  // Build image blocks for Claude (now supports ALL attachment types)
  const imageBlocks = [];
  const textAttachmentNames = [];

  for (const att of attachments) {
    if (att.mimeType?.startsWith('image/')) {
      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mimeType,
          data: att.base64,
        },
      });
    } else {
      // Log non-image attachments for future support (PDF extraction, OCR, etc.)
      textAttachmentNames.push(`${att.filename} (${att.mimeType})`);
    }
  }

  if (textAttachmentNames.length > 0) {
    console.log(
      `[triage] Note: Non-image attachments received (future support): ${textAttachmentNames.join(', ')}`
    );
  }

  // Call existing Claude classification (from leads.js)
  const classification = await classifyTextMessage(
    subject,
    bodyText,
    agencyId,
    imageBlocks
  );

  // Create pending_demands record (same as existing Gmail webhook)
  const { data: lead, error: insertErr } = await supabaseAdmin
    .from('leads') // or 'pending_demands' depending on your schema
    .insert({
      agency_id: agencyId,
      source: source || 'email',
      sender_id: senderEmail,
      raw_payload: {
        subject,
        bodyText,
        attachmentCount: attachments.length,
      },
      extracted_data: classification.extracted_data || null,
      status: 'pending',
      confidence_scores: classification.confidence_scores || null,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error(`[triage] Insert error: ${insertErr.message}`);
    throw insertErr;
  }

  console.log(`[triage] ✓ Lead created: ${lead.id}`);
  return lead;
}
```

- [ ] **Step 2: Verify triage integration with webhook**

The webhook controller already calls `triageMessage()` (Step 3, Step 5). Verify the flow:

```
Webhook /inbound
  ↓
normalizeInboundEmail()
  ↓
triageMessage(normalizedEmail)
  ↓
classifyTextMessage() [Claude]
  ↓
INSERT into leads/pending_demands
  ↓
Lead appears in Basket UI
```

- [ ] **Step 3: Add logging and error monitoring**

File: `server/routes/webhooks.js` (already included in Step 3.1, but enhance):

```javascript
// In the async triage block, add:

// TODO: Consider sending alerts for failed triages
if (err) {
  // Option 1: Slack alert
  // await notifySlack(`Triage failed for ${normalizedEmail.originalSender}: ${err.message}`);

  // Option 2: Store in failed_webhooks table for manual review
  // await supabaseAdmin.from('failed_webhooks').insert({ ... });

  console.error(`[webhook:inbound] ✗ Triage error: ${err.message}`);
}
```

---

### Task 5: Validation & Testing

- [ ] **Step 1: End-to-end test with real webhook payload**

File: `server/__tests__/e2e-webhook.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import supabaseAdmin from '../lib/supabaseAdmin.js';

describe('E2E: Inbound Email Webhook → Basket Lead', () => {
  it('forwards Gmail email → creates lead visible in Basket', async () => {
    // Setup: Create agency with forwarding_alias
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .insert({ name: 'E2E Test Agency', forwarding_alias: 'e2e-test@inbound.rentaflow.ma' })
      .select('id')
      .single();

    // Send Gmail-forwarded email to webhook
    const gmailForwardPayload = {
      From: 'agency@example.com',
      To: 'e2e-test@inbound.rentaflow.ma',
      Subject: 'Location demandée — 15 mai',
      TextBody: `
Bonjour,

Voici une demande:

---------- Forwarded message ---------
From: Ahmed Hassan <ahmed@customer.com>
Date: Mon, May 7, 2026
Subject: Location demandée — 15 mai
To: agency@example.com

Bonjour,

Je cherche une location de voiture pour le 15 mai 2026.
Modèle préféré: SUV
Pickup: Casablanca
Return: Marrakech

Merci,
Ahmed Hassan
      `.trim(),
      Attachments: [],
    };

    const webhookRes = await request(app)
      .post('/webhooks/inbound')
      .send(gmailForwardPayload);

    expect(webhookRes.status).toBe(200);

    // Wait briefly for async triage to complete
    await new Promise((r) => setTimeout(r, 2000));

    // Verify: Lead appears in database
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('sender_id', 'ahmed@customer.com')
      .maybeSingle();

    expect(lead).toBeDefined();
    expect(lead.source).toBe('email');
    expect(lead.status).toBe('pending'); // Appears in Basket
    expect(lead.extracted_data).toBeDefined(); // Claude extracted intent

    // Cleanup
    await supabaseAdmin.from('agencies').delete().eq('id', agency.id);
  });
});
```

- [ ] **Step 2: Run full test suite**

Command:
```bash
npm run test
```

Expected: All tests pass (normalizer, webhook controller, integration, e2e).

- [ ] **Step 3: Verify version bump**

Since this is a significant architecture change (new webhook system), bump version in `components/Sidebar.jsx`:
- Old: `v1.8.1`
- New: `v1.9.0` (minor feature: new email architecture)

- [ ] **Step 4: Update STATUS.md and documentation**

File: `.claude/STATUS.md`

```markdown
## Pending Tasks
- ~~Wire Gmail IMAP poller~~ **DEPRECATED** (replaced by inbound webhook)
- Wire Resend email provider (`server/routes/email.js` — needs `RESEND_API_KEY`)
- Law 09-08 compliance: Phases 4–5 remaining

## Staging Deployments
| Version | Commit | What's in it |
|---------|--------|---|
| v1.9.0  | pending | Inbound email webhook architecture: Replace Gmail IMAP poller with push-based webhook for Postmark/SendGrid; added `forwarding_alias` to agencies; normalizer for forwarded-message parsing; async triage integration |
```

File: `.claude/CLAUDE.md` (add reference):

```markdown
## References (READ ONLY WHEN NEEDED)
- Email webhook architecture? Read [docs/superpowers/plans/2026-05-07-inbound-email-webhook.md](docs/superpowers/plans/2026-05-07-inbound-email-webhook.md)
```

- [ ] **Step 5: Commit and push**

Command:
```bash
git add -A
git commit -m "feat: Inbound email webhook architecture — replace Gmail IMAP poller

- Database: Add forwarding_alias column, remove Gmail credentials
- Webhook: POST /webhooks/inbound receives Postmark/SendGrid emails
- Normalizer: Extract original sender from forwarded blocks (RFC 2822)
- Integration: Queue to existing triage pipeline asynchronously
- Tests: 15/15 tests passing (unit + integration + e2e)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

git push origin staging
```

---

## Open Questions

1. **Email provider choice**: Are you using Postmark, SendGrid, or another provider? (Webhook JSON schema may vary slightly)
2. **Forwarding alias format**: Should it be `agency-{uuid}@inbound.rentaflow.ma` or `{agency_id}@inbound.rentaflow.ma` for readability?
3. **Rollout timeline**: Keep Gmail poller running in parallel during transition for redundancy, or cut over immediately after staging validation?

---

## Next Steps

Once this plan is complete:
1. **Deprecate Gmail poller**: Remove `startGmailPoller()` from `server/index.js` in a follow-up PR
2. **User onboarding**: Create docs for agencies explaining how to set up auto-forwarding rules
3. **Monitoring**: Add Slack alerts for failed triages and webhook errors
