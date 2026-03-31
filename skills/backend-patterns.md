---
name: backend-patterns
description: Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js and Express.
origin: ECC
---

# Backend Development Patterns

## When to Activate
- Designing REST API endpoints
- Implementing repository, service, or controller layers
- Optimizing database queries (N+1, indexing)
- Adding caching strategies
- Structuring error handling and validation
- Building middleware (auth, logging, rate limiting)

## Repository Pattern
```typescript
class SupabaseMarketRepository {
  async findAll(filters?: Filters) {
    let query = supabase.from('markets').select('id, name, status')
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data
  }
}
```

## Service Layer
```typescript
class MarketService {
  constructor(private repo: MarketRepository) {}
  async search(query: string) {
    const results = await this.repo.findAll({ query })
    return results.sort((a, b) => b.score - a.score)
  }
}
```

## N+1 Prevention
```typescript
// FAIL
for (const market of markets) {
  market.creator = await getUser(market.creator_id) // N queries
}

// PASS
const creators = await getUsers(markets.map(m => m.creator_id)) // 1 query
const map = new Map(creators.map(c => [c.id, c]))
markets.forEach(m => { m.creator = map.get(m.creator_id) })
```

## Centralized Error Handler
```typescript
class ApiError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}

export function errorHandler(error: unknown, req: Request, res: Response) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ error: error.message })
  }
  console.error('Unexpected error:', error)
  return res.status(500).json({ error: 'Internal server error' })
}
```

## Retry with Exponential Backoff
```typescript
async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn() } catch (err) {
      if (i === maxRetries - 1) throw err
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('unreachable')
}
```

## RBAC
```typescript
const rolePermissions = {
  admin: ['read', 'write', 'delete'],
  agent: ['read', 'write'],
}
export function hasPermission(role: string, permission: string) {
  return rolePermissions[role]?.includes(permission) ?? false
}
```

## Structured Logging
```typescript
const logger = {
  info: (msg: string, ctx?: object) => console.log(JSON.stringify({ level: 'info', msg, ...ctx, ts: new Date().toISOString() })),
  error: (msg: string, err: Error, ctx?: object) => console.log(JSON.stringify({ level: 'error', msg, error: err.message, ...ctx, ts: new Date().toISOString() })),
}
```
