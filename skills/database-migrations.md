---
name: database-migrations
description: Safe PostgreSQL schema changes — zero-downtime, expand-contract, concurrent indexes, batch data migrations.
origin: ECC
---

# Database Migration Patterns

## Core Rules
1. Every change is a migration — never alter production manually
2. Forward-only in production — rollbacks use new forward migrations
3. Schema and data migrations are separate
4. Test against production-sized data
5. Never edit a migration that has run in production

## Safety Checklist
- [ ] New columns are nullable OR have a default value
- [ ] Indexes created with `CONCURRENTLY`
- [ ] Data backfill is a separate migration
- [ ] Rollback plan documented

## Adding a Column
```sql
-- GOOD: nullable, no lock
ALTER TABLE contracts ADD COLUMN notes TEXT;

-- GOOD: with default (Postgres 11+ instant)
ALTER TABLE contracts ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- BAD: NOT NULL without default — locks whole table
ALTER TABLE contracts ADD COLUMN status TEXT NOT NULL;
```

## Adding an Index (No Downtime)
```sql
-- BAD: blocks writes
CREATE INDEX idx_contracts_client ON contracts (client_id);

-- GOOD: non-blocking
CREATE INDEX CONCURRENTLY idx_contracts_client ON contracts (client_id);
```

## Renaming a Column (Zero-Downtime)
```sql
-- Migration 1: add new column
ALTER TABLE clients ADD COLUMN id_number TEXT;

-- Migration 2: backfill
UPDATE clients SET id_number = cin_number WHERE id_number IS NULL;

-- Deploy: app reads/writes both columns

-- Migration 3: drop old column (after deploy)
ALTER TABLE clients DROP COLUMN cin_number;
```

## Large Data Backfill (Batched)
```sql
DO $$
DECLARE rows_updated INT;
BEGIN
  LOOP
    UPDATE contracts SET normalized_ref = UPPER(contract_number)
    WHERE id IN (
      SELECT id FROM contracts WHERE normalized_ref IS NULL
      LIMIT 5000 FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

## Zero-Downtime Strategy
```
Phase 1 EXPAND:  Add new column (nullable/default)
Phase 2 MIGRATE: App writes to both old + new, backfill existing
Phase 3 CONTRACT: App reads only new → drop old column
```

## Anti-Patterns
| Anti-Pattern | Fix |
|---|---|
| NOT NULL without default | Add nullable first, backfill, add constraint later |
| Inline index on large table | Use `CREATE INDEX CONCURRENTLY` |
| Schema + data in one migration | Split into two migrations |
| Dropping column before removing app code | Remove app references first |
