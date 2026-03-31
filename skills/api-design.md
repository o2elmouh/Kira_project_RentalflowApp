---
name: api-design
description: REST API design conventions, HTTP status codes, pagination, filtering, versioning, and rate limiting patterns.
origin: ECC
---

# API Design Patterns

## URL Structure
```
GET    /api/contracts          # List
GET    /api/contracts/:id      # Single
POST   /api/contracts          # Create
PATCH  /api/contracts/:id      # Update
DELETE /api/contracts/:id      # Delete

# Query params for filtering/sorting/pagination
GET /api/contracts?status=active&sort=created_at&limit=20&offset=0
```

## HTTP Status Codes
| Status | When to use |
|--------|------------|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) |
| 204 | No content (DELETE) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Not authorized |
| 404 | Not found |
| 409 | Conflict |
| 429 | Rate limit exceeded |
| 500 | Server error |

## Response Format
```typescript
// Success
{ success: true, data: T, meta?: { total, page, limit } }

// Error
{ success: false, error: string, details?: object }
```

## Pagination

### Offset (simple)
```
GET /api/contracts?limit=20&offset=40
{ data: [...], meta: { total: 150, limit: 20, offset: 40 } }
```

### Cursor (performant for large tables)
```
GET /api/contracts?after=abc123&limit=20
{ data: [...], meta: { nextCursor: 'xyz789', hasMore: true } }
```

## Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704067200
```

## Error Response
```typescript
// Always include actionable message
{
  success: false,
  error: "Validation failed",
  details: [
    { field: "email", message: "Invalid email format" }
  ]
}
```

## Versioning
- Prefix routes: `/api/v1/contracts`
- Or header: `API-Version: 2024-01-01`
- Maintain backward compatibility for at least 1 version

## Express Implementation
```typescript
router.get('/contracts', async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query
    const contracts = await contractService.findAll({ limit: +limit, offset: +offset, status })
    res.json({ success: true, data: contracts })
  } catch (err) {
    next(err)
  }
})
```
