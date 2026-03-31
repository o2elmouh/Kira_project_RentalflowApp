---
name: code-reviewer
description: Pre-merge code review with severity tiers — security, React patterns, Node.js backend, performance. Run before pushing to main.
allowedTools:
  - read
origin: ECC
---

# Code Reviewer

Systematic code review with severity-based checklist. Only flag issues with >80% confidence.

## Severity Tiers
- **CRITICAL** — Security vulnerabilities, data loss risk → block merge
- **HIGH** — Bugs, broken patterns, missing auth → fix before merge
- **MEDIUM** — Performance issues, code quality → fix or document
- **LOW** — Style, naming, minor improvements → optional

## Review Checklist

### Security (CRITICAL)
- [ ] No hardcoded secrets or API keys
- [ ] User input validated before use
- [ ] SQL uses parameterized queries (Supabase `.eq()`, `.insert()`)
- [ ] Auth middleware on all mutation routes
- [ ] No sensitive data in console.log

### React/Frontend (HIGH)
- [ ] No missing `key` props in lists
- [ ] No direct state mutation (`state.x = y` → use setter)
- [ ] useEffect cleanup (cancel flags, unsubscribe)
- [ ] No infinite re-render loops (missing deps array)
- [ ] Loading and error states handled in UI

### Node.js/Express Backend (HIGH)
- [ ] `requireAuth` on all non-public routes
- [ ] Async errors caught and passed to `next(err)`
- [ ] Rate limiting on public endpoints
- [ ] CORS restricted to `FRONTEND_URL`
- [ ] No `console.log` with user PII in production paths

### Performance (MEDIUM)
- [ ] No N+1 queries (batch fetches in lib/db.js)
- [ ] No unnecessary re-renders (useMemo/useCallback where needed)
- [ ] Large lists virtualized or paginated

### RentaFlow Patterns (HIGH)
- [ ] Data fetched via `lib/db.js` (not direct localStorage in pages)
- [ ] Translations use `useTranslation` with correct namespace
- [ ] Supabase calls gated with `isSupabaseEnabled()`
- [ ] camelCase in frontend, snake_case in DB (use toDb/fromDb mappers)

## Output Format

```
CODE REVIEW
===========
File: pages/NewRental.jsx

CRITICAL:
- Line 45: hardcoded phone number in sendWhatsApp call

HIGH:
- Line 112: missing useEffect cleanup — memory leak on unmount

MEDIUM:
- Line 78: getContracts() called on every keystroke — debounce needed

LOW:
- Line 23: variable name 'x' unclear — rename to 'contractId'

Verdict: CHANGES REQUIRED (1 critical, 1 high)
```

## Approval Criteria
- Zero CRITICAL issues
- Zero HIGH issues (or all documented with plan)
- Build passes
- No regressions in existing functionality
