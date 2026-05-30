import { describe, it, expect } from 'vitest'
import { formatPhone } from '../../utils/phoneFormat.js'

describe('formatPhone', () => {
  it('formats a standard Morocco WhatsApp JID', () => {
    expect(formatPhone('212612345678@s.whatsapp.net')).toBe('+212 612 345 678')
  })

  it('strips multi-device suffix before formatting', () => {
    expect(formatPhone('212612345678:42@s.whatsapp.net')).toBe('+212 612 345 678')
  })

  it('formats an @lid privacy JID with a recognized country prefix', () => {
    // v1.14.9: country-code lookup (longest-prefix). 84 = Vietnam (valid CC).
    // Note: @lid pseudonyms are dropped at ingestion by v1.14.8 — this test
    // documents the formatter behaviour for anything that does reach the UI.
    expect(formatPhone('84139063677034@lid')).toBe('+84 139 063 677 034')
  })

  it('formats a short 10-digit number with 2-digit country code', () => {
    expect(formatPhone('33612345678@s.whatsapp.net')).toBe('+33 612 345 678')
  })

  it('passes Gmail addresses through unchanged', () => {
    expect(formatPhone('client@gmail.com')).toBe('client@gmail.com')
  })

  it('returns empty string for null / undefined', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
    expect(formatPhone('')).toBe('')
  })

  it('returns empty string for non-string inputs', () => {
    expect(formatPhone(12345)).toBe('')
  })

  it('falls back to raw digits when out of phone range', () => {
    expect(formatPhone('123@lid')).toBe('123')
  })

  it('handles JID with @c.us suffix', () => {
    expect(formatPhone('212612345678@c.us')).toBe('+212 612 345 678')
  })

  it('strips all non-digit characters', () => {
    expect(formatPhone('+212-612-345-678@s.whatsapp.net')).toBe('+212 612 345 678')
  })

  // ── v1.14.9: country-code lookup ─────────────────────────────────
  describe('country-code identification', () => {
    it('recognizes 3-digit CCs (Morocco, Portugal, GCC)', () => {
      expect(formatPhone('212612345678@s.whatsapp.net')).toBe('+212 612 345 678')
      expect(formatPhone('351912345678@s.whatsapp.net')).toBe('+351 912 345 678')
      expect(formatPhone('966512345678@s.whatsapp.net')).toBe('+966 512 345 678')
      expect(formatPhone('971501234567@s.whatsapp.net')).toBe('+971 501 234 567')
    })

    it('recognizes 2-digit CCs (Europe / North Africa)', () => {
      expect(formatPhone('33612345678@s.whatsapp.net')).toBe('+33 612 345 678')   // France
      expect(formatPhone('34612345678@s.whatsapp.net')).toBe('+34 612 345 678')   // Spain
      expect(formatPhone('39312345678@s.whatsapp.net')).toBe('+39 312 345 678')   // Italy
      expect(formatPhone('49612345678@s.whatsapp.net')).toBe('+49 612 345 678')   // Germany
      expect(formatPhone('44712345678@s.whatsapp.net')).toBe('+44 712 345 678')   // UK
      expect(formatPhone('20100123456@s.whatsapp.net')).toBe('+20 100 123 456')   // Egypt
    })

    it('recognizes 1-digit CCs (NANP, Russia)', () => {
      // Uniform 3-3-3 grouping after the CC — we don't special-case national
      // formats (would require a per-country pattern table).
      expect(formatPhone('14155552671@s.whatsapp.net')).toBe('+1 415 555 267 1')  // US/CA
    })

    it('prefers the longer-prefix CC (212 over 21)', () => {
      // 21 is not a CC at all, but the test guards the longest-prefix invariant.
      expect(formatPhone('212612345678@s.whatsapp.net')).toBe('+212 612 345 678')
    })

    it('returns raw digits (no "+") when the prefix is not a known CC', () => {
      // Avoids surfacing a misleading bogus country code in the UI.
      // "999..." has no matching CC in the table.
      expect(formatPhone('999123456789@lid')).toBe('999123456789')
    })

    it('returns raw digits when total length is out of E.164 range', () => {
      // Too long: > 15 digits
      expect(formatPhone('1234567890123456@lid')).toBe('1234567890123456')
      // Too short: < 8 digits
      expect(formatPhone('1234567@lid')).toBe('1234567')
    })
  })
})
