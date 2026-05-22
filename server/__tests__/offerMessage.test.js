/**
 * Pure message builders — unit tests
 * @vitest-environment node
 */
import { test, expect, describe } from 'vitest'
import { buildOfferMessage } from '../lib/offerMessage.js'

describe('buildOfferMessage', () => {
  const base = {
    vehicleName: 'Dacia Logan',
    priceTotal: 1500,
    publicAppUrl: 'https://app.rentaflow.ma',
  }

  test('includes vehicle and price in opening line', () => {
    const msg = buildOfferMessage(base)
    expect(msg).toContain('Dacia Logan')
    expect(msg).toContain('1500 MAD')
  })

  test('includes dates when both startDate and endDate provided', () => {
    const msg = buildOfferMessage({ ...base, startDate: '2026-05-20', endDate: '2026-05-23' })
    expect(msg).toContain('📅 Du *2026-05-20* au *2026-05-23*')
  })

  test('omits dates line when startDate missing', () => {
    const msg = buildOfferMessage({ ...base, endDate: '2026-05-23' })
    expect(msg).not.toContain('📅')
  })

  test('omits dates line when endDate missing', () => {
    const msg = buildOfferMessage({ ...base, startDate: '2026-05-20' })
    expect(msg).not.toContain('📅')
  })

  test('appends notes when provided', () => {
    const msg = buildOfferMessage({ ...base, notes: 'Livraison gare ONCF' })
    expect(msg).toContain('Livraison gare ONCF')
  })

  test('always includes CNDP block with privacy URL', () => {
    const msg = buildOfferMessage(base)
    expect(msg).toContain('loi 09-08')
    expect(msg).toContain('https://app.rentaflow.ma/confidentialite')
  })

  test('respects custom publicAppUrl', () => {
    const msg = buildOfferMessage({ ...base, publicAppUrl: 'https://staging.rentaflow.ma' })
    expect(msg).toContain('https://staging.rentaflow.ma/confidentialite')
    expect(msg).not.toContain('app.rentaflow.ma/confidentialite')
  })

  test('ends with the Oui/Non prompt', () => {
    const msg = buildOfferMessage(base)
    expect(msg.trim().endsWith('Répondez *Oui* pour confirmer ou *Non* pour décliner.')).toBe(true)
  })
})
