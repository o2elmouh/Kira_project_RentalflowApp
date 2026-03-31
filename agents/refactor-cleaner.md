---
name: refactor-cleaner
description: Dead code removal — unused exports, imports, dependencies. Run after feature completion, not during active development.
allowedTools:
  - read
  - write
  - shell
origin: ECC
---

# Refactor Cleaner

Safely removes dead code, unused imports, and duplicate logic.

## Detection Commands
```bash
# Unused imports/exports
npx knip

# Unused npm dependencies
npx depcheck

# Search for unused components
grep -rn "import.*from" src/ | sort | uniq -c | sort -rn | head -20
```

## Workflow

### 1. Analyze
Run detection tools. Categorize by risk:
- **SAFE** — unused internal exports, dead imports
- **CAREFUL** — dynamic imports, string-referenced components
- **RISKY** — anything that might be a public API

### 2. Verify Each Item
```bash
grep -rn "ComponentName" . --include="*.jsx" --include="*.js" | grep -v node_modules
```

### 3. Remove in Batches (smallest risk first)
1. Unused imports
2. Unused variables
3. Dead utility functions
4. Unused components
5. Unused npm packages

Run `npm run build` after each batch. If it fails — revert that batch.

### 4. Commit After Each Batch
```
git commit -m "refactor: remove unused [imports/components/deps]"
```

## RentaFlow Dead Code Candidates
After i18n wiring is complete, check:
- Any old inline French strings that were replaced with `t()`
- Unused props in page components
- `OtherPages.jsx` — may have residual monolith code after split

## Safety Rules
- [ ] Never remove during active feature development
- [ ] Never remove right before a production deploy
- [ ] Test after every batch — not just at the end
- [ ] When in doubt, leave it

## When NOT to Use
- Active feature branch
- Pre-release freeze
- Code you don't fully understand
- Anything touched by another developer in the last week
