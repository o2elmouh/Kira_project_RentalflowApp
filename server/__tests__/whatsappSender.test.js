/**
 * Tests for the WhatsApp sender-shape filter.
 *
 * Regression guards:
 *  - v1.14.8: before this filter, status@broadcast, group messages (*@g.us),
 *    and channel updates (*@newsletter) all reached the inbound pipeline and
 *    inserted empty / phantom rows. The Basket UI showed "status@broadcast"
 *    and group IDs as leads with "Aucun document extrait".
 *  - v1.14.13: v1.14.8 also rejected *@lid, but WhatsApp's LID system uses
 *    @lid for real users whose phone is hidden by privacy settings. Real
 *    leads like "bonjour, j'ai besoin d'une voiture..." from
 *    84139063677034@lid were being silently dropped. @lid is now ACCEPTED;
 *    empty-message protection lives downstream in the triage gate.
 */
import { describe, it, expect } from 'vitest'
import { isLeadableWhatsAppSender } from '../lib/whatsappSender.js'

describe('isLeadableWhatsAppSender', () => {
  describe('rejects non-leadable sources', () => {
    it('rejects status@broadcast', () => {
      expect(isLeadableWhatsAppSender('status@broadcast')).toBe(false)
    })

    it('rejects group messages (@g.us)', () => {
      expect(isLeadableWhatsAppSender('120363407521836967@g.us')).toBe(false)
      expect(isLeadableWhatsAppSender('something-else@g.us')).toBe(false)
    })

    it('rejects newsletter / channel updates', () => {
      expect(isLeadableWhatsAppSender('1234567890@newsletter')).toBe(false)
    })
  })

  describe('accepts real 1:1 senders', () => {
    it('accepts a Moroccan @s.whatsapp.net JID', () => {
      expect(isLeadableWhatsAppSender('212612345678@s.whatsapp.net')).toBe(true)
    })

    it('accepts @lid (LID-system real users — v1.14.13 regression guard)', () => {
      // v1.14.8 wrongly blanket-rejected these. WhatsApp's new LID system
      // delivers messages from real users with this suffix; the sender
      // "84139063677034@lid" submitted the lead body
      // "bonjour, j'ai besoin d'une voiture pour le 15 decembre, pour 10 jour"
      // which was silently dropped pre-fix.
      expect(isLeadableWhatsAppSender('84139063677034@lid')).toBe(true)
      expect(isLeadableWhatsAppSender('254562946572445@lid')).toBe(true)
    })

    it('accepts a multi-device JID with :device suffix', () => {
      // Baileys sometimes delivers JIDs like "212612345678:42@s.whatsapp.net"
      expect(isLeadableWhatsAppSender('212612345678:42@s.whatsapp.net')).toBe(true)
    })

    it('accepts a bare numeric sender_id (no @ suffix)', () => {
      // Twilio webhook style or alternative cloud APIs
      expect(isLeadableWhatsAppSender('212612345678')).toBe(true)
      expect(isLeadableWhatsAppSender('+212612345678')).toBe(true)
    })

    it('accepts the Twilio "whatsapp:" prefix form', () => {
      expect(isLeadableWhatsAppSender('whatsapp:+212612345678')).toBe(true)
    })

    it('accepts unknown future suffixes by default (safe-by-default reject list)', () => {
      // If WhatsApp adds new individual-user suffixes, we accept them
      // until we explicitly add them to the reject list.
      expect(isLeadableWhatsAppSender('212612345678@s.whatsapp.net.v2')).toBe(true)
    })
  })

  describe('null safety', () => {
    it('rejects null', () => {
      expect(isLeadableWhatsAppSender(null)).toBe(false)
    })
    it('rejects undefined', () => {
      expect(isLeadableWhatsAppSender(undefined)).toBe(false)
    })
    it('rejects empty string', () => {
      expect(isLeadableWhatsAppSender('')).toBe(false)
    })
    it('rejects non-string types', () => {
      expect(isLeadableWhatsAppSender(123)).toBe(false)
      expect(isLeadableWhatsAppSender({})).toBe(false)
    })
  })
})
