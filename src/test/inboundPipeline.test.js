import { describe, it, expect, vi } from 'vitest'

vi.mock('../../server/lib/supabaseAdmin.js', () => ({
  default: { from: vi.fn() }
}))
vi.mock('../../server/lib/triage.js', () => ({
  detectLanguage: vi.fn(() => 'fra'),
  translateToFrench: vi.fn(t => t),
  preFilter: vi.fn(() => ({ result: 'pass', matchedKeywords: ['location'] })),
  handleAmbiguous: vi.fn(),
  CORE_LANGS: new Set(['fra', 'ara', 'eng']),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: vi.fn() } }))
}))

import { normaliseJidToPhone } from '../../server/lib/inboundPipeline.js'

describe('normaliseJidToPhone', () => {
  it('strips @s.whatsapp.net suffix', () => {
    expect(normaliseJidToPhone('212600123456@s.whatsapp.net')).toBe('212600123456')
  })
  it('returns null for LID format', () => {
    expect(normaliseJidToPhone('7383abc@lid')).toBe(null)
  })
  it('returns null for empty input', () => {
    expect(normaliseJidToPhone('')).toBe(null)
  })
  it('returns digits for clean number', () => {
    expect(normaliseJidToPhone('212600123456')).toBe('212600123456')
  })
})
