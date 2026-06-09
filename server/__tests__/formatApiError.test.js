/**
 * Tests for formatApiErrorLog — the structured log payload used by the
 * global Express error handler in server/index.js.
 *
 * Regression guard (v1.14.10): before this, the handler logged only
 * `err.message`, which collapsed every Supabase PostgrestError to a useless
 * "Internal server error" line in Railway. The new shape includes the PG
 * SQLSTATE code, details, hint, and request path — enough to diagnose
 * 500s without redeploying with extra logging.
 */
import { describe, it, expect } from 'vitest'
import { formatApiErrorLog } from '../lib/formatApiError.js'

const req = { method: 'POST', path: '/clients' }

describe('formatApiErrorLog', () => {
  it('captures the canonical Supabase PostgrestError shape', () => {
    const err = {
      message: 'invalid input syntax for type date: "***"',
      code:    '22007',
      details: 'Failing row contains (..., ***, ...).',
      hint:    null,
      status:  500,
      stack:   'Error: invalid input syntax\n  at insert\n  at handler\n  at router\n  at app\n  at server\n  at extra',
    }
    const out = formatApiErrorLog(err, req)
    expect(out.method).toBe('POST')
    expect(out.path).toBe('/clients')
    expect(out.message).toBe('invalid input syntax for type date: "***"')
    expect(out.code).toBe('22007')
    expect(out.details).toBe('Failing row contains (..., ***, ...).')
    expect(out.hint).toBeNull()
    expect(out.status).toBe(500)
    // Stack truncated to 5 lines
    expect(out.stack.split('\n')).toHaveLength(5)
  })

  it('captures the "column does not exist" error code (42703)', () => {
    const err = {
      message: 'column reservations.daily_rate does not exist',
      code:    '42703',
      details: null,
      hint:    null,
    }
    const out = formatApiErrorLog(err, { method: 'GET', path: '/reservations/abc' })
    expect(out.code).toBe('42703')
    expect(out.path).toBe('/reservations/abc')
  })

  it('reads err.statusCode when err.status is unset', () => {
    const err = { message: 'x', statusCode: 400 }
    expect(formatApiErrorLog(err, req).status).toBe(400)
  })

  it('returns nulls for missing fields without throwing', () => {
    const out = formatApiErrorLog({}, {})
    expect(out.method).toBeNull()
    expect(out.path).toBeNull()
    expect(out.message).toBeNull()
    expect(out.code).toBeNull()
    expect(out.details).toBeNull()
    expect(out.hint).toBeNull()
    expect(out.status).toBeNull()
    expect(out.stack).toBeNull()
  })

  it('survives null err and null req without throwing', () => {
    expect(() => formatApiErrorLog(null, null)).not.toThrow()
    const out = formatApiErrorLog(null, null)
    expect(out.method).toBeNull()
    expect(out.message).toBeNull()
  })

  it('truncates a long stack to the top 5 frames', () => {
    const stack = ['Error: bang', ...Array.from({ length: 30 }, (_, i) => `  at frame${i}`)].join('\n')
    const out = formatApiErrorLog({ stack }, req)
    expect(out.stack.split('\n')).toHaveLength(5)
    expect(out.stack).toContain('Error: bang')
    expect(out.stack).toContain('frame0')
    expect(out.stack).not.toContain('frame10')
  })
})
