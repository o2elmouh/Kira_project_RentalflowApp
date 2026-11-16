// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../lib/supabaseAdmin.js', () => ({
  default: {
    from: vi.fn(),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(),
        updateUserById:    vi.fn(),
        getUserById:       vi.fn(),
      },
    },
  },
}))
vi.mock('../middleware/auth.js', () => ({
  requireAuth:  (_req, _res, next) => next(),
  requireAdmin: (req, res, next) =>
    req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' }),
}))

import supabaseAdmin from '../lib/supabaseAdmin.js'
import teamRouter from '../routes/team.js'

const admin = supabaseAdmin.auth.admin

function buildApp(user) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.user = user; next() })
  app.use('/', teamRouter)
  return app
}

// profiles upsert stub that records its payload
function stubProfilesUpsert(result = { error: null }) {
  const upsert = vi.fn().mockResolvedValue(result)
  supabaseAdmin.from.mockReturnValue({ upsert })
  return upsert
}

const ADMIN_A   = { id: 'admin-a', role: 'admin', agency_id: 'agency-a' }
const NEW_USER  = { id: 'invitee', role: 'staff', agency_id: undefined }
const NO_INVITE = { invited_agency_id: null, invited_role: null, invited_by: null }

beforeEach(() => {
  vi.clearAllMocks()
  admin.updateUserById.mockResolvedValue({ data: {}, error: null })
})

describe('POST /invite', () => {
  it('records the invitation in app_metadata for the caller\'s own agency', async () => {
    admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'invitee' } }, error: null })

    const res = await request(buildApp(ADMIN_A))
      .post('/invite')
      .send({ email: 'new@example.com', role: 'staff', agency_id: 'agency-b' })

    expect(res.status).toBe(200)
    expect(admin.updateUserById).toHaveBeenCalledWith('invitee', {
      app_metadata: { invited_agency_id: 'agency-a', invited_role: 'staff', invited_by: 'admin-a' },
    })
  })

  it('fails the request when the invitation cannot be recorded', async () => {
    admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'invitee' } }, error: null })
    admin.updateUserById.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const res = await request(buildApp(ADMIN_A)).post('/invite').send({ email: 'new@example.com' })

    expect(res.status).toBe(500)
    expect(res.body.invited).toBeUndefined()
  })

  it('is refused for non-admins', async () => {
    const res = await request(buildApp({ id: 'staff-a', role: 'staff', agency_id: 'agency-a' }))
      .post('/invite').send({ email: 'new@example.com' })

    expect(res.status).toBe(403)
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
})

describe('POST /accept-invite', () => {
  it('joins the agency and role recorded in app_metadata, ignoring the request body', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: {
        id: 'invitee', email: 'new@example.com',
        app_metadata:  { invited_agency_id: 'agency-a', invited_role: 'staff', invited_by: 'admin-a' },
        user_metadata: { agency_id: 'agency-b', role: 'admin' },
      } },
      error: null,
    })
    const upsert = stubProfilesUpsert()

    const res = await request(buildApp(NEW_USER))
      .post('/accept-invite')
      .send({ full_name: 'New Person', agency_id: 'agency-b', role: 'admin' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ joined: true, agency_id: 'agency-a', role: 'staff' })
    expect(upsert).toHaveBeenCalledWith(
      { id: 'invitee', email: 'new@example.com', full_name: 'New Person', agency_id: 'agency-a', role: 'staff' },
      { onConflict: 'id' }
    )
  })

  it('refuses when only user-editable metadata claims an invitation', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: {
        id: 'invitee', email: 'new@example.com',
        app_metadata:  { provider: 'email' },
        user_metadata: { agency_id: 'agency-b', role: 'admin' },
      } },
      error: null,
    })
    const upsert = stubProfilesUpsert()

    const res = await request(buildApp(NEW_USER)).post('/accept-invite').send({})

    expect(res.status).toBe(404)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('consumes the invitation before creating the profile, so it is single-use', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: { id: 'invitee', email: 'new@example.com',
        app_metadata: { invited_agency_id: 'agency-a', invited_role: 'staff' }, user_metadata: {} } },
      error: null,
    })
    const upsert = stubProfilesUpsert()

    await request(buildApp(NEW_USER)).post('/accept-invite').send({})

    expect(admin.updateUserById).toHaveBeenCalledTimes(1)
    expect(admin.updateUserById).toHaveBeenCalledWith('invitee', { app_metadata: NO_INVITE })
    expect(admin.updateUserById.mock.invocationCallOrder[0])
      .toBeLessThan(upsert.mock.invocationCallOrder[0])
  })

  it('falls back to staff when the recorded role is not a known role', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: { id: 'invitee', email: 'new@example.com',
        app_metadata: { invited_agency_id: 'agency-a', invited_role: 'owner' }, user_metadata: {} } },
      error: null,
    })
    const upsert = stubProfilesUpsert()

    const res = await request(buildApp(NEW_USER)).post('/accept-invite').send({})

    expect(res.body.role).toBe('staff')
    expect(upsert.mock.calls[0][0]).toMatchObject({ role: 'staff', full_name: 'new' })
  })

  it('refuses a user who already belongs to a different agency', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: { id: 'member-b', email: 'b@example.com',
        app_metadata: { invited_agency_id: 'agency-a', invited_role: 'staff' }, user_metadata: {} } },
      error: null,
    })
    const upsert = stubProfilesUpsert()

    const res = await request(buildApp({ id: 'member-b', role: 'staff', agency_id: 'agency-b' }))
      .post('/accept-invite').send({})

    expect(res.status).toBe(409)
    expect(upsert).not.toHaveBeenCalled()
    expect(admin.updateUserById).not.toHaveBeenCalled()
  })

  it('restores the invitation when the profile cannot be created', async () => {
    admin.getUserById.mockResolvedValue({
      data: { user: { id: 'invitee', email: 'new@example.com',
        app_metadata: { invited_agency_id: 'agency-a', invited_role: 'staff', invited_by: 'admin-a' }, user_metadata: {} } },
      error: null,
    })
    stubProfilesUpsert({ error: { message: 'SEAT_LIMIT_REACHED: Agency has reached its seat limit' } })

    const res = await request(buildApp(NEW_USER)).post('/accept-invite').send({})

    expect(res.status).toBe(409)
    expect(admin.updateUserById).toHaveBeenLastCalledWith('invitee', {
      app_metadata: { invited_agency_id: 'agency-a', invited_role: 'staff', invited_by: 'admin-a' },
    })
  })
})
