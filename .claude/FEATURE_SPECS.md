# RentaFlow Feature Technical Specifications

**Date:** 2026-05-07  
**Version:** Planning for v1.8.0+  
**Current Staging:** v1.7.1  
**Stack:** React 18, Vite, Supabase, Node/Express (Railway), Claude Haiku

---

## Overview

Six feature modifications requested for RentaFlow v1.8.0+. Each feature is self-contained and can be implemented independently. All features are backend-aware and follow TDD patterns.

---

## Feature 1: Arabic RTL Menu Positioning

### Files
- Modify: `components/Sidebar.jsx`
- Context: `lib/i18n.js` (verify language detection)
- Test: `components/__tests__/Sidebar.test.jsx`

### Requirements
1. Detect current language via `useTranslation()` hook → `i18n.language`
2. When Arabic (`ar`) is active, apply RTL flexbox direction to sidebar nav items
3. Mirror left/right padding and icon alignment (icons appear on right in RTL)
4. Logo and footer text remain centered
5. Sidebar width and collapse state unchanged

### Architecture
- Use React Hook: `const { i18n } = useTranslation()`
- Conditional check: `const isRTL = i18n.language === 'ar'`
- Apply to JSX root: `<aside className="sidebar" dir={isRTL ? 'rtl' : 'ltr'}>`
- CSS handles RTL via `[dir="rtl"]` selector in `index.css`

### Code Pattern
```javascript
import { useTranslation } from 'react-i18next'

export default function Sidebar({ active, onNav, user, profile, isAdmin, onSignOut }) {
  const { i18n } = useTranslation('common')
  const isRTL = i18n.language === 'ar'
  
  return (
    <aside className="sidebar" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* existing sidebar content */}
    </aside>
  )
}
```

### CSS Changes (`index.css`)
```css
[dir="rtl"] .sidebar-nav {
  flex-direction: rtl;
}

[dir="rtl"] .nav-item {
  flex-direction: row-reverse;
}

[dir="rtl"] .nav-item span:first-child {
  margin-left: auto;
  margin-right: 0;
}
```

### i18n Verification
- Confirm `public/locales/fr/common.json` has all nav labels
- Confirm `public/locales/ar/common.json` has matching translations
- Current: 10 namespaces, all should have French/Arabic pairs
- Labels: `nav.dashboard`, `nav.newRental`, `nav.restitution`, etc.

### Test Vectors
- Switch language selector to Arabic → nav items right-align
- Logo remains centered
- Footer text (agency name, version, role) remains centered
- Switch back to French → nav items left-align
- Icons flow right-to-left in button groups in RTL mode

### Acceptance Criteria
- [ ] Sidebar renders with `dir="rtl"` when language is Arabic
- [ ] All nav items mirror in RTL mode
- [ ] Logo and footer centered in both modes
- [ ] No broken layout or text overflow
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.7.1 → v1.8.0 in `Sidebar.jsx` line 123

---

## Feature 2: Async Member Invitation (Background Task)

### Files
- Modify: `pages/settings/TeamTab.jsx` (or equivalent team management component)
- Existing: `lib/api.js` (inviteMember already exists at line 108)
- Existing: Backend `POST /api/team/invite` (already implemented)
- Test: `pages/settings/__tests__/TeamTab.test.jsx`

