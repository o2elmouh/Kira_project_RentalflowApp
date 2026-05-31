/**
 * normalizeExtractedDocument — unit tests
 *
 * Regression guard (v1.14.14): when a client sent passport then driving
 * license, the flat `documentNumber` slot collided. The merge step
 * preserved the passport's number and silently dropped the driving
 * license. After normalization, each type lives in its own slot
 * (cinNumber / drivingLicenseNumber / passportNumber) so the merge
 * naturally keeps both.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { normalizeExtractedDocument } from '../lib/normalizeExtractedDocument.js'
import { mergeExtractedData } from '../lib/offerMessage.js'

describe('normalizeExtractedDocument', () => {
  it('returns null/undefined unchanged', () => {
    expect(normalizeExtractedDocument(null)).toBe(null)
    expect(normalizeExtractedDocument(undefined)).toBe(undefined)
  })

  it('returns non-object input unchanged', () => {
    expect(normalizeExtractedDocument('foo')).toBe('foo')
    expect(normalizeExtractedDocument(42)).toBe(42)
  })

  describe('ID_CARD / CIN', () => {
    it('maps ID_CARD into cinNumber + cinExpiry', () => {
      const out = normalizeExtractedDocument({
        documentType: 'ID_CARD',
        documentNumber: 'AB123456',
        expiryDate: '2030-05-01',
        firstName: 'Otman',
        lastName: 'Elmouhib',
      })
      expect(out.cinNumber).toBe('AB123456')
      expect(out.cinExpiry).toBe('2030-05-01')
      expect(out.firstName).toBe('Otman')
      expect(out.lastName).toBe('Elmouhib')
      expect(out.documentNumber).toBeUndefined()
      expect(out.expiryDate).toBeUndefined()
      expect(out.lastDocumentType).toBe('ID_CARD')
    })

    it('accepts lowercase cin variant', () => {
      const out = normalizeExtractedDocument({ documentType: 'cin', documentNumber: 'X1' })
      expect(out.cinNumber).toBe('X1')
    })
  })

  describe('DRIVING_LICENSE', () => {
    it('maps DRIVING_LICENSE into drivingLicenseNumber + licenseExpiry', () => {
      const out = normalizeExtractedDocument({
        documentType: 'DRIVING_LICENSE',
        documentNumber: 'P-987654',
        expiryDate: '2028-12-31',
      })
      expect(out.drivingLicenseNumber).toBe('P-987654')
      expect(out.licenseExpiry).toBe('2028-12-31')
      expect(out.documentNumber).toBeUndefined()
    })
  })

  describe('PASSPORT', () => {
    it('maps PASSPORT into passportNumber + passportExpiry', () => {
      const out = normalizeExtractedDocument({
        documentType: 'PASSPORT',
        documentNumber: 'AA9988776',
        expiryDate: '2031-04-04',
      })
      expect(out.passportNumber).toBe('AA9988776')
      expect(out.passportExpiry).toBe('2031-04-04')
    })
  })

  describe('UNKNOWN', () => {
    it('preserves original keys so data is never lost', () => {
      const out = normalizeExtractedDocument({
        documentType: 'UNKNOWN',
        documentNumber: 'XYZ',
        expiryDate: '2030-01-01',
      })
      expect(out.documentNumber).toBe('XYZ')
      expect(out.expiryDate).toBe('2030-01-01')
      expect(out.documentType).toBe('UNKNOWN')
    })
  })

  describe('missing documentType', () => {
    it('passes generic fields through untouched', () => {
      const out = normalizeExtractedDocument({ documentNumber: 'X', firstName: 'Y' })
      expect(out.documentNumber).toBe('X')
      expect(out.firstName).toBe('Y')
    })
  })

  describe('confidence score remapping', () => {
    it('remaps documentNumber + expiryDate confidence into typed keys', () => {
      const out = normalizeExtractedDocument({
        documentType: 'DRIVING_LICENSE',
        documentNumber: 'P1',
        expiryDate: '2030',
        confidenceScores: { documentNumber: 0.9, expiryDate: 0.7, firstName: 0.95 },
      })
      expect(out.confidenceScores).toEqual({
        drivingLicenseNumber: 0.9,
        licenseExpiry: 0.7,
        firstName: 0.95,
      })
    })
  })

  describe('idempotency', () => {
    it('re-normalizing already-normalized output is a no-op', () => {
      const first = normalizeExtractedDocument({
        documentType: 'PASSPORT', documentNumber: 'AA', expiryDate: '2030',
      })
      const second = normalizeExtractedDocument(first)
      expect(second).toEqual(first)
    })
  })
})

describe('mergeExtractedData with normalized inputs — regression for passport + driving license', () => {
  it('keeps BOTH passport number and driving license number when both arrive', () => {
    const passport = normalizeExtractedDocument({
      documentType: 'PASSPORT',
      documentNumber: 'AA9988776',
      expiryDate: '2031-04-04',
      firstName: 'Otman',
      lastName: 'Elmouhib',
    })
    const license = normalizeExtractedDocument({
      documentType: 'DRIVING_LICENSE',
      documentNumber: 'P-987654',
      expiryDate: '2028-12-31',
      firstName: 'Otman',
      lastName: 'Elmouhib',
    })

    const merged = mergeExtractedData(passport, license)

    expect(merged.passportNumber).toBe('AA9988776')
    expect(merged.drivingLicenseNumber).toBe('P-987654')
    expect(merged.passportExpiry).toBe('2031-04-04')
    expect(merged.licenseExpiry).toBe('2028-12-31')
    expect(merged.firstName).toBe('Otman')
    expect(merged.lastName).toBe('Elmouhib')
  })

  it('keeps CIN + driving license when both arrive', () => {
    const cin = normalizeExtractedDocument({
      documentType: 'ID_CARD', documentNumber: 'AB123456', expiryDate: '2030-05-01',
    })
    const license = normalizeExtractedDocument({
      documentType: 'DRIVING_LICENSE', documentNumber: 'P-987654', expiryDate: '2028-12-31',
    })

    const merged = mergeExtractedData(cin, license)

    expect(merged.cinNumber).toBe('AB123456')
    expect(merged.drivingLicenseNumber).toBe('P-987654')
  })
})
