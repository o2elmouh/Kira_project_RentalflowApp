/**
 * Pure message builders — unit tests
 * @vitest-environment node
 */
import { test, expect, describe } from 'vitest'
import { buildOfferMessage, buildAcknowledgmentMessage, mergeExtractedData } from '../lib/offerMessage.js'

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

describe('buildAcknowledgmentMessage', () => {
  test('both missing → asks for CIN and permis', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: true, needsPermis: true })
    expect(msg).toContain('Nous préparons votre contrat')
    expect(msg).toContain('Photo recto-verso de votre CIN')
    expect(msg).toContain('Photo de votre permis de conduire')
  })

  test('only CIN missing → asks for CIN only', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: true, needsPermis: false })
    expect(msg).toContain('Photo recto-verso de votre CIN')
    expect(msg).not.toContain('permis de conduire')
  })

  test('only permis missing → asks for permis only', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: false, needsPermis: true })
    expect(msg).toContain('Photo de votre permis de conduire')
    expect(msg).not.toContain('CIN')
  })

  test('nothing missing → no CTA, only confirmation', () => {
    const msg = buildAcknowledgmentMessage({ needsCIN: false, needsPermis: false })
    expect(msg).toContain('Nous avons tous vos documents')
    expect(msg).not.toContain('CIN')
    expect(msg).not.toContain('permis')
  })
})

describe('mergeExtractedData', () => {
  test('returns new object — does not mutate input', () => {
    const existing = { cin: '' }
    const result = mergeExtractedData(existing, { cin: 'AB123' })
    expect(existing.cin).toBe('')
    expect(result.cin).toBe('AB123')
  })

  test('fills empty fields from incoming', () => {
    const result = mergeExtractedData(
      { cin: '', permis: '' },
      { cin: 'AB123', permis: 'P-987' }
    )
    expect(result).toMatchObject({ cin: 'AB123', permis: 'P-987' })
  })

  test('does NOT overwrite existing non-empty field when no confidence info', () => {
    const result = mergeExtractedData(
      { cin: 'OLD-VALUE' },
      { cin: 'NEW-VALUE' }
    )
    expect(result.cin).toBe('OLD-VALUE')
  })

  test('overwrites when incoming confidence is strictly higher', () => {
    const result = mergeExtractedData(
      { cin: 'OLD', confidenceScores: { cin: 0.5 } },
      { cin: 'NEW', confidenceScores: { cin: 0.9 } }
    )
    expect(result.cin).toBe('NEW')
    expect(result.confidenceScores.cin).toBe(0.9)
  })

  test('does NOT overwrite when incoming confidence equal or lower', () => {
    const result = mergeExtractedData(
      { cin: 'OLD', confidenceScores: { cin: 0.9 } },
      { cin: 'NEW', confidenceScores: { cin: 0.5 } }
    )
    expect(result.cin).toBe('OLD')
    expect(result.confidenceScores.cin).toBe(0.9)
  })

  test('ignores empty incoming values', () => {
    const result = mergeExtractedData({ cin: 'KEEP' }, { cin: '', permis: '' })
    expect(result.cin).toBe('KEEP')
    expect(result.permis).toBeUndefined()
  })

  test('preserves unrelated existing fields', () => {
    const result = mergeExtractedData(
      { firstName: 'Ahmed', cin: '' },
      { cin: 'AB123' }
    )
    expect(result.firstName).toBe('Ahmed')
    expect(result.cin).toBe('AB123')
  })

  test('handles null existing', () => {
    const result = mergeExtractedData(null, { cin: 'AB123' })
    expect(result).toEqual({ cin: 'AB123' })
  })

  test('handles null incoming', () => {
    const result = mergeExtractedData({ cin: 'AB123' }, null)
    expect(result).toEqual({ cin: 'AB123' })
  })
})
