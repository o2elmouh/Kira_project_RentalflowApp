/**
 * Unit tests for the e-signature dispatch helper module.
 * Pure-function tests only — supabase / pdf-lib are mocked at module level
 * for the integration-style cases.
 *
 * Run: npx vitest run server/__tests__/contractSigning.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { escapeHtml } from '../lib/contractSigning.js'

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('passes plain text through', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world')
  })

  it('escapes < > & " \'', () => {
    expect(escapeHtml(`<script>alert("xss")</script>`))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(escapeHtml(`a&b`)).toBe('a&amp;b')
    expect(escapeHtml(`it's`)).toBe('it&#39;s')
  })

  it('handles the canonical attack: client name with closing tag', () => {
    // The exact case flagged in the audit (B1).
    const malicious = `</a><img src=x onerror=alert(1)>`
    const out = escapeHtml(malicious)
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).toContain('&lt;')
  })

  it('coerces non-strings to string before escaping', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(true)).toBe('true')
  })
})

describe('appendAgencyTemplate', () => {
  let supabaseAdmin
  let appendAgencyTemplate
  let originalFetch

  beforeEach(async () => {
    vi.resetModules()
    originalFetch = globalThis.fetch
    // Stub supabaseAdmin before importing the module under test.
    vi.doMock('../lib/supabaseAdmin.js', () => ({
      default: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { contract_template_url: null }, error: null }),
        }),
      },
    }))
    const mod = await import('../lib/contractSigning.js')
    appendAgencyTemplate = mod.appendAgencyTemplate
    supabaseAdmin = (await import('../lib/supabaseAdmin.js')).default
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.resetModules()
  })

  it('returns applied=none when agency has no template', async () => {
    const buf = Buffer.from('PDF-AUTO')
    const out = await appendAgencyTemplate(buf, 'agency-1')
    expect(out.applied).toBe('none')
    expect(out.buffer).toBe(buf)
  })

  it('returns applied=none when agencyId is missing', async () => {
    const buf = Buffer.from('PDF-AUTO')
    const out = await appendAgencyTemplate(buf, null)
    expect(out.applied).toBe('none')
    expect(out.buffer).toBe(buf)
  })

  it('returns applied=fallback with reason when fetch 404s', async () => {
    // Override the mock to return a template URL.
    supabaseAdmin.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { contract_template_url: 'https://example.com/tpl.pdf' },
        error: null,
      }),
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })

    const buf = Buffer.from('PDF-AUTO')
    const out = await appendAgencyTemplate(buf, 'agency-1')
    expect(out.applied).toBe('fallback')
    expect(out.error).toMatch(/404/)
    expect(out.buffer).toBe(buf)
  })

  it('returns applied=fallback when DB query errors', async () => {
    supabaseAdmin.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    })

    const buf = Buffer.from('PDF-AUTO')
    const out = await appendAgencyTemplate(buf, 'agency-1')
    expect(out.applied).toBe('fallback')
    expect(out.error).toBe('db down')
    expect(out.buffer).toBe(buf)
  })
})

describe('prepareSignableContract — input validation', () => {
  let prepareSignableContract

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('../lib/supabaseAdmin.js', () => ({ default: { from: vi.fn() } }))
    prepareSignableContract = (await import('../lib/contractSigning.js')).prepareSignableContract
  })

  it('throws 400 when pdf_base64 is missing', async () => {
    await expect(
      prepareSignableContract({ contractId: 'c1', pdfBase64: null, userAgencyId: 'a1' })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 when pdf_base64 is wrong type', async () => {
    await expect(
      prepareSignableContract({ contractId: 'c1', pdfBase64: 12345, userAgencyId: 'a1' })
    ).rejects.toMatchObject({ status: 400 })
  })
})
