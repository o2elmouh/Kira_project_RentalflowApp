# RentaFlow Bug Fix Bundle: Team Onboarding, Language Selector, Document Alerts & New Rental State

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical bugs: (1) Team member invitation workflow with data loss, role validation, and email delays; (2) Restore language selector regression in Settings; (3) Add expired document alerts for CIN/Driver License; (4) Implement new rental workflow state persistence (saved drafts).

**Architecture:** 
- Team onboarding: Fix backend invitation endpoint to join existing agency (not create new), add role validation, investigate email delay, fix data loss on signup
- Language selector: Move from Sidebar to Settings page, merge 3 config tabs (Agency, Fleet, General) into single scrollable page with language toggle at top
- Document alerts: Add expiry validation in ScanStep and ContractStep, display modal with close/continue options
- New rental state: Persist draft rentals in localStorage/sessionStorage, display saved drafts as card grid on NewRental landing

**Tech Stack:** React 18, Supabase Auth, React i18next, TailwindCSS/CSS-in-JS, localStorage for draft persistence

---

## Scope Note

These 4 bugs are related but independent enough for parallel task execution. However, **Bug #1 (team onboarding)** is critical and blocks other work — prioritize it. The plan is ordered accordingly: team first, then language/settings, then document alerts, then new rental.

---

## File Map

**Bug #1: Team Onboarding**
- Modify: `server/routes/team.js` — fix POST /team/invite endpoint to validate role, join existing agency, investigate email delay
- Modify: `pages/Auth.jsx` — ensure signup uses agency_id from invite token, not creating new agency
- Modify: `pages/settings/TeamTab.jsx` — improve error messaging, add role validation feedback
- Create: `lib/teamInviteToken.js` — helper to encode/decode invite tokens with agency_id
- Test: `server/routes/team.test.js` — unit tests for invite endpoint

**Bug #2: Language Selector & Settings Merge**
- Modify: `pages/Settings.jsx` — merge 3 tabs into single scrollable page, add language selector at top
- Modify: `components/Sidebar.jsx` — remove language selector (move to Settings)
- Delete: `pages/settings/GeneralTab.jsx` (if exists) — content merged into Settings
- Modify: `pages/settings/AgencyTab.jsx` — integrate into main Settings page
- Modify: `pages/settings/FleetTab.jsx` — integrate into main Settings page
- Test: Manual verification that all 3 sections render, scroll works, language toggle affects app

**Bug #3: Document Expiry Alerts**
- Create: `components/DocumentExpiryAlert.jsx` — reusable modal with close/continue buttons
- Modify: `pages/rental/ScanStep.jsx` — add CIN/passport expiry check, display alert modal
- Modify: `pages/rental/ContractStep.jsx` — add driver license expiry check, display alert modal
- Create: `utils/documentValidation.js` — helper functions to check expiry dates
- Test: Unit tests for expiry check logic, manual testing with backdated OCR data

**Bug #4: New Rental Workflow State**
- Modify: `pages/NewRental.jsx` — detect saved drafts, display grid of draft cards + "New Rental" button
- Create: `lib/newRentalDraft.js` — helper functions to save/load/delete drafts from localStorage
- Modify: `pages/rental/ContractStep.jsx` — add "Save and Quit" button that persists state
- Test: Unit tests for draft persistence, manual testing of save/load flow

---

## Tasks

### Task 1: Fix Team Invitation Endpoint — Role Validation & Agency Join

**Files:**
- Modify: `server/routes/team.js`
- Create: `lib/teamInviteToken.js`
- Modify: `server/routes/team.test.js`

- [ ] **Step 1: Understand current invite flow**

Read `server/routes/team.js` to find:
- POST `/team/invite` endpoint (sends invitation email)
- POST `/team/accept-invite` endpoint (user clicks link, creates account)
- Current error handling and validation

Expected findings:
- Invite endpoint accepts `email` and `role` from request body
- Role validation may be missing or incorrect ("role must be admin or staff" error comes from here)
- Accept endpoint may be creating new agency instead of joining existing

- [ ] **Step 2: Create invite token helper module**

**Create file:** `lib/teamInviteToken.js`

