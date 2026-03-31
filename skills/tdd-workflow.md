---
name: tdd-workflow
description: Test-driven development workflow — write tests first, 80%+ coverage, unit/integration/E2E patterns.
origin: ECC
---

# TDD Workflow

## Core Rule: Tests BEFORE Code

### Steps
1. Write failing test
2. Implement minimum code to pass
3. Refactor while keeping green
4. Verify 80%+ coverage

## Unit Test (Vitest/Jest)
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('calls onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when prop is true', () => {
    render(<Button disabled>Click</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

## API Integration Test
```typescript
describe('POST /contracts', () => {
  it('creates contract successfully', async () => {
    const res = await request(app).post('/contracts').send({ clientId: '123', vehicleId: '456' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/contracts').send({})
    expect(res.status).toBe(400)
  })
})
```

## Coverage Config
```json
{
  "vitest": {
    "coverage": {
      "thresholds": { "branches": 80, "functions": 80, "lines": 80 }
    }
  }
}
```

## Common Mistakes
```typescript
// FAIL: Testing implementation details
expect(component.state.count).toBe(5)

// PASS: Test user-visible behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument()

// FAIL: Brittle CSS selectors
await page.click('.css-xyz')

// PASS: Semantic selectors
await page.click('button:has-text("Enregistrer")')
```

## File Organization
```
pages/
  Fleet/
    Fleet.jsx
    Fleet.test.jsx
server/
  routes/
    contracts.js
    contracts.test.js
e2e/
  rental-flow.spec.ts
```
