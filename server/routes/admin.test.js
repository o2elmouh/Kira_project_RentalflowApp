// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../lib/supabaseAdmin.js', () => ({ default: { from: vi.fn() } }))
vi.mock('../middleware/auth.js', () => ({
  requireAuth:  (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}))

import supabaseAdmin from '../lib/supabaseAdmin.js'
import adminRouter from './admin.js'

class QB {
  constructor(result) {
    this._r = result
    for (const m of ['select', 'eq', 'single', 'update', 'insert', 'is']) {
      this[m] = vi.fn().mockReturnValue(this)
    }
  }
  then(resolve, reject) {
    return Promise.resolve(this._r).then(resolve, reject)
  }
}

function buildApp(user = { id: 'u1', agency_id: 'ag1' }) {
  const app = express()
  app.use(express.json())
  app.use((_req, _res, next) => { _req.user = user; next() })
  app.use('/', adminRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('POST /clients/:id/anonymize', () => {
  it('returns 404 when client not found', async () => {
    supabaseAdmin.from.mockReturnValue(new QB({ data: null, error: { message: 'not found' } }))
    const res = await request(buildApp()).post('/clients/bad-id/anonymize').send({})
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Client not found')
  })

  it('returns 403 when client belongs to different agency', async () => {
    supabaseAdmin.from.mockReturnValue(
      new QB({ data: { id: 'c1', agency_id: 'ag-other', anonymized_at: null }, error: null })
    )
    const res = await request(buildApp({ id: 'u1', agency_id: 'ag1' }))
      .post('/clients/c1/anonymize').send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
  })

  it('returns 409 when client is already anonymized', async () => {
    supabaseAdmin.from.mockReturnValue(
      new QB({ data: { id: 'c1', agency_id: 'ag1', anonymized_at: '2026-01-01T00:00:00Z' }, error: null })
    )
    const res = await request(buildApp()).post('/clients/c1/anonymize').send({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Already anonymized')
  })

  it('returns 200 and inserts audit_log on success', async () => {
    const clientQB  = new QB({ data: { id: 'c1', agency_id: 'ag1', anonymized_at: null }, error: null })
    const updateQB  = new QB({ data: null, error: null })
    const auditQB   = new QB({ data: null, error: null })
    supabaseAdmin.from
      .mockReturnValueOnce(clientQB)
      .mockReturnValueOnce(updateQB)
      .mockReturnValueOnce(auditQB)
    const res = await request(buildApp()).post('/clients/c1/anonymize').send({ reason: 'CNDP request' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(auditQB.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client.anonymize', target_id: 'c1', reason: 'CNDP request' })
    )
  })

  it('returns 500 when update fails', async () => {
    const clientQB = new QB({ data: { id: 'c1', agency_id: 'ag1', anonymized_at: null }, error: null })
    const updateQB = new QB({ data: null, error: { message: 'constraint violation' } })
    supabaseAdmin.from
      .mockReturnValueOnce(clientQB)
      .mockReturnValueOnce(updateQB)
    const res = await request(buildApp()).post('/clients/c1/anonymize').send({})
    expect(res.status).toBe(500)
  })
})
