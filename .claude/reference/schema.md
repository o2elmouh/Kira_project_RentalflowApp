# RentaFlow — Schema & Environment Variables Reference

## Environment Variables

### Vercel (frontend)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_USE_AUTH=true
VITE_API_URL=https://xxx.up.railway.app
```

### Railway (backend)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   ← never in frontend
FRONTEND_URL=https://rentaflow.vercel.app
NODE_ENV=production
PORT=                         ← set by Railway automatically
RESEND_API_KEY=               ← optional, for email
ANTHROPIC_API_KEY=            ← Claude API key for AI damage detection
VITE_CMI_MERCHANT_ID=         ← CMI merchant ID for payment links (can be in frontend)
```

## Supabase Schema

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK = auth.users.id) | |
| full_name | text | |
| email | text | |
| phone | text | |
| role | text | `'admin'` \| `'staff'` |
| agency_id | uuid (FK → agencies.id) | |
| created_at | timestamptz | |

### `agencies`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| city | text | |
| ice | text | 15-char Moroccan tax ID |
| rc | text | Registre de commerce |
| created_at | timestamptz | |
