---
name: coding-standards
description: Code quality principles — KISS, DRY, YAGNI, naming, error handling, React patterns.
origin: ECC
---

# Coding Standards

## Core Principles
- **KISS** — simplest solution that works
- **DRY** — don't repeat yourself, but don't over-abstract
- **YAGNI** — don't build for hypothetical future needs

## Naming
```typescript
// FAIL
const d = new Date()
const fn = (x) => x * 2
const arr = []

// PASS
const currentDate = new Date()
const doublePrice = (price) => price * 2
const activeContracts = []
```

## Immutability
```typescript
// FAIL
user.name = 'New Name'
items.push(newItem)

// PASS
const updatedUser = { ...user, name: 'New Name' }
const updatedItems = [...items, newItem]
```

## Error Handling
```typescript
// FAIL
async function getData() {
  const data = await fetch('/api/data')
  return data.json()
}

// PASS
async function getData() {
  try {
    const res = await fetch('/api/data')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } catch (err) {
    console.error('[getData]', err)
    throw err
  }
}
```

## React Components
```tsx
// FAIL: Too many responsibilities
function Page() {
  // 200 lines of mixed data fetching + UI + validation
}

// PASS: Focused components
function Page() { return <Layout><ContractList /></Layout> }
function ContractList() { /* only renders list */ }
function useContracts() { /* only fetches data */ }
```

## File Organization
```
pages/          ← one file per page
components/     ← reusable UI
lib/            ← data layer, API clients
utils/          ← pure helpers
```

## Code Smells to Avoid
- Functions > 50 lines → split
- Nesting > 4 levels → extract function
- Same code 3+ places → extract utility
- Magic numbers → named constants
- `any` type → proper typing
