---
name: security-review
description: Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features.
origin: ECC
---

# Security Review Skill

## When to Activate
- Implementing authentication or authorization
- Handling user input or file uploads
- Creating new API endpoints
- Working with secrets or credentials
- Implementing payment features
- Storing or transmitting sensitive data
- Integrating third-party APIs

## Security Checklist

### 1. Secrets Management
```typescript
// FAIL: NEVER Do This
const apiKey = "sk-proj-xxxxx"
const dbPassword = "password123"

// PASS: ALWAYS Do This
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
```
- [ ] No hardcoded API keys, tokens, or passwords
- [ ] All secrets in environment variables
- [ ] `.env.local` in .gitignore
- [ ] Production secrets in hosting platform (Vercel, Railway)

### 2. Input Validation
```typescript
import { z } from 'zod'
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})
export async function createUser(input: unknown) {
  const validated = CreateUserSchema.parse(input)
  return await db.users.create(validated)
}
```

### 3. SQL Injection Prevention
```typescript
// FAIL: String concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`

// PASS: Parameterized queries
const { data } = await supabase.from('users').select('*').eq('email', email)
```

### 4. Authentication & Authorization
```typescript
// Always verify on server, never trust client
export async function requireAuth(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) throw new ApiError(401, 'Missing authorization token')
  return verifyToken(token)
}
```
- [ ] JWT stored in httpOnly cookies (not localStorage)
- [ ] Token expiry validated
- [ ] Refresh token rotation implemented

### 5. XSS Prevention
```typescript
// FAIL: Dangerous HTML injection
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// PASS: Escape user content
<div>{userContent}</div>
```

### 6. Rate Limiting (Express)
```typescript
import rateLimit from 'express-rate-limit'
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/api/', limiter)
```

### 7. Sensitive Data Exposure
- [ ] Passwords hashed (bcrypt/argon2), never stored plaintext
- [ ] No sensitive data in logs or error messages
- [ ] HTTPS enforced everywhere
- [ ] Stack traces hidden in production

### 8. Dependency Security
```bash
npm audit --audit-level=high
```

## Pre-Deployment Security Checklist
- [ ] npm audit passes
- [ ] No hardcoded secrets
- [ ] All endpoints authenticated/authorized
- [ ] Input validated on server
- [ ] Rate limiting enabled
- [ ] CORS configured for allowed origins only
- [ ] Security headers set (CSP, HSTS, X-Frame-Options)