```js
import jwt from 'jsonwebtoken'

const SECRET = process.env.INVITE_TOKEN_SECRET || 'dev-secret-change-in-production'

/**
 * Generate an invite token with agency_id and role embedded.
 * Token expires in 7 days.
 */
export function generateInviteToken(agencyId, email, role) {
  return jwt.sign(
    { agencyId, email, role, iat: Math.floor(Date.now() / 1000) },
    SECRET,
    { expiresIn: '7d' }
  )
}

/**
 * Verify and decode an invite token.
 * @returns { agencyId, email, role } or throws if invalid
 */
export function verifyInviteToken(token) {
  return jwt.verify(token, SECRET)
}
```

- [ ] **Step 3: Update invite endpoint to validate role and embed agency_id**

In `server/routes/team.js`, find POST `/team/invite` and update:

**Before:**
```js
router.post('/invite', requireAuth, async (req, res) => {
  const { email, role } = req.body
  const agencyId = req.user.profile.agency_id

  // Send email logic
  // Missing: role validation, missing: agency_id in token
})
```

**After:**
```js
import { generateInviteToken } from '../lib/teamInviteToken.js'

const VALID_ROLES = ['agent', 'admin']

router.post('/invite', requireAuth, async (req, res) => {
  const { email, role } = req.body
  const agencyId = req.user.profile.agency_id

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ 
      error: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(', ')}` 
    })
  }

  // Validate email format
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  try {
    // Generate invite token with agency_id and role embedded
    const token = generateInviteToken(agencyId, email, role)
    const inviteUrl = `${process.env.FRONTEND_URL}/auth?inviteToken=${token}`

    // Send email via Resend (or your email provider)
    // TODO: Review email send timing — if slow, consider async queue
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@rentalflow.local',
        to: email,
        subject: 'Invitation RentaFlow',
        html: `
          <p>Vous avez été invité à rejoindre RentaFlow en tant que ${role}.</p>
          <p><a href="${inviteUrl}">Accepter l'invitation</a></p>
          <p>Ce lien expire dans 7 jours.</p>
        `,
      }),
    })

    if (!response.ok) {
      const resendError = await response.json()
      console.error('[team] Resend API error:', resendError)
      // Don't expose Resend error to client — send generic message
      return res.status(500).json({ error: 'Failed to send invitation email. Try again later.' })
    }

    res.status(200).json({ success: true, message: `Invitation sent to ${email}` })
  } catch (err) {
    console.error('[team] invite error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})
```

- [ ] **Step 4: Update Auth.jsx to use invite token when available**

In `pages/Auth.jsx` (signup form), check for `inviteToken` query param:

**Find the signup submission handler and update:**

```js
const handleSignup = async (e) => {
  e.preventDefault()
  
  // Check if there's an invite token in URL
  const inviteToken = new URLSearchParams(window.location.search).get('inviteToken')
  
  if (inviteToken) {
    // Decode token to get agency_id and role
    try {
      const decoded = verifyInviteToken(inviteToken) // Call backend endpoint
      // Use decoded.agencyId instead of creating new agency
      // Set decoded.role as user role
    } catch (err) {
      setError('Invalid or expired invite link')
      return
    }
  } else {
    // No invite token — creating new agency (owner signup)
    // Current behavior
  }
  
  // Continue with signup using agencyId from invite token or new agency
}
```

- [ ] **Step 5: Write unit test for role validation**

**Modify/Create:** `server/routes/team.test.js`

```js
import { describe, it, expect, vi } from 'vitest'
import team from './team.js'

describe('POST /team/invite', () => {
  it('should reject invalid role', async () => {
    const res = await mockRequest('POST', '/invite', {
      body: { email: 'test@example.com', role: 'superuser' },
      user: { profile: { agency_id: 'agency-123' } },
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid role')
  })

  it('should accept valid roles', async () => {
    const validRoles = ['agent', 'admin']
    for (const role of validRoles) {
      const res = await mockRequest('POST', '/invite', {
        body: { email: 'test@example.com', role },
        user: { profile: { agency_id: 'agency-123' } },
      })
      expect(res.status).toBe(200)
    }
  })

  it('should reject invalid email', async () => {
    const res = await mockRequest('POST', '/invite', {
      body: { email: 'not-an-email', role: 'agent' },
      user: { profile: { agency_id: 'agency-123' } },
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid email')
  })
})
```

- [ ] **Step 6: Test manually in staging**

1. Log in as admin
2. Go to Settings → Team
3. Enter email: `testuser@example.com`, Role: `agent`
4. Click "Inviter"
5. **Expected:** Success message, no role validation error
6. Check email (use fake email service if needed) — email should arrive within 2-3 seconds
7. Click invite link in email
8. **Expected:** Auth page loads, pre-fills role as 'agent', does NOT create new agency
9. Complete signup
10. **Expected:** User appears in agency members list, data (clients, fleet, contracts) is intact

- [ ] **Step 7: Commit**

```bash
git add lib/teamInviteToken.js server/routes/team.js server/routes/team.test.js pages/Auth.jsx
git commit -m "fix(team): validate role, embed agency_id in invite token, fix account creation flow"
```

---

### Task 2: Investigate Email Send Delay in Resend

**Files:**
- Modify: `server/routes/team.js` (from Task 1)
- Reference: Resend API docs

- [ ] **Step 1: Check Resend API response times**

In `server/routes/team.js`, add timing logs around email send:

```js
const emailStart = Date.now()
const response = await fetch('https://api.resend.com/emails', { /* ... */ })
const emailDuration = Date.now() - emailStart
console.log(`[team] Email sent in ${emailDuration}ms`)
```

- [ ] **Step 2: Test in staging and measure**

1. Send 3 invitations and note the logged duration
2. **Expected:** Should be < 500ms if network is fast
3. If > 1000ms, check Resend status page (resend.com/status) for API issues

- [ ] **Step 3: If slow, implement async queue**

If Resend is consistently slow (> 1s), move email sending to async job queue:

```js
// Instead of awaiting email:
queueEmailJob({ email, inviteUrl }) // Returns immediately

// Background worker sends email asynchronously
// User sees success immediately, email arrives shortly after
```

For now, add a comment documenting the observed delay and move to next task.

- [ ] **Step 4: Commit timing logs**

```bash
git add server/routes/team.js
git commit -m "debug(team): add email send timing logs to investigate delay"
```

---

### Task 3: Restore Language Selector — Move from Sidebar to Settings

**Files:**
- Modify: `components/Sidebar.jsx` — remove language selector
- Modify: `components/LanguageSelector.jsx` (if standalone) or create new
- Modify: `pages/Settings.jsx` — add language selector at top

- [ ] **Step 1: Check current language selector location**

Open `components/Sidebar.jsx` and find where language selector is rendered. Example:

```jsx
<div className="sidebar-footer">
  <LanguageSelector />
</div>
```

Note the exact location and styling.

- [ ] **Step 2: Remove from Sidebar**

Delete the language selector lines from Sidebar.jsx:

```jsx
// REMOVE THIS:
// <LanguageSelector />
```

- [ ] **Step 3: Create LanguageSelector component (if not standalone)**

If `components/LanguageSelector.jsx` doesn't exist, create it:

```jsx
import { useTranslation } from 'react-i18next'

export default function LanguageSelector() {
  const { i18n } = useTranslation()
  
  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="form-input"
      style={{ fontSize: 13, padding: '6px 10px' }}
    >
      <option value="fr">🇫🇷 Français</option>
      <option value="ar">🇲🇦 العربية</option>
      <option value="en">🇬🇧 English</option>
    </select>
  )
}
```

- [ ] **Step 4: Merge Settings tabs into single page**

Read `pages/Settings.jsx` to see current tab structure. Expected:

```jsx
const [activeTab, setActiveTab] = useState('agency') // or 'fleet', 'general'

return (
  <div>
    <div className="tabs">
      <button onClick={() => setActiveTab('agency')}>Agence</button>
      <button onClick={() => setActiveTab('fleet')}>Parc</button>
      <button onClick={() => setActiveTab('general')}>Général</button>
    </div>
    {activeTab === 'agency' && <AgencyTab />}
    {activeTab === 'fleet' && <FleetTab />}
    {activeTab === 'general' && <GeneralTab />}
  </div>
)
```

Replace with single scrollable page:

```jsx
import { useState } from 'react'
import LanguageSelector from '../components/LanguageSelector'
import AgencyTab from './settings/AgencyTab'
import FleetTab from './settings/FleetTab'
import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t } = useTranslation('settings')

  return (
    <div className="page-container">
      {/* Language Selector — Top */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          {t('language', 'Langue')}:
        </label>
        <LanguageSelector />
      </div>

      {/* Agency Settings */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {t('agency', 'Agence')}
        </h2>
        <AgencyTab />
      </div>

      {/* Fleet Settings */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {t('fleet', 'Parc')}
        </h2>
        <FleetTab />
      </div>

      {/* Privacy Tab (already exists from Phase 3) */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {t('privacy', 'Confidentialité')}
        </h2>
        <PrivacyTab />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update Sidebar to remove language selector**

In `components/Sidebar.jsx`, find and remove any LanguageSelector import and usage.

- [ ] **Step 6: Test manually**

1. Open Settings page
2. **Expected:** Language selector visible at top
3. Change language to Arabic
4. **Expected:** All Settings content updates to Arabic immediately
5. Navigate away and back
6. **Expected:** Language persists (i18next stores in localStorage)
7. Scroll through Settings
8. **Expected:** All 3 sections (Agency, Fleet, Privacy) visible below language selector, scrollable

- [ ] **Step 7: Commit**

```bash
git add components/Sidebar.jsx components/LanguageSelector.jsx pages/Settings.jsx pages/settings/AgencyTab.jsx pages/settings/FleetTab.jsx
git commit -m "fix(settings): restore language selector, merge 3 tabs into single scrollable page"
```

---

### Task 4: Add Document Expiry Alert Modal

**Files:**
- Create: `components/DocumentExpiryAlert.jsx`
- Create: `utils/documentValidation.js`
- Modify: `pages/rental/ScanStep.jsx`
- Modify: `pages/rental/ContractStep.jsx`

- [ ] **Step 1: Create document validation helper**

**Create file:** `utils/documentValidation.js`

```js
/**
 * Check if a date string is in the past (expired).
 * @param {string} dateStr - ISO date string or 'YYYY-MM-DD'
 * @returns {boolean} true if date is in the past
 */
export function isDateExpired(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return date < new Date()
}

/**
 * Get days until expiry (negative if already expired)
 * @param {string} dateStr - ISO date string or 'YYYY-MM-DD'
 * @returns {number} days until expiry
 */
export function daysUntilExpiry(dateStr) {
  if (!dateStr) return null
  const expiryDate = new Date(dateStr)
  const today = new Date()
  const diffMs = expiryDate - today
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Check if any required document is expired.
 * @param {Object} extracted - OCR extracted_data object
 * @returns {Object|null} { type: 'cin'|'license', expiry: dateStr } or null
 */
export function checkDocumentExpiry(extracted) {
  if (!extracted) return null

  // Check CIN/Passport expiry
  if (extracted.expiryDate) {
    if (isDateExpired(extracted.expiryDate)) {
      return { type: 'cin', expiry: extracted.expiryDate }
    }
  }

  // Check Driver License expiry (if present)
  if (extracted.licenseExpiry) {
    if (isDateExpired(extracted.licenseExpiry)) {
      return { type: 'license', expiry: extracted.licenseExpiry }
    }
  }

  return null
}
```

- [ ] **Step 2: Create reusable alert modal component**

**Create file:** `components/DocumentExpiryAlert.jsx`

```jsx
import { useTranslation } from 'react-i18next'

/**
 * Alert modal for expired documents.
 * @param {Object} props
 * @param {string} props.documentType - 'cin' or 'license'
 * @param {string} props.expiryDate - ISO date string
 * @param {Function} props.onClose - Handler for "Fermer" button
 * @param {Function} props.onContinue - Handler for "Continuer" button
 */
export default function DocumentExpiryAlert({
  documentType,
  expiryDate,
  onClose,
  onContinue,
}) {
  const { t } = useTranslation('rental')

  const docLabel = documentType === 'cin' ? 'Carte d\'identité' : 'Permis de conduire'

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 24, maxWidth: 400,
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#ef4444' }}>
          ⚠️ {t('documentExpired', 'Document expiré')}
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16, color: 'var(--text2)' }}>
          Le {docLabel} expiré le <strong>{new Date(expiryDate).toLocaleDateString('fr-FR')}</strong>.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          {t('expiredDocWarning', 'Vous pouvez continuer, mais nous vous recommandons de demander un document à jour.')}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >
            {t('close', 'Fermer')}
          </button>
          <button
            onClick={onContinue}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {t('continue', 'Continuer')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Integrate into ScanStep (document upload)**

In `pages/rental/ScanStep.jsx`, add alert on document extraction:

```jsx
import { useState } from 'react'
import DocumentExpiryAlert from '../../components/DocumentExpiryAlert'
import { checkDocumentExpiry } from '../../utils/documentValidation'

export default function ScanStep() {
  const [expiredDoc, setExpiredDoc] = useState(null) // { type, expiry }
  const [blockContinue, setBlockContinue] = useState(false)

  const handleDocumentScanned = async (extractedData) => {
    // Check for expiry
    const expiry = checkDocumentExpiry(extractedData)
    if (expiry) {
      setExpiredDoc(expiry)
      setBlockContinue(true) // Optional: require user to acknowledge
      return
    }

    // No expiry issue, proceed
    saveAndContinue(extractedData)
  }

  const handleAlertClose = () => {
    // User clicked "Fermer" — clear the alert but don't proceed
    setExpiredDoc(null)
    setBlockContinue(false)
  }

  const handleAlertContinue = () => {
    // User clicked "Continuer" — proceed despite expiry
    setExpiredDoc(null)
    // Continue to next step
  }

  return (
    <div>
      {/* Existing scan UI */}
      {/* ... */}

      {/* Alert modal */}
      {expiredDoc && (
        <DocumentExpiryAlert
          documentType={expiredDoc.type}
          expiryDate={expiredDoc.expiry}
          onClose={handleAlertClose}
          onContinue={handleAlertContinue}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrate into ContractStep (driver license)**

In `pages/rental/ContractStep.jsx`, add same logic for driver license:

```jsx
import { useEffect, useState } from 'react'
import DocumentExpiryAlert from '../../components/DocumentExpiryAlert'
import { checkDocumentExpiry } from '../../utils/documentValidation'

export default function ContractStep({ client, onProceed }) {
  const [expiredDoc, setExpiredDoc] = useState(null)

  useEffect(() => {
    // Check if client has driver license and if it's expired
    if (client.driving_license_expiry) {
      const expiry = checkDocumentExpiry({
        licenseExpiry: client.driving_license_expiry,
      })
      if (expiry) {
        setExpiredDoc(expiry)
      }
    }
  }, [client])

  const handleExpiredContinue = () => {
    setExpiredDoc(null)
    onProceed() // Proceed to next step
  }

  return (
    <div>
      {/* Existing contract UI */}
      {/* ... */}

      {expiredDoc && (
        <DocumentExpiryAlert
          documentType={expiredDoc.type}
          expiryDate={expiredDoc.expiry}
          onClose={() => setExpiredDoc(null)}
          onContinue={handleExpiredContinue}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write unit tests**

**Create file:** `utils/documentValidation.test.js`

```js
import { describe, it, expect } from 'vitest'
import { isDateExpired, checkDocumentExpiry } from './documentValidation'

describe('documentValidation', () => {
  it('should detect expired date', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    expect(isDateExpired(pastDate.toISOString())).toBe(true)
  })

  it('should detect non-expired date', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 1)
    expect(isDateExpired(futureDate.toISOString())).toBe(false)
  })

  it('should check CIN expiry in extracted data', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)

    const result = checkDocumentExpiry({
      expiryDate: pastDate.toISOString(),
      cinNumber: 'AB123456',
    })

    expect(result).toEqual({
      type: 'cin',
      expiry: pastDate.toISOString(),
    })
  })
})
```

- [ ] **Step 6: Test manually**

1. Use OCR to scan a CIN/passport with expiry date set to 5 days ago
2. **Expected:** Alert modal appears with:
   - Title: "⚠️ Document expiré"
   - Message shows expiry date
   - Two buttons: "Fermer" and "Continuer"
3. Click "Fermer"
4. **Expected:** Alert closes, user stays on ScanStep (doesn't proceed)
5. Scan again, click "Continuer"
6. **Expected:** Alert closes, workflow continues to next step

- [ ] **Step 7: Commit**

```bash
git add utils/documentValidation.js utils/documentValidation.test.js components/DocumentExpiryAlert.jsx pages/rental/ScanStep.jsx pages/rental/ContractStep.jsx
git commit -m "feat(rental): add document expiry alerts for CIN and driver license"
```

---

### Task 5: Implement New Rental Workflow State Persistence (Saved Drafts)

**Files:**
- Create: `lib/newRentalDraft.js` — localStorage helpers
- Modify: `pages/NewRental.jsx` — show saved drafts on landing
- Modify: `pages/rental/ContractStep.jsx` — add "Save and Quit" button

- [ ] **Step 1: Create draft persistence helper**

**Create file:** `lib/newRentalDraft.js`

```js
const STORAGE_KEY = 'rentalflow_draft_rentals'

/**
 * Load all draft rentals for current user/agency.
 * @returns {Array<Object>} Array of { id, createdAt, clientName, vehicle, ...}
 */
export function loadDrafts() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * Save a single draft rental.
 * @param {Object} draft — { clientName, vehicleId, startDate, endDate, notes, ... }
 * @returns {string} id of saved draft
 */
export function saveDraft(draft) {
  const id = `draft_${Date.now()}`
  const drafts = loadDrafts()
  drafts.push({
    id,
    createdAt: new Date().toISOString(),
    ...draft,
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  return id
}

/**
 * Load a specific draft by id.
 * @param {string} id
 * @returns {Object|null}
 */
export function getDraft(id) {
  const drafts = loadDrafts()
  return drafts.find(d => d.id === id) || null
}

/**
 * Delete a draft by id.
 */
export function deleteDraft(id) {
  let drafts = loadDrafts()
  drafts = drafts.filter(d => d.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

/**
 * Clear all drafts (on successful contract creation).
 */
export function clearDrafts() {
  localStorage.removeItem(STORAGE_KEY)
}
```

- [ ] **Step 2: Modify NewRental landing page to show drafts**

In `pages/NewRental.jsx`, on initial load, check for saved drafts:

```jsx
import { useState, useEffect } from 'react'
import { loadDrafts, deleteDraft } from '../lib/newRentalDraft'
import { useNavigate } from 'react-router-dom'

export default function NewRental() {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState([])
  const [started, setStarted] = useState(false)

  useEffect(() => {
    // On mount, check for drafts
    const allDrafts = loadDrafts()
    setDrafts(allDrafts)
  }, [])

  const handleNewRental = () => {
    setStarted(true)
    navigate('./rental/step/1') // Start workflow
  }

  const handleResumeDraft = (id) => {
    navigate(`./rental/resume/${id}`)
  }

  const handleDeleteDraft = (id) => {
    if (!window.confirm('Supprimer ce brouillon ?')) return
    deleteDraft(id)
    setDrafts(d => d.filter(x => x.id !== id))
  }

  // If no drafts and workflow not started, show "New Rental" button only
  if (drafts.length === 0 && !started) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Nouvelle Location</h1>
          <button
            onClick={handleNewRental}
            className="btn btn-primary"
            style={{ fontSize: 16, padding: '12px 24px' }}
          >
            + Créer une nouvelle location
          </button>
        </div>
      </div>
    )
  }

  // Show grid of drafts + "New Rental" button
  return (
    <div className="page-container">
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Locales en cours</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {/* "New Rental" card */}
        <div
          onClick={handleNewRental}
          style={{
            border: '2px dashed var(--border)',
            borderRadius: 10,
            padding: 24,
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 160,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>+</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nouvelle location</div>
          </div>
        </div>

        {/* Draft cards */}
        {drafts.map(draft => (
          <div
            key={draft.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div onClick={() => handleResumeDraft(draft.id)}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                {draft.clientName || 'Client sans nom'}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                {draft.vehicleId ? `Véhicule sélectionné` : 'Pas de véhicule'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                Commencé le {new Date(draft.createdAt).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => handleResumeDraft(draft.id)}
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
              >
                Continuer
              </button>
              <button
                onClick={() => handleDeleteDraft(draft.id)}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', flex: 0 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add "Save and Quit" button in ContractStep**

In `pages/rental/ContractStep.jsx`, add a "Save and Quit" button alongside "Next":

```jsx
import { saveDraft } from '../../lib/newRentalDraft'

export default function ContractStep({ formData, onNext }) {
  const handleSaveAndQuit = () => {
    // Save current form state to localStorage
    const draftData = {
      clientName: formData.client?.first_name,
      vehicleId: formData.vehicleId,
      startDate: formData.startDate,
      endDate: formData.endDate,
      notes: formData.notes,
      // Add any other relevant state
    }
    saveDraft(draftData)

    // Show success message
    alert('Brouillon sauvegardé. Vous pouvez le reprendre plus tard.')

    // Navigate back to NewRental landing
    window.location.href = '/new-rental'
  }

  return (
    <div>
      {/* Existing form */}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="btn btn-ghost">← Retour</button>
        <button className="btn btn-primary" onClick={onNext}>
          Suivant →
        </button>
        <button
          className="btn btn-outline"
          onClick={handleSaveAndQuit}
          style={{ marginLeft: 'auto' }}
        >
          Enregistrer et quitter
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add resume workflow (load draft)**

Create a route handler in `pages/NewRental.jsx` or a new page `pages/rental/ResumeDraft.jsx`:

```jsx
import { useParams } from 'react-router-dom'
import { getDraft } from '../../lib/newRentalDraft'
import { useEffect, useState } from 'react'

export default function ResumeDraft() {
  const { draftId } = useParams()
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    const d = getDraft(draftId)
    if (!d) {
      alert('Brouillon non trouvé')
      window.location.href = '/new-rental'
      return
    }
    setDraft(d)
    // Load draft data into form state
  }, [draftId])

  if (!draft) return <div>Chargement…</div>

  // Render form with draft data pre-filled
  return (
    <div>
      {/* Contract form pre-filled with draft.clientName, draft.vehicleId, etc. */}
    </div>
  )
}
```

- [ ] **Step 5: Write unit tests**

**Create file:** `lib/newRentalDraft.test.js`

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDrafts, getDraft, deleteDraft, clearDrafts } from './newRentalDraft'

describe('newRentalDraft', () => {
  beforeEach(() => {
    clearDrafts()
  })

  it('should save and load drafts', () => {
    const draft = { clientName: 'Ahmed', vehicleId: 'v-123' }
    const id = saveDraft(draft)
    const loaded = getDraft(id)
    expect(loaded.clientName).toBe('Ahmed')
    expect(loaded.vehicleId).toBe('v-123')
  })

  it('should list all drafts', () => {
    saveDraft({ clientName: 'Client 1' })
    saveDraft({ clientName: 'Client 2' })
    const all = loadDrafts()
    expect(all.length).toBe(2)
  })

  it('should delete a draft', () => {
    const id = saveDraft({ clientName: 'Test' })
    deleteDraft(id)
    const loaded = getDraft(id)
    expect(loaded).toBe(null)
  })
})
```

- [ ] **Step 6: Test manually**

1. Start a new rental (click "+ Créer une nouvelle location")
2. Fill in some data (client, vehicle, dates)
3. Click "Enregistrer et quitter"
4. **Expected:** Success message, navigated back to NewRental landing
5. **Expected:** Draft card visible showing client name and date
6. Click "Continuer" on draft
7. **Expected:** Form pre-fills with saved data
8. Click "Supprimer" on draft card
9. **Expected:** Draft removed from list
10. Refresh page
11. **Expected:** Drafts persist (loaded from localStorage)

- [ ] **Step 7: Commit**

```bash
git add lib/newRentalDraft.js lib/newRentalDraft.test.js pages/NewRental.jsx pages/rental/ContractStep.jsx pages/rental/ResumeDraft.jsx
git commit -m "feat(rental): implement saved draft workflow with persistent state"
```

---

## Summary of Bugs Fixed

| Bug # | Issue | Fix | Files | Version |
|-------|-------|-----|-------|---------|
| 1 | Team invitation: role validation, email delay, data loss | Validate role in endpoint, embed agency_id in token, fix signup to join existing agency | server/routes/team.js, pages/Auth.jsx | v1.6.0 |
| 2 | Language selector regression | Move from Sidebar to Settings, merge 3 tabs into scrollable page | pages/Settings.jsx, components/Sidebar.jsx | v1.6.1 |
| 3 | No alerts for expired documents | Add modal with close/continue buttons for CIN/passport/license | components/DocumentExpiryAlert.jsx, pages/rental/ScanStep.jsx | v1.6.2 |
| 4 | New rental workflow loses state on navigation | Persist drafts to localStorage, show draft grid on landing | pages/NewRental.jsx, lib/newRentalDraft.js | v1.6.3 |

---

Plan complete and saved to `docs/superpowers/plans/2026-05-06-bugfix-bundle.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review spec compliance and code quality between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session with checkpoints.

**Which approach?**