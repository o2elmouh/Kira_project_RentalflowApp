/**
 * Regression for v1.14.22 — outbound Baileys messages must skip the
 * generateLinkPreviewIfRequired() path. Background:
 *
 *   In production we observed a contract-signing WhatsApp message that
 *   logged `url generation failed` (from Baileys' link-preview-js path)
 *   then returned an msgId + status=1 (PENDING) — but never reached the
 *   recipient. The failed preview fetch had three effects:
 *     1. log spam,
 *     2. multi-second synchronous wait that interacts badly with
 *        Signal-protocol session rotation,
 *     3. WhatsApp anti-spam scoring penalty on preview-bearing messages.
 *
 *   Baileys reads `message.linkPreview`; if anything other than `undefined`,
 *   it skips the preview fetch entirely
 *   (node_modules/@whiskeysockets/baileys/lib/Utils/messages.js:266).
 *
 * This test guards the invariant that `buildOutboundTextMessage` always
 * sets `linkPreview: null` so a future refactor can't reintroduce the bug.
 *
 * @vitest-environment node
 */

import { test, expect } from 'vitest'
import { buildOutboundTextMessage } from '../lib/baileys/sessionManager.js'

test('buildOutboundTextMessage returns { text, linkPreview: null } for a short message', () => {
  const out = buildOutboundTextMessage('hi')
  expect(out).toEqual({ text: 'hi', linkPreview: null })
})

test('buildOutboundTextMessage preserves a URL-bearing body and still sets linkPreview: null', () => {
  // The exact pattern from the production bug: a contract signing message
  // with a URL in it. The URL stays in the text (so the recipient can tap
  // it) but no preview metadata is generated.
  const body =
    `Bonjour Hassan Alami, votre contrat de location CTR-00042 est prêt à être signé. ` +
    `Veuillez cliquer sur ce lien sécurisé pour le consulter et signer :\n\n` +
    `https://app.example.com/?sign=abc123\n\nLien valable 72h.`
  const out = buildOutboundTextMessage(body)
  expect(out.text).toBe(body)
  expect(out.linkPreview).toBeNull()
  // Critically — `linkPreview` is present (key exists, value is null) and
  // NOT `undefined`. Per Baileys' generator, only `typeof undefined` triggers
  // the preview fetch path.
  expect(out).toHaveProperty('linkPreview')
  expect(typeof out.linkPreview).not.toBe('undefined')
})

test('buildOutboundTextMessage passes empty string through (no surprise empty preview)', () => {
  const out = buildOutboundTextMessage('')
  expect(out).toEqual({ text: '', linkPreview: null })
})
