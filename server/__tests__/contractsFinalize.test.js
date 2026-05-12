/**
 * Contracts /finalize endpoint logic — unit tests.
 *
 * The endpoint sets `finalized_at` on first call and is idempotent on retry.
 * Status stays 'active' so the Restitution flow can still operate on the row.
 *
 * Runner: Node native test runner — same pattern as smartQuote.test.js
 * Run:    node --experimental-test-module-mocks --test server/__tests__/contractsFinalize.test.js
 */

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// ── In-memory contracts table ────────────────────────────────
const contracts = new Map()
function seed(id, row) { contracts.set(id, { id, ...row }) }
function reset() { contracts.clear() }

// ── supabaseAdmin stub: profile + contract reads/writes ─────
mock.module('../lib/supabaseAdmin.js', {
  defaultExport: {
    from: (table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: { agency_id: 'agency-A' },
              }),
            }),
          }),
        }
      }
      if (table === 'contracts') {
        return {
          select: () => ({
            eq: (_col, id) => ({
              single: () => {
                const row = contracts.get(id)
                if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } })
                return Promise.resolve({ data: row, error: null })
              },
            }),
          }),
          update: (patch) => ({
            eq: (_col, id) => ({
              select: () => ({
                single: () => {
                  const row = contracts.get(id)
                  if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } })
                  const updated = { ...row, ...patch }
                  contracts.set(id, updated)
                  return Promise.resolve({ data: updated, error: null })
                },
              }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }
    },
  },
})

mock.module('pdf-lib', { namedExports: { PDFDocument: {} } })
mock.module('../lib/twilioClient.js', { namedExports: { sendWhatsAppMessage: async () => ({}) } })
mock.module('../middleware/auth.js', {
  namedExports: {
    requireAuth: (req, _res, next) => { req.user = { id: 'u1', agency_id: 'agency-A' }; next() },
  },
})

// ── Now import the router under test ────────────────────────
const routerModule = await import('../routes/contracts.js')
const router = routerModule.default

// Tiny test harness — bypass express, call the handler directly.
function findRoute(method, pattern) {
  return router.stack.find(layer => layer.route?.path === pattern && layer.route.methods[method.toLowerCase()])
}

function makeReqRes({ params = {}, body = {}, user = { id: 'u1', agency_id: 'agency-A' } } = {}) {
  const req = { params, body, user }
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return { req, res }
}

async function invoke(handlerLayer, req, res) {
  const handler = handlerLayer.route.stack[0].handle
  await handler(req, res, (err) => { if (err) throw err })
  return res
}

test('POST /:id/finalize sets finalized_at on first call', async () => {
  reset()
  seed('c1', { agency_id: 'agency-A', status: 'active', finalized_at: null })

  const layer = findRoute('POST', '/:id/finalize')
  const { req, res } = makeReqRes({ params: { id: 'c1' } })
  await invoke(layer, req, res)

  assert.equal(res.statusCode, 200)
  assert.ok(res.body.contract.finalized_at, 'finalized_at must be set')
  assert.equal(res.body.contract.status, 'active', 'status must stay active')
})

test('POST /:id/finalize is idempotent — second call returns alreadyFinalized=true', async () => {
  reset()
  const ts = new Date(Date.now() - 60_000).toISOString()
  seed('c2', { agency_id: 'agency-A', status: 'active', finalized_at: ts })

  const layer = findRoute('POST', '/:id/finalize')
  const { req, res } = makeReqRes({ params: { id: 'c2' } })
  await invoke(layer, req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.alreadyFinalized, true)
  assert.equal(res.body.contract.finalized_at, ts, 'must not overwrite existing timestamp')
})

test('POST /:id/finalize returns 403 for wrong agency', async () => {
  reset()
  seed('c3', { agency_id: 'agency-OTHER', status: 'active', finalized_at: null })

  const layer = findRoute('POST', '/:id/finalize')
  const { req, res } = makeReqRes({ params: { id: 'c3' } })
  await invoke(layer, req, res)

  assert.equal(res.statusCode, 403)
})

test('POST /:id/finalize returns 404 for missing contract', async () => {
  reset()
  const layer = findRoute('POST', '/:id/finalize')
  const { req, res } = makeReqRes({ params: { id: 'does-not-exist' } })
  await invoke(layer, req, res)

  assert.equal(res.statusCode, 404)
})
