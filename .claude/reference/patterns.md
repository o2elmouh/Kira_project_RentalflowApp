# RentaFlow — Key Patterns Reference

## Page Navigation
```js
// App.jsx renderPage() switch — no router
case 'fleet': return <Fleet />
case 'restitution-picker': return <RestitutionPicker onPick={handleRestitution} ... />
```

## Auth Flow
1. `VITE_USE_AUTH=false` → skip auth, seed demo data, go to `ready`
2. `VITE_USE_AUTH=true` → `getSession()` → `resolveUser()` → query `profiles` table
   - Profile found → `ready`
   - No profile → `onboarding`
   - No session → `unauthenticated`

## Role System
- `profile.role`: `'admin'` | `'staff'`
- `UserContext` provides `{ user, profile, role }` app-wide
- `useIsAdmin()` hook for admin-only UI
- Backend: `requireAdmin` middleware on destructive team operations
- localStorage/demo mode defaults to `admin`

## i18n
- Default language: French (`fr`)
- Supported: `fr`, `ar`, `en`
- Language stored in `localStorage` key `rf_language`
- Arabic triggers `document.documentElement.dir = 'rtl'`
- Namespaces: one per page/section (common, auth, onboarding, dashboard, fleet, contracts, clients, invoices, restitution, settings)
- All pages fully wired as of commit `f7e0c81`

## Data Layer
- Primary: localStorage via `utils/storage.js` (`rf_fleet`, `rf_contracts`, `rf_clients`, etc.)
- Secondary: Supabase tables mirror localStorage structure when auth enabled
- Supabase RPC: `onboard_new_agency(p_user_id, p_agency_name, p_full_name, p_email, p_phone, p_city, p_ice, p_rc)`
