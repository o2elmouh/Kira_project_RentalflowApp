---
name: verification-loop
description: Pre-PR quality gate — build, typecheck, lint, tests, security scan, diff review.
origin: ECC
---

# Verification Loop

Run before every PR or significant change.

## Phase 1 — Build
```bash
npm run build 2>&1 | tail -20
```
If FAIL → stop and fix before continuing.

## Phase 2 — Type Check
```bash
npx tsc --noEmit 2>&1 | head -30
```

## Phase 3 — Lint
```bash
npm run lint 2>&1 | head -30
```

## Phase 4 — Tests
```bash
npm test -- --coverage 2>&1 | tail -30
# Target: 80% minimum
```

## Phase 5 — Security Scan
```bash
grep -rn "sk-" --include="*.js" --include="*.jsx" . | head -10
grep -rn "api_key\s*=" --include="*.js" --include="*.jsx" . | head -10
grep -rn "console.log" src/ | head -10
```

## Phase 6 — Diff Review
```bash
git diff --stat
git diff HEAD~1 --name-only
```
Check each changed file for unintended changes, missing error handling, edge cases.

## Output Format
```
VERIFICATION REPORT
===================
Build:    [PASS/FAIL]
Types:    [PASS/FAIL] (X errors)
Lint:     [PASS/FAIL] (X warnings)
Tests:    [PASS/FAIL] (X/Y passed, Z% coverage)
Security: [PASS/FAIL] (X issues)
Diff:     [X files changed]

Overall: [READY / NOT READY] for PR

Issues:
1. ...
```