### Requirements
1. Remove `await` from invite button click handler
2. Dispatch invitation in background (don't block UI)
3. Show toast/banner: "Invitation sent to [email]" immediately
4. Handle errors silently or log to console (don't modal block user)
5. Return control to form immediately (allow next invite without waiting)
6. Maintain loading state on button during submission

### Architecture
- Use React state: `const [inviting, setInviting] = useState(false)`
- Fire-and-forget pattern: start task, don't await, return immediately
- Toast notification: Use existing toast library or create simple alert
- Error handling: Log to console, don't interrupt user flow

### Code Pattern
```javascript
import { useState } from 'react'
import { api } from '../../lib/api'

export default function TeamTab() {
  const [inviting, setInviting] = useState(false)
  const [toast, setToast] = useState(null)

  const handleInvite = async (email, role) => {
    setInviting(true)
    
    // Fire-and-forget: don't await the response
    api.inviteMember({ email, role })
      .then(() => {
        setToast({ type: 'success', message: `Invitation sent to ${email}` })
        // Reset form if needed
      })
      .catch(err => {
        console.error('[TeamTab] Invite failed:', err)
        // Silently fail, don't show error modal
      })
      .finally(() => {
        setInviting(false)
        // Dismiss toast after 3 seconds
        setTimeout(() => setToast(null), 3000)
      })
    
    // Return immediately — don't wait for .then()
    return
  }

  return (
    <div>
      {toast && (
        <div className={`alert alert-${toast.type}`}>
          {toast.message}
        </div>
      )}
      <button
        onClick={() => handleInvite(email, role)}
        disabled={inviting}
      >
        {inviting ? 'Sending...' : 'Invite Member'}
      </button>
    </div>
  )
}
```

### API Verification
- `lib/api.js` line 108: `inviteMember: (payload) => request('POST', '/team/invite', payload)`
- Backend endpoint exists: `POST /api/team/invite`
- Payload structure: `{ email, role }`
- Response: `{ success: true }` or error

### Backend (No Changes Required)
- Endpoint already implemented: `server/routes/team.js`
- Behavior: Sends Resend email with invite link (async)
- Current implementation should already be fire-and-forget

### Test Vectors
- Click invite button → button shows "Sending..." immediately
- Toast appears: "Invitation sent to test@example.com"
- Form remains unlocked, can submit another invite without waiting
- Close button or auto-dismiss toast after 3 seconds
- Network delay (5+ seconds) doesn't block UI

### Acceptance Criteria
- [ ] Toast notification shows immediately on submit
- [ ] Button disabled state during inviting, then re-enabled
- [ ] Multiple invites can be submitted in quick succession
- [ ] Form doesn't lock or show any blocking confirmation
- [ ] Error silently logged, no error modal shown
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.8.0 → v1.8.1

---

## Feature 3: Staff Signup Flow (Email/Password Auth)

### Files
- Create: `pages/StaffSignup.jsx` (new file for signup via invite link)
- Modify: `pages/Auth.jsx` (add route detection for invite_token)
- Create Migration: `supabase/migrations/20260507_pending_invitations.sql` (new table)
- Create Backend Endpoint: `server/routes/team.js` → `POST /api/team/accept-invite`
- Test: `pages/__tests__/StaffSignup.test.jsx`

### Database Schema
```sql
CREATE TABLE pending_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  invited_by UUID REFERENCES profiles(id),
  agency_id UUID REFERENCES agencies(id),
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMP,
  CONSTRAINT role_check CHECK (role IN ('staff', 'manager', 'admin'))
);

CREATE INDEX idx_pending_invitations_token ON pending_invitations(id);
CREATE INDEX idx_pending_invitations_email ON pending_invitations(email);
```

### Entry Point
- URL format: `/?invite_token=<uuid>&email=<base64(email)>`
- Example: `https://app.rentaflow.local/?invite_token=550e8400-e29b-41d4-a716-446655440000&email=dGVzdEBleGFtcGxlLmNvbQ==`
- Detection in `App.jsx`: Parse query params, redirect to `<StaffSignup />`

### Flow (5 Steps)
1. **Validate token** → Query `pending_invitations` table with invite_token ID
2. **Check expiry** → If `expires_at < now()`, show error: "Link expired"
3. **Check already accepted** → If `accepted_at IS NOT NULL`, show error: "Already used"
4. **Show form** → Email (pre-filled, read-only), Password, Password Confirm
5. **On submit**:
   - Validate password: min 8 chars, 1 uppercase, 1 number
   - Call `supabase.auth.signUp({ email, password })`
   - On success, call `POST /api/team/accept-invite` with token and UID
   - Redirect to `/onboarding` or `/dashboard`

### Frontend: `pages/StaffSignup.jsx`
```javascript
import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export default function StaffSignup() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const token = searchParams.get('invite_token')
  const emailB64 = searchParams.get('email')
  const email = emailB64 ? atob(emailB64) : ''
  
  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  
  // Step 1: Validate token on mount
  useEffect(() => {
    const validateInvite = async () => {
      try {
        // This would be a new endpoint: GET /api/team/invitations/:token
        const resp = await api.validateInvitation(token)
        if (resp.expired) {
          setError('Invitation link has expired. Please request a new one.')
          return
        }
        if (resp.accepted) {
          setError('This invitation has already been used.')
          return
        }
        setInvitation(resp)
      } catch (err) {
        setError('Invalid invitation link.')
      } finally {
        setLoading(false)
      }
    }
    
    if (token) validateInvite()
  }, [token])
  
  // Step 5: Submit signup
  const handleSignup = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    
    setSubmitting(true)
    setError(null)
    
    try {
      // Sign up with Supabase Auth
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
      })
      
      if (authErr) throw authErr
      
      // Accept invitation on backend
      const acceptResp = await api.acceptInvitation(token, data.user.id)
      if (!acceptResp.success) throw new Error(acceptResp.error)
      
      // Redirect to onboarding or dashboard
      navigate(acceptResp.onboarding ? '/onboarding' : '/dashboard')
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  
  if (loading) return <div>Loading...</div>
  if (error) return <div className="alert alert-danger">{error}</div>
  
  return (
    <div className="auth-page">
      <form onSubmit={handleSignup}>
        <h2>Complete Your Account</h2>
        
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} disabled />
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min 8 chars, 1 uppercase, 1 number"
          />
          <small>{password.length >= 8 ? '✓' : '✗'} At least 8 characters</small>
          <small>{/[A-Z]/.test(password) ? '✓' : '✗'} One uppercase letter</small>
          <small>{/[0-9]/.test(password) ? '✓' : '✗'} One number</small>
        </div>
        
        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
          <small>{password === confirmPassword && password ? '✓ Passwords match' : '✗'}</small>
        </div>
        
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
```

### Backend: `server/routes/team.js` → Add Endpoints

**GET /api/team/invitations/:token**
```javascript
router.get('/invitations/:token', async (req, res, next) => {
  try {
    const { token } = req.params
    const { data, error } = await supabaseAdmin
      .from('pending_invitations')
      .select('id, email, role, agency_id, expires_at, accepted_at')
      .eq('id', token)
      .maybeSingle()
    
    if (error) return next(error)
    if (!data) return res.status(404).json({ error: 'invalid_token' })
    
    const now = new Date()
    const expiresAt = new Date(data.expires_at)
    
    res.json({
      email: data.email,
      role: data.role,
      agencyId: data.agency_id,
      expired: expiresAt < now,
      accepted: data.accepted_at !== null,
    })
  } catch (err) {
    next(err)
  }
})
```

**POST /api/team/accept-invite**
```javascript
router.post('/accept-invite', async (req, res, next) => {
  try {
    const { token, uid } = req.body
    if (!token || !uid) {
      return res.status(400).json({ error: 'token and uid required' })
    }
    
    // Fetch invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from('pending_invitations')
      .select('*')
      .eq('id', token)
      .maybeSingle()
    
    if (invError || !invitation) return res.status(404).json({ error: 'invalid_token' })
    if (invitation.accepted_at) return res.status(409).json({ error: 'already_used' })
    
    const expiresAt = new Date(invitation.expires_at)
    if (expiresAt < new Date()) return res.status(410).json({ error: 'expired' })
    
    // Create profile for this user
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: uid,
        email: invitation.email,
        role: invitation.role,
        agency_id: invitation.agency_id,
        full_name: '',
      })
    
    if (profileError && profileError.code !== '23505') return next(profileError) // 23505 = unique violation
    
    // Mark invitation as accepted
    const { error: updateError } = await supabaseAdmin
      .from('pending_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', token)
    
    if (updateError) return next(updateError)
    
    // Determine if onboarding is needed (check if agency has settings)
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('id')
      .eq('id', invitation.agency_id)
      .maybeSingle()
    
    res.json({
      success: true,
      onboarding: !agency,
      profile: {
        id: uid,
        email: invitation.email,
        role: invitation.role,
        agencyId: invitation.agency_id,
      }
    })
  } catch (err) {
    next(err)
  }
})
```

### API Client Updates: `lib/api.js`
```javascript
export const api = {
  // ... existing endpoints ...
  
  validateInvitation: (token) =>
    request('GET', `/team/invitations/${token}`),
  
  acceptInvitation: (token, uid) =>
    request('POST', '/team/accept-invite', { token, uid }),
}
```

### App Router: `App.jsx`
```javascript
// Detect invite_token in query params
const searchParams = new URLSearchParams(window.location.search)
const inviteToken = searchParams.get('invite_token')

if (inviteToken && !user) {
  return <StaffSignup />
}
```

### Resend Email Template (Backend)
When `POST /api/team/invite` is called, send this email:
```
Subject: You're invited to join RentaFlow

Hi [first_name],

You've been invited to join [agency_name] on RentaFlow.

Click the link below to create your account:
https://app.rentaflow.local/?invite_token=[token]&email=[base64_email]

This link expires in 7 days.

Best regards,
RentaFlow Team
```

### Test Vectors
- Valid token → form loads with pre-filled email
- Expired token → error: "Link expired"
- Already used token → error: "Already used"
- Weak password → validation errors show live
- Password mismatch → submit disabled
- Valid signup → redirects to /onboarding or /dashboard
- Check `profiles` table: new row created with staff role

### Acceptance Criteria
- [ ] `pending_invitations` table created with migration
- [ ] `GET /api/team/invitations/:token` returns invitation status
- [ ] `POST /api/team/accept-invite` creates profile and marks accepted
- [ ] StaffSignup.jsx renders form with email pre-filled
- [ ] Password validation live (min 8, 1 uppercase, 1 number)
- [ ] Signup creates Supabase Auth user + profile record
- [ ] Redirect to onboarding if agency incomplete, else dashboard
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.8.1 → v1.8.2

---

## Feature 4: Role-Based Settings Tab Visibility

### Files
- Modify: `pages/Settings.jsx` (or page containing tabs)
- Context: `lib/UserContext.js` (profile data available)
- Test: `pages/__tests__/Settings.test.jsx`

### Requirements
1. Admin users see all tabs: Agence, Parc, Général, Équipe, Confidentialité
2. Staff users (`role === 'staff'`) see only: Général, Confidentialité
3. Manager users (`role === 'manager'`) see all tabs (same as admin)
4. Tab switching disabled/hidden for staff on restricted tabs
5. Direct URL access to hidden tab (e.g., `/settings?tab=parc`) redirects to first visible tab for staff

### Architecture
- Use `UserContext`: `const { profile } = useContext(UserContext)`
- Tab metadata: Include `requiresAdmin: boolean` flag
- Filter visible tabs based on role before rendering
- Block navigation to hidden tabs

### Code Pattern
```javascript
import { useState, useContext } from 'react'
import { UserContext } from '../lib/UserContext'
import { useTranslation } from 'react-i18next'

const TABS = [
  { id: 'agence', label: 'Agence', requiresAdmin: true, component: AgenceTab },
  { id: 'parc', label: 'Parc', requiresAdmin: true, component: ParcTab },
  { id: 'general', label: 'Général', requiresAdmin: false, component: GeneralTab },
  { id: 'equipe', label: 'Équipe', requiresAdmin: true, component: EquipeTab },
  { id: 'confidentialite', label: 'Confidentialité', requiresAdmin: false, component: ConfidentialiteTab },
]

export default function Settings() {
  const { t } = useTranslation('settings')
  const { profile } = useContext(UserContext)
  const [activeTab, setActiveTab] = useState('general')
  
  // Determine if user is admin (admin or manager)
  const isAdmin = ['admin', 'manager'].includes(profile?.role)
  
  // Filter visible tabs
  const visibleTabs = TABS.filter(tab => !tab.requiresAdmin || isAdmin)
  
  // Ensure active tab is visible, otherwise default to first
  const safeActiveTab = visibleTabs.find(t => t.id === activeTab)?.id || visibleTabs[0]?.id
  
  const handleTabChange = (tabId) => {
    const tab = visibleTabs.find(t => t.id === tabId)
    if (tab) setActiveTab(tab.id)
  }
  
  const activeTabConfig = TABS.find(t => t.id === safeActiveTab)
  const TabComponent = activeTabConfig?.component
  
  return (
    <div className="settings-page">
      <div className="tabs-nav">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${safeActiveTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {t(`tabs.${tab.id}`)}
          </button>
        ))}
      </div>
      
      <div className="tab-content">
        {TabComponent && <TabComponent />}
      </div>
    </div>
  )
}
```

### i18n Updates: `public/locales/fr/settings.json`
```json
{
  "tabs": {
    "agence": "Agence",
    "parc": "Parc",
    "general": "Général",
    "equipe": "Équipe",
    "confidentialite": "Confidentialité"
  }
}
```

And same structure for `public/locales/ar/settings.json`.

### Query Param Handling
```javascript
import { useSearchParams } from 'react-router-dom'

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general')
  const { profile } = useContext(UserContext)
  const isAdmin = ['admin', 'manager'].includes(profile?.role)
  
  const visibleTabs = TABS.filter(tab => !tab.requiresAdmin || isAdmin)
  
  // Validate tab from URL
  const safeTab = visibleTabs.find(t => t.id === activeTab)?.id || visibleTabs[0]?.id
  
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
  }
  
  // ... rest of component ...
}
```

### Test Vectors
- Staff user views Settings → sees only "Général" and "Confidentialité" tabs
- Staff user tries `/settings?tab=parc` → redirects to `/settings?tab=general`
- Admin user views Settings → sees all 5 tabs
- Manager user views Settings → sees all 5 tabs
- Tab buttons for admin-only tabs don't appear in staff view
- Staff cannot click hidden tab buttons

### Acceptance Criteria
- [ ] TABS constant includes `requiresAdmin` flag
- [ ] visibleTabs filter applied before rendering
- [ ] Staff sees only 2 tabs (general, confidentialité)
- [ ] Admin/manager see all 5 tabs
- [ ] Direct URL access to hidden tab redirects safely
- [ ] i18n translations added for all tab labels
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.8.2 → v1.8.3

---

## Feature 5: Staff Access to Basket (Alerts + New Requests)

### Files
- Modify: `components/Sidebar.jsx` (update NAV_IDS)
- Modify: `pages/Basket.jsx` (add role-based filtering)
- Existing: Realtime infrastructure (copy pattern from ContractStep.jsx)
- Test: `pages/__tests__/Basket.test.jsx`

### Requirements
1. Add Basket to staff access (currently admin-only; premium gate was removed in v1.12.0 — RBAC is now the only restriction)
2. Staff and manager can see Basket tab in Sidebar
3. Filter leads visible to staff:
   - Show: New incoming requests (incoming_requests classification)
   - Show: Customer alerts (classification='alert')
   - Hide: Internal operations, team management
4. Real-time updates: Staff subscribed to `leads` table changes
5. Badge on Basket icon shows unread count

### Sidebar Update: `components/Sidebar.jsx`
```javascript
// Before (v1.12.0 removed the `premium: true` flag, leaving: { id: 'basket', key: 'basket', icon: Inbox })

// After: Use staffAccess flag
const NAV_IDS = [
  { id: 'dashboard', key: 'dashboard', icon: LayoutDashboard },
  { id: 'new-rental', key: 'newRental', icon: PlusCircle },
  { id: 'restitution-quick', key: 'restitution', icon: RotateCcw },
  { id: 'fleet', key: 'fleet', icon: Car },
  { id: 'clients', key: 'clients', icon: Users },
  { id: 'documents', key: 'documents', icon: FolderOpen },
  { id: 'calendar', key: 'calendar', icon: CalendarDays },
  { id: 'basket', key: 'basket', icon: Inbox, staffAccess: true },
  { id: 'network', key: 'network', icon: Globe },
  { id: 'settings', key: 'settings', icon: Settings },
]

export default function Sidebar({ active, onNav, user, profile, isAdmin, onSignOut }) {
  const { t } = useTranslation('common')
  const displayName = profile?.full_name || user?.email || ''
  const agencyName = profile?.agencies?.name || ''
  
  // Determine if user can access staff features
  const isStaffOrAdmin = ['staff', 'manager', 'admin'].includes(profile?.role)
  
  // Filter nav: staff can see basket, everyone sees others
  const visibleNav = NAV_IDS.filter(({ id, staffAccess }) => {
    if (staffAccess) return isStaffOrAdmin
    return true
  })
  
  // ... rest of component ...
}
```

### Basket Filtering: `pages/Basket.jsx`
```javascript
import { useContext, useEffect, useState, useRef } from 'react'
import { UserContext } from '../lib/UserContext'
import { supabase } from '../lib/supabase'

export default function Basket() {
  const { profile } = useContext(UserContext)
  const [leads, setLeads] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef(null)
  
  // Determine filter based on role
  const getLeadsFilter = () => {
    const isStaff = profile?.role === 'staff'
    
    if (isStaff) {
      // Staff see: alerts + incoming requests (new leads from other agencies)
      return {
        classifications: ['alert', 'lead'],
        exclude: ['internal_operations'],
      }
    }
    // Admin/manager see everything
    return { classifications: null }
  }
  
  // Fetch initial leads
  useEffect(() => {
    const fetchLeads = async () => {
      const filter = getLeadsFilter()
      
      let query = supabase
        .from('leads')
        .select('*')
        .eq('agency_id', profile?.agency_id)
      
      if (filter.classifications) {
        query = query.in('classification', filter.classifications)
      }
      
      const { data } = await query
      setLeads(data || [])
      setUnreadCount(data?.filter(l => !l.read_at)?.length || 0)
    }
    
    fetchLeads()
  }, [profile?.agency_id, profile?.role])
  
  // Real-time subscription
  useEffect(() => {
    if (!profile?.agency_id) return
    
    const channel = supabase
      .channel(`basket-${profile.agency_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `agency_id=eq.${profile.agency_id}`,
        },
        (payload) => {
          const isStaff = profile?.role === 'staff'
          const newLead = payload.new
          
          // If staff, filter incoming updates
          if (isStaff) {
            const allowedClassifications = ['alert', 'lead']
            if (!allowedClassifications.includes(newLead?.classification)) return
          }
          
          if (payload.eventType === 'INSERT') {
            setLeads(prev => [newLead, ...prev])
            setUnreadCount(prev => prev + 1)
          } else if (payload.eventType === 'UPDATE') {
            setLeads(prev =>
              prev.map(l => l.id === newLead?.id ? newLead : l)
            )
            if (!newLead?.read_at && !payload.old?.read_at) {
              setUnreadCount(prev => prev + 1)
            }
          }
        }
      )
      .subscribe()
    
    channelRef.current = channel
    
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [profile?.agency_id, profile?.role])
  
  // ... rest of Basket component ...
  // Render leads filtered by role
}
```

### Sidebar Badge: Show Unread Count
```javascript
// In Sidebar.jsx, update nav button for Basket
const [unreadCount, setUnreadCount] = useState(0)

