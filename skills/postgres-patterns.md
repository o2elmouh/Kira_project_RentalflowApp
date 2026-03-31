---
name: postgres-patterns
description: PostgreSQL quick reference — index types, data types, RLS, UPSERT, cursor pagination, anti-pattern detection. Supabase-aligned.
origin: ECC
---

# PostgreSQL Patterns

## Index Cheat Sheet
| Query Pattern | Index Type |
|---|---|
| `WHERE col = value` | B-tree (default) |
| `WHERE a = x AND b > y` | Composite: `(a, b)` |
| `WHERE jsonb @> '{}'` | GIN |
| Time-series ranges | BRIN |

## Data Types
| Use Case | Correct Type | Avoid |
|---|---|---|
| IDs | `uuid` or `bigint` | `int` |
| Strings | `text` | `varchar(255)` |
| Timestamps | `timestamptz` | `timestamp` |
| Money | `numeric(10,2)` | `float` |
| Flags | `boolean` | `int`, `varchar` |

## RLS Policy (Optimized)
```sql
-- Wrap auth.uid() in SELECT to prevent per-row calls
CREATE POLICY "select_own" ON contracts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
```

## UPSERT
```sql
INSERT INTO settings (user_id, key, value)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

## Cursor Pagination (O(1) vs OFFSET O(n))
```sql
SELECT * FROM contracts
WHERE id > $last_id
ORDER BY id
LIMIT 20;
```

## Partial Index
```sql
-- Only index active records
CREATE INDEX idx_contracts_active ON contracts (client_id)
WHERE status = 'active';
```

## Covering Index
```sql
CREATE INDEX idx_contracts_cover ON contracts (client_id)
INCLUDE (status, created_at);
```

## Queue Processing
```sql
UPDATE jobs SET status = 'processing'
WHERE id = (
  SELECT id FROM jobs WHERE status = 'pending'
  ORDER BY created_at LIMIT 1
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

## Anti-Pattern Detection
```sql
-- Find unindexed foreign keys
SELECT conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
  );

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

## Anti-Patterns to Avoid
- `SELECT *` in production
- `OFFSET` pagination on large tables
- `int` for IDs (use `bigint` or `uuid`)
- `timestamp` without timezone
- Random UUIDs as PKs (use UUIDv7 or IDENTITY)
- `GRANT ALL` to application user
- RLS functions called per-row (wrap in `SELECT`)
