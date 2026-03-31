---
name: security-reviewer
description: Security vulnerability detection — OWASP Top 10, secrets, input validation, auth. Run after touching server/middleware/auth.js, routes, or Supabase client code.
allowedTools:
  - read
  - shell
origin: ECC
---

# Security Reviewer

## Core Mission
Identify and fix security weaknesses across:
1. Secrets detection (hardcoded credentials)
2. Input validation (user-controlled data)
3. Authentication/Authorization
4. Injection vulnerabilities (SQL, command)
5. Dependency CVEs

## Scan Commands
```bash
npm audit --audit-level=high
grep -rn "sk-" --include="*.js" --include="*.jsx" --include="*.ts" . | grep -v node_modules | grep -v .git
grep -rn "password\s*=" --include="*.js" . | grep -v node_modules
grep -rn "console.log" server/ | head -20
```

## OWASP Top 10 Checklist
- [ ] **A01 Broken Access Control** — `requireAuth` on all non-public routes
- [ ] **A02 Cryptographic Failures** — No plaintext passwords, HTTPS enforced
- [ ] **A03 Injection** — Supabase parameterized queries, no string concatenation
- [ ] **A04 Insecure Design** — Rate limiting on auth routes, WhatsApp routes
- [ ] **A05 Security Misconfiguration** — CORS restricted to FRONTEND_URL, no `*`
- [ ] **A06 Vulnerable Components** — `npm audit` passes
- [ ] **A07 Auth Failures** — JWT verified server-side, short expiry
- [ ] **A08 Integrity Failures** — Env vars validated at startup
- [ ] **A09 Logging Failures** — No PII or tokens in logs
- [ ] **A10 SSRF** — External URLs validated before fetch

## RentaFlow-Specific Checks

### server/middleware/auth.js
- [ ] JWT signature verified with Supabase public key
- [ ] Token expiry checked
- [ ] `req.user` set before passing to handlers

### server/routes/whatsapp.js
- [ ] `requireAuth` middleware active
- [ ] Phone number validated before Twilio call
- [ ] PDF size limited before upload
- [ ] Rate limiting: 20 msg/hour per user ✅

### lib/api.js (frontend)
- [ ] No service_role key (only anon key)
- [ ] Auth headers cleared on logout

### Environment Variables
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Railway only, never in frontend
- [ ] `TWILIO_AUTH_TOKEN` — Railway only
- [ ] All keys in `.env` files excluded from git

## High-Severity Patterns
```
CRITICAL: hardcoded secrets in source
CRITICAL: shell commands with user input (exec, spawn)
CRITICAL: SQL string concatenation
HIGH: missing requireAuth on mutation routes
HIGH: no rate limiting on public endpoints
HIGH: stack traces in error responses
MEDIUM: console.log with user data
MEDIUM: CORS set to '*'
```
