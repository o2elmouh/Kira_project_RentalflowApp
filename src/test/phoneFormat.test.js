import { describe, it, expect } from 'vitest'
import { formatPhone } from '../../utils/phoneFormat.js'

describe('formatPhone', () => {
  it('formats a standard Morocco WhatsApp JID', () => {
    expect(formatPhone('212612345678@s.whatsapp.net')).toBe('+212 612 345 678')
  })

  it('strips multi-device suffix before formatting', () => {
    expect(formatPhone('212612345678:42@s.whatsapp.net')).toBe('+212 612 345 678')
  })

  it('formats an @lid privacy JID with 14 digits', () => {
    // The user-reported case from the screenshot
    expect(formatPhone('84139063677034@lid')).toBe('+841 390 636 770 34')
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
})