// Subscribe to unread leads (only for staff+)
useEffect(() => {
  if (!['staff', 'manager', 'admin'].includes(profile?.role)) return
  
  const channel = supabase
    .channel(`unread-${profile?.agency_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'leads',
      filter: `agency_id=eq.${profile?.agency_id}`,
    }, (payload) => {
      // Count unread leads
      const count = payload.new?.read_at ? -1 : payload.old?.read_at ? 1 : 0
      setUnreadCount(prev => Math.max(0, prev + count))
    })
    .subscribe()
  
  return () => supabase.removeChannel(channel)
}, [profile?.agency_id])

// Render badge on Basket nav item
{id === 'basket' && unreadCount > 0 && (
  <span style={{
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: 700,
    background: '#E85D3F',
    color: '#F3F0EE',
    borderRadius: 999,
    padding: '2px 6px',
    minWidth: 16,
    textAlign: 'center',
  }}>
    {unreadCount}
  </span>
)}
```

### Test Vectors
- Staff user views Sidebar → Basket tab visible
- Staff opens Basket → sees only alerts + leads, no internal ops
- New alert inserted → appears in staff's Basket in real-time
- Staff Sidebar Basket badge shows unread count
- Admin opens Basket → sees all leads regardless of classification
- Real-time filters respect role when updates arrive

### Acceptance Criteria
- [ ] `staffAccess: true` added to Basket in NAV_IDS
- [ ] `visibleNav` filter includes staff role check
- [ ] Basket.jsx filters by classification for staff
- [ ] Real-time subscription respects staff role filtering
- [ ] Badge on Basket icon shows unread count (staff + admin)
- [ ] Staff cannot access internal operations leads
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.8.3 → v1.8.4

---

## Feature 6: ID Document Type Mismatch Detection

### Files
- Modify: `pages/rental/ScanStep.jsx`
- Create: `components/DocumentMismatchModal.jsx`
- Create Backend Endpoint: `server/routes/ai.js` → `POST /api/ai/detect-doc-type` (optional, can use existing)
- Test: `pages/rental/__tests__/ScanStep.test.jsx`

### Requirements
1. During vehicle inspection (ScanStep), capture CIN and driving license images
2. OCR reads document type from each image using Claude vision
3. Detect mismatch: If CIN says "Passport" but License says "License" → modal
4. Show modal on mismatch with detected types
5. Buttons: Cancel (go back, re-scan), Continue (accept and proceed)
6. Staff can continue despite mismatch (confirmation only, not blocking)

### Document Type Detection
Use existing `api.detectDamage()` pattern or new `api.detectDocType()`. Call Claude Haiku vision to classify document from base64.

**Supported Types:**
- CIN field: 'cin', 'passport', 'other'
- License field: 'license', 'permit', 'other'

### State Pattern: `pages/rental/ScanStep.jsx`
```javascript
import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import DocumentMismatchModal from '../../components/DocumentMismatchModal'

export default function ScanStep({ rental, onNext, onBack }) {
  const { t } = useTranslation('rental')
  const [cinFile, setCinFile] = useState(null)
  const [licenseFile, setLicenseFile] = useState(null)
  const [cinType, setCinType] = useState(null)      // 'cin' | 'passport' | 'other'
  const [licenseType, setLicenseType] = useState(null) // 'license' | 'permit' | 'other'
  const [docMismatch, setDocMismatch] = useState(false) // Show modal if true
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  
  // Analyze document type from image
  const analyzeDocType = async (file) => {
    const reader = new FileReader()
    return new Promise((resolve) => {
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1]
          // Call Claude vision API to detect document type
          // This is a simple classification task: "Is this a CIN, Passport, or License?"
          const resp = await api.detectDocType({ image_base64: base64 })
          resolve(resp.type) // Returns: 'cin' | 'passport' | 'license' | 'permit' | 'other'
        } catch (err) {
          console.error('[ScanStep] analyzeDocType failed:', err)
          resolve('other')
        }
      }
      reader.readAsDataURL(file)
    })
  }
  
  // Handle CIN scan
  const handleScanCIN = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setScanning(true)
    setError(null)
    
    try {
      setCinFile(file)
      const type = await analyzeDocType(file)
      setCinType(type)
      
      // Check for mismatch: if we already have license type
      if (licenseType) {
        const isMismatch = (type !== 'cin' && licenseType === 'license') ||
                          (type === 'cin' && licenseType !== 'license')
        if (isMismatch) {
          setDocMismatch(true)
        }
      }
    } catch (err) {
      setError(t('scan.error'))
    } finally {
      setScanning(false)
    }
  }
  
  // Handle License scan
  const handleScanLicense = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setScanning(true)
    setError(null)
    
    try {
      setLicenseFile(file)
      const type = await analyzeDocType(file)
      setLicenseType(type)
      
      // Check for mismatch: if we already have CIN type
      if (cinType) {
        const isMismatch = (cinType !== 'cin' && type === 'license') ||
                          (cinType === 'cin' && type !== 'license')
        if (isMismatch) {
          setDocMismatch(true)
        }
      }
    } catch (err) {
      setError(t('scan.error'))
    } finally {
      setScanning(false)
    }
  }
  
  // Resume after confirming mismatch
  const handleConfirmMismatch = () => {
    setDocMismatch(false)
    // Continue to next step with scanned documents
  }
  
  // Cancel and re-scan
  const handleCancelMismatch = () => {
    setCinFile(null)
    setCinType(null)
    setLicenseFile(null)
    setLicenseType(null)
    setDocMismatch(false)
  }
  
  return (
    <div className="scan-step">
      <h3>{t('scan.title')}</h3>
      
      {error && <div className="alert alert-danger">{error}</div>}
      
      {/* CIN Upload */}
      <div className="form-group">
        <label>{t('scan.cin')}</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleScanCIN}
          disabled={scanning}
        />
        {cinType && (
          <small className={`doc-type ${cinType}`}>
            Detected: {cinType}
          </small>
        )}
      </div>
      
      {/* License Upload */}
      <div className="form-group">
        <label>{t('scan.license')}</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleScanLicense}
          disabled={scanning}
        />
        {licenseType && (
          <small className={`doc-type ${licenseType}`}>
            Detected: {licenseType}
          </small>
        )}
      </div>
      
      {/* Mismatch Modal */}
      {docMismatch && (
        <DocumentMismatchModal
          cinType={cinType}
          licenseType={licenseType}
          onContinue={handleConfirmMismatch}
          onCancel={handleCancelMismatch}
        />
      )}
      
      {/* Navigation */}
      <div className="step-buttons">
        <button onClick={onBack} disabled={scanning}>Back</button>
        <button
          onClick={onNext}
          disabled={!cinFile || !licenseFile || scanning}
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

### Modal Component: `components/DocumentMismatchModal.jsx`
```javascript
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function DocumentMismatchModal({ cinType, licenseType, onContinue, onCancel }) {
  const { t } = useTranslation('rental')
  
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <AlertCircle size={20} style={{ color: '#E85D3F' }} />
          <h2>{t('scan.mismatch.title')}</h2>
        </div>
        
        <div className="modal-body">
          <p>{t('scan.mismatch.message')}</p>
          <div className="mismatch-details">
            <div>
              <strong>{t('scan.cin')}:</strong> {cinType}
            </div>
            <div>
              <strong>{t('scan.license')}:</strong> {licenseType}
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
            {t('scan.mismatch.help')}
          </p>
        </div>
        
        <div className="modal-footer">
          <button className="btn-outline-ink" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="btn-ink" onClick={onContinue}>
            {t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Backend Endpoint (Optional): `server/routes/ai.js`

If `api.detectDocType()` doesn't exist, create it:

```javascript
router.post('/detect-doc-type', requireAuth, async (req, res, next) => {
  try {
    const { image_base64 } = req.body
    if (!image_base64) return res.status(400).json({ error: 'image_base64 required' })
    
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: 'You are a document classifier. Classify images as one of: cin, passport, license, permit, other. Respond with only the type.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image_base64,
              },
            },
            {
              type: 'text',
              text: 'Classify this document. Reply with one word: cin, passport, license, permit, or other.',
            },
          ],
        },
      ],
    })
    
    const type = response.content[0].text.toLowerCase().trim()
    const validTypes = ['cin', 'passport', 'license', 'permit', 'other']
    const detectedType = validTypes.includes(type) ? type : 'other'
    
    res.json({ type: detectedType })
  } catch (err) {
    next(err)
  }
})
```

### API Client: `lib/api.js`
```javascript
export const api = {
  // ... existing endpoints ...
  
  detectDocType: (payload) =>
    request('POST', '/ai/detect-doc-type', payload),
}
```

### i18n Additions: `public/locales/fr/rental.json`
```json
{
  "scan": {
    "title": "Inspection du véhicule",
    "cin": "CIN / Passeport",
    "license": "Permis de conduire",
    "error": "Erreur lors du scan. Veuillez réessayer.",
    "mismatch": {
      "title": "Type de document non concordant",
      "message": "Les types de documents détectés ne correspondent pas. Vérifiez et continuez si c'est correct.",
      "help": "Si vous pensez que c'est une erreur, annulez et rescannez les documents."
    }
  }
}
```

And same for `public/locales/ar/rental.json`.

### Test Vectors
- Upload CIN image → detected as 'cin'
- Upload Passport image as CIN → detected as 'passport'
- Upload License as CIN, then License as License → no modal (match)
- Upload Passport as CIN, then License as License → modal shows mismatch
- Click Cancel in modal → resets form, can re-scan
- Click Continue in modal → saves documents, continues to next step
- Scanning disabled while document type detection in progress

### Acceptance Criteria
- [ ] `DocumentMismatchModal` component created
- [ ] `handleScanCIN` and `handleScanLicense` call `api.detectDocType()`
- [ ] Mismatch detected when types don't match (cin vs. other, license vs. other)
- [ ] Modal shows detected types and confirmation message
- [ ] Cancel resets both scans, allows re-scan
- [ ] Continue accepts documents and proceeds
- [ ] i18n translations added for all scan labels
- [ ] Tests pass: `npm run test`
- [ ] Version bump: v1.8.4 → v1.8.5

---

## Implementation Order & Versioning

Implement in this order (can be done in parallel by different developers):

1. **Feature 1: Arabic RTL** → v1.8.0 (pure frontend, no backend)
2. **Feature 2: Async Invitation** → v1.8.1 (frontend state change)
3. **Feature 3: Staff Signup** → v1.8.2 (backend + frontend, database migration)
4. **Feature 4: Role-Based Settings** → v1.8.3 (frontend filtering)
5. **Feature 5: Staff Basket Access** → v1.8.4 (frontend + Realtime)
6. **Feature 6: ID Mismatch Detection** → v1.8.5 (frontend + backend vision API)

Each feature is independent. Deploy to staging after each commit.

---

## General Notes

- **Testing:** All features require `npm run test` to pass before committing
- **Regression:** Check affected components for existing tests before modifying
- **Commit:** One commit per feature, include feature name and version bump
- **Push:** Only after explicit user instruction: "push to staging"
- **Styling:** Use existing design tokens from `index.css` (Canvas Cream, Ink Black, Signal Orange)
- **i18n:** Every user-facing string must have translation key in all 3 languages (FR, AR, EN)
- **Realtime:** Copy pattern from ContractStep.jsx for subscription cleanup and error handling

---

## Reference Files (Read Before Implementing)

- `.claude/reference/schema.md` — Database schema for new tables
- `.claude/reference/patterns.md` — Nav patterns, role access patterns
- `DESIGN.md` — Design tokens and component library
- `index.css` — Global styles and RTL rules

Good luck! 🚗
