---
name: deployment-patterns
description: Deployment workflows for Vercel + Railway — CI/CD, health checks, rollback, production readiness checklist.
origin: ECC
---

# Deployment Patterns

## Strategies

### Rolling (default — your setup)
Zero downtime, two versions run briefly in parallel. Requires backward-compatible changes.

### Blue-Green
Instant rollback, 2x infra during deploy. Best for critical services.

### Canary
5% → 50% → 100% traffic shift. Catches issues with real traffic.

## GitHub Actions CI/CD
```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run build

  # Vercel deploys automatically on push to main
  # Railway deploys automatically on push to main
```

## Health Check Endpoint (Railway backend)
```typescript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

app.get('/health/detailed', async (req, res) => {
  let dbOk = false
  try { await supabaseAdmin.from('agencies').select('id').limit(1); dbOk = true } catch {}
  const ok = dbOk
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    ts: new Date().toISOString(),
  })
})
```

## Environment Variable Validation (startup)
```typescript
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL']
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`)
}
```

## Rollback
```bash
# Railway — redeploy a previous commit
railway up --commit <previous-sha>

# Vercel — instant rollback in dashboard or CLI
vercel rollback
```

## Production Readiness Checklist

### Application
- [ ] `npm run build` passes with no errors
- [ ] No hardcoded secrets
- [ ] Error handling on all async operations
- [ ] Health check endpoint working

### Vercel (Frontend)
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_AUTH`, `VITE_API_URL` set
- [ ] SPA rewrites configured (all routes → `/index.html`)
- [ ] HTTPS enforced

### Railway (Backend)
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `NODE_ENV=production` set
- [ ] CORS configured for Vercel domain only
- [ ] Rate limiting enabled
- [ ] Health check URL monitored

### Supabase
- [ ] RLS enabled on all tables
- [ ] All policies tested
- [ ] Indexes on FK columns
- [ ] `whatsapp-temp` storage bucket created (public) — for WhatsApp PDF feature
