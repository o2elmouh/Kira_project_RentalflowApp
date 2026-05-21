import { describe, it, expect } from 'vitest'
import { formatWhatsAppNumber } from '../lib/twilioClient.js'

describe('formatWhatsAppNumber', () => {
  describe('bare phone number inputs', () => {
    it('converts Moroccan 06 number to international JID', () => {
      expect(formatWhatsAppNumber('0612345678')).toBe('212612345678@s.whatsapp.net')
    })

    it('converts Moroccan 07 number to international JID', () => {
      expect(formatWhatsAppNumber('0712345678')).toBe('212712345678@s.whatsapp.net')
    })

    it('strips + prefix', () => {
      expect(formatWhatsAppNumber('+212612345678')).toBe('212612345678@s.whatsapp.net')
    })

    it('strips 00 international prefix', () => {
      expect(formatWhatsAppNumber('00212612345678')).toBe('212612345678@s.whatsapp.net')
    })

    it('passes 212-prefixed number through', () => {
      expect(formatWhatsAppNumber('212612345678')).toBe('212612345678@s.whatsapp.net')
    })

    it('strips spaces, dashes, and parentheses', () => {
      expect(formatWhatsAppNumber('+212 (6) 12-34-56-78')).toBe('212612345678@s.whatsapp.net')
    })
  })

  describe('JID inputs (already addressable)', () => {
    it('passes @s.whatsapp.net JID through unchanged', () => {
      expect(formatWhatsAppNumber('212612345678@s.whatsapp.net')).toBe('212612345678@s.whatsapp.net')
    })

    it('strips multi-device :NN suffix from @s.whatsapp.net JID', () => {
      expect(formatWhatsAppNumber('212612345678:42@s.whatsapp.net')).toBe('212612345678@s.whatsapp.net')
    })

    it('PRESERVES @lid suffix — does not re-attach @s.whatsapp.net (the regression fix)', () => {
      // The bug: previous code stripped to digits and reconstructed as @s.whatsapp.net,
      // turning "7383233388632@lid" into "7383233388632@s.whatsapp.net" — a fake JID that
      // WhatsApp silently dropped. The fix: pass @lid through untouched.
      expect(formatWhatsAppNumber('7383233388632@lid')).toBe('7383233388632@lid')
    })

    it('strips :NN device suffix from @lid JID', () => {
      expect(formatWhatsAppNumber('7383233388632:2@lid')).toBe('7383233388632@lid')
    })
  })

  describe('edge cases', () => {
    it('returns @s.whatsapp.net suffix for empty input', () => {
      expect(formatWhatsAppNumber('')).toBe('@s.whatsapp.net')
    })

    it('returns @s.whatsapp.net suffix for null', () => {
      expect(formatWhatsAppNumber(null)).toBe('@s.whatsapp.net')
    })
  })
})
