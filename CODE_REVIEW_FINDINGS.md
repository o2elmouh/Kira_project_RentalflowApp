# Code Review — 2026-06-04

Full-codebase audit of webapp (HEAD `a4c6981` / v1.14.23) and mobile (HEAD `f630f67` / v1.14.20). Critical / High / Medium findings were fixed inline (see commit log + v1.14.24). The Low findings below are documented for the maintainer to triage.

---

## Resolved in this review (fixed inline)

| Sev | Title | File | Status |
|---|---|---|---|
| CRITICAL | Mobile Step4 flips vehicle→rented before signing channel chosen | `mobile:src/screens/rental/Step4ConfirmScreen.js` | **Fixed** (deferred to after sendForSignature succeeds) |
| HIGH | `VALID_CLASSIFICATIONS` / `VALID_PATCH_CLASSIFICATIONS` stale | `server/routes/leads.js` | **Fixed** (aligned with real pipeline values) |
| HIGH | Signing-token HMAC falls back to `'fallback-dev-key'` in production | `server/lib/contractSigning.js` | **Fixed** (refuses to mint when neither `SIGNING_TOKEN_SECRET` nor `ENCRYPTION_KEY` set in `NODE_ENV=production`) |
| HIGH | `getClientStatus` always returns `no_contract` for `@lid` senders | `server/routes/leads.js` | **Fixed** (explicit `@lid` short-circuit; documented unsupported case) |
| HIGH | `findActiveLeadByPhone` false-positives across `@lid` ↔ phone-number senders via last-9-digit match | `server/routes/leads.js` | **Fixed** (sender-shape gating before digit suffix match) |
| HIGH | Mobile fallback BASE_URL `'http://localhost:3001'` silently breaks production | `mobile:src/lib/api.js` | **Fixed** (throws when `__DEV__` is false and no API URL configured) |
| HIGH | Mobile `getAvailableVehicles` overlap predicate diverges from web | `mobile:src/lib/db.js` | **Fixed** (aligned to `.eq('status','active')` to match web's `findVehicleConflicts` + `get_available_vehicles` RPC) |
| MEDIUM | SignURL fallback hits `https://app.rentaflow.local` if `FRONTEND_URL` missing | `server/lib/contractSigning.js` | **Fixed** (refuses to mint in production when `FRONTEND_URL` not set) |

---

## Low — recommended but not blocking

### L1 — `MAX_PDF_BASE64_LENGTH` comment vs. constant disagree
**File**: `server/lib/contractSigning.js:87`
**Issue**: Comment says `// ~15MB decoded PDF` but the constant is `20 * 1024 * 1024` (= 20 MB **encoded**, ≈ 15 MB decoded after base64 → bytes). The comment isn't wrong about decoded size, but it's confusing. Worth renaming to `MAX_PDF_BASE64_ENCODED_BYTES` or splitting into `MAX_PDF_ENCODED` + `MAX_PDF_DECODED`.
**Why low**: cosmetic; no behaviour issue.

### L2 — `levenshtein` allocates O(m×n) for every name match
**File**: `server/routes/leads.js:71`
**Issue**: Allocates a fresh 2D array per call. With names short (< 50 chars) and matches infrequent, this is fine, but with thousands of matches/sec it'd churn the GC.
**Why low**: not on a hot path; current usage is dozens/min at most.

### L3 — `findMatchingDemand` is window-based (30 min) — fragile against clock skew
**File**: `server/routes/leads.js:208` area
**Issue**: Time-window matching uses `WINDOW_MINUTES = 30` with server clock. If Railway and Supabase clocks drift > 30 min during an outage, merges could miss/duplicate. Unlikely but worth a sanity check via NTP.
**Why low**: theoretical, never observed.

### L4 — `handleOfferResponse` reply array is in-memory mutated then upserted
**File**: `server/routes/leads.js:840` area
**Issue**: `[...existingReplies, newReply].slice(-50)` keeps last 50. If two replies arrive within milliseconds the second update overwrites the first (lost-update race). Replies are advisory data so impact is minor.
**Why low**: low frequency; agent never relies on perfect ordering.

### L5 — Public signing endpoint rate limit by IP only
**File**: `server/routes/contracts.js:430` area
**Issue**: `rateLimit({ keyGenerator: r => r.ip })` — a CGNAT IP shared by many phone users would be rate-limited together. Could lock out legitimate clients during a busy day.
**Why low**: signing volume is low; 60 reads / 15 min is generous.

### L6 — Frontend `App.jsx` page routing via `useState` (no URL persistence)
**File**: `App.jsx`
**Issue**: Page state is in React state, not the URL. Refreshing always lands on the default page; can't deep-link; back button doesn't work. Per CLAUDE.md this is intentional (SPA without router), but it limits sharing & navigation UX.
**Why low**: documented design choice. Re-evaluate when adding deep links beyond the existing `?sign=` token.

### L7 — Mobile `db.js` `getContractById` selects `'*'` then post-processes
**File**: `mobile:src/lib/db.js:161`
**Issue**: `select('*')` over-fetches encrypted PII columns from the network even when only `contract_number` + dates are needed by callers. Per Law 09-08 minimize-data principle, ideally narrow the select.
**Why low**: amount of data is small; encryption-at-rest still protects.

### L8 — Mobile no automated tests
**File**: `mobile:` root
**Issue**: Project has no `__tests__/` directory and no test infra (vitest / jest). Recent ports (prolongation UX, conflict detection) shipped without coverage. Per CLAUDE.md §8 every feature should have tests.
**Why low**: pragmatic — adding RN test infra is its own project. Track as backlog.

### L9 — `linkPreview: null` patch is per-call, easy to forget
**File**: `server/lib/baileys/sessionManager.js:294`
**Issue**: Future contributors writing a new `sock.sendMessage()` path elsewhere could accidentally pass `{ text }` again and reintroduce the link-preview bug.
**Mitigation**: the helper `buildOutboundTextMessage` exists but isn't enforced. Consider an ESLint rule banning bare `{ text: ... }` to `sock.sendMessage`, or wrap `sock.sendMessage` itself.
**Why low**: only one call site today; tested.

### L10 — `media_urls` array on `pending_demands` unbounded
**File**: `server/routes/leads.js`
**Issue**: When a client sends many photos via WhatsApp, `media_urls` grows without limit. The `extracted_data` merge similarly accretes. Could bloat individual rows.
**Why low**: each upload is ~30 KB JSON entry; impact at 100 uploads is < 4 MB per row. Add a hard cap at ~20 if you ever see DB warnings.

### L11 — Anthropic API key checked per-call, not at startup
**File**: `server/routes/leads.js` multiple places
**Issue**: Every Claude call does `if (!process.env.ANTHROPIC_API_KEY) return null`. Server should log a startup warning if the key is missing instead of failing silently per-request.
**Why low**: visible in dev when triage stops working.

### L12 — `analyzeQuoteReply` returns `'question'` as soft default on every error path
**File**: `server/routes/leads.js:1274`
**Issue**: If Anthropic API fails / throws / times out, function returns `'question'` — which makes the caller skip the accept-route. A legitimate "OK je prends" might be silently misclassified during a Claude outage.
**Why low**: rare and recovers on next message.

### L13 — Mobile `LeadDetailScreen` async effects don't cancel on unmount in every path
**File**: `mobile:src/screens/LeadDetailScreen.js`
**Issue**: Two of the three effects use `let cancelled = false ... return () => { cancelled = true }` correctly. The `load()` call inside `useEffect(() => { load() }, [leadId])` doesn't track an outer cancel flag — if the user navigates away while loading, the eventual `setLead(data)` calls fire on an unmounted component → React warning (or memory hold).
**Why low**: React 18+ doesn't crash, just warns in dev.

### L14 — Webapp `Sidebar.jsx` polls `/leads?status=pending` every 1s
**File**: `components/Sidebar.jsx`
**Issue**: 1-second polling per active session = 3600 backend hits/hour for the badge count. With N concurrent agents this scales linearly. Original choice was to compensate for broken Realtime — see v1.12.5/v1.12.6 status entries.
**Why low**: shipped & accepted trade-off. If you ever see Railway egress alerts, switch to 5-second polling or fix Realtime.

### L15 — `RESERVATION_ALLOWED_FIELDS` does NOT include `contract_id`
**File**: `server/lib/reservationSchema.js`
**Issue**: Reservations are sometimes linked back to contracts (via `lead_id` mostly), but `contract_id` is server-managed only — there's no endpoint that sets it. If you ever need to associate a manually created reservation with a contract via PATCH, you'd have to extend the allow-list.
**Why low**: working as intended today.

### L16 — `pending_demands.classification` lacks a CHECK constraint
**File**: `supabase/migrations/`
**Issue**: The column is plain text; any classification value can be written. Recent bugs (`'new_lead'` vs `'lead'`) would have been caught by a `CHECK (classification IN (...))` constraint.
**Mitigation**: add a constraint in the next migration — `ALTER TABLE pending_demands ADD CONSTRAINT pending_demands_classification_chk CHECK (classification IS NULL OR classification IN ('new_lead','prolongation','support_issue','alert'))`. Backfill any drift first.
**Why low**: requires data audit before applying.

### L17 — `extractWithClaude` rate-limit handling absent
**File**: `server/routes/leads.js:171`
**Issue**: No retry/backoff on Anthropic 429s. A burst of inbound WhatsApp could exhaust per-minute quota and silently drop classifications for a window.
**Why low**: current volume well within quota.

### L18 — Mobile `src/lib/version.js` is a one-liner; bumps need git commits
**File**: `mobile:src/lib/version.js`
**Issue**: Version is hardcoded in a JS string. Easier path: read from `package.json` so `version` in EAS builds + UI stay aligned.
**Why low**: existing convention works.

### L19 — Webapp `App.jsx` doesn't differentiate fatal vs. transient API errors
**File**: `App.jsx` (and `lib/api.js`)
**Issue**: On a transient 502 the agent sees the same toast as on a permanent 403; no auto-retry, no offline fallback.
**Why low**: UX nit, not a correctness issue.

### L20 — `server/routes/whatsapp.js#handleInboundWhatsApp` shim (if present) and the real handler share name
**File**: `server/routes/whatsapp.js` + `server/routes/leads.js#handleInboundWhatsApp`
**Issue**: Two functions with similar responsibilities. Worth a code-tour comment naming which is the canonical one.
**Why low**: clarified by reading the file; not a bug.

---

## Notes for the maintainer

- The cleanup SQL from v1.14.21 (drop `extracted_data IS NULL` rows) still needs to run on staging — see the previous chat / STATUS.md.
- Consider scheduling the `cleanup:pending` cron in Railway (mentioned in `.claude/STATUS.md`) — Phase 2 of Law 09-08 isn't fully wired without it.
- The PATCH `/leads/:id/status` test coverage is light; the classification validation fix in this audit added one test but a fuller status-state-machine test set would catch future regressions.

End of audit.
