/**
 * detectMissingDocs — unit tests
 * @vitest-environment node
 */
import { test, expect, describe } from 'vitest'
import { detectMissingDocs } from '../lib/triage.js'

describe('detectMissingDocs', () => {
  test('empty extracted_data → both missing', () => {
    expect(detectMissingDocs({})).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('null/undefined → both missing', () => {
    expect(detectMissingDocs(null)).toEqual({ needsCIN: true, needsPermis: true })
    expect(detectMissingDocs(undefined)).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('cin field present → CIN not missing', () => {
    expect(detectMissingDocs({ cin: 'AB123456' })).toEqual({ needsCIN: false, needsPermis: true })
  })

  test('documentType=cin with documentNumber → CIN not missing', () => {
    expect(detectMissingDocs({ documentType: 'cin', documentNumber: 'AB123456' }))
      .toEqual({ needsCIN: false, needsPermis: true })
  })

  test('documentType=cin without documentNumber → still missing', () => {
    expect(detectMissingDocs({ documentType: 'cin' })).toEqual({ needsCIN: true, needsPermis: true })
  })

  test('permis present → permis not missing', () => {
    expect(detectMissingDocs({ permis: 'P-987654' })).toEqual({ needsCIN: true, needsPermis: false })
  })

  test('both present → nothing missing', () => {
    expect(detectMissingDocs({ cin: 'AB123456', permis: 'P-987654' }))
      .toEqual({ needsCIN: false, needsPermis: false })
  })

  // v1.14.14: typed fields are the canonical shape after normalizeExtractedDocument.
  test('cinNumber (typed) present → CIN not missing', () => {
    expect(detectMissingDocs({ cinNumber: 'AB123456' }))
      .toEqual({ needsCIN: false, needsPermis: true })
  })

  test('drivingLicenseNumber (typed) present → permis not missing', () => {
    expect(detectMissingDocs({ drivingLicenseNumber: 'P-987654' }))
      .toEqual({ needsCIN: true, needsPermis: false })
  })

  test('typed cinNumber + drivingLicenseNumber together → nothing missing', () => {
    expect(detectMissingDocs({ cinNumber: 'AB1', drivingLicenseNumber: 'P-9' }))
      .toEqual({ needsCIN: false, needsPermis: false })
  })

  test('documentType=DRIVING_LICENSE with documentNumber → permis not missing', () => {
    expect(detectMissingDocs({ documentType: 'DRIVING_LICENSE', documentNumber: 'P-9' }))
      .toEqual({ needsCIN: true, needsPermis: false })
  })

  test('documentType=ID_CARD with documentNumber → CIN not missing', () => {
    expect(detectMissingDocs({ documentType: 'ID_CARD', documentNumber: 'AB1' }))
      .toEqual({ needsCIN: false, needsPermis: true })
  })

  test('empty-string values count as missing', () => {
    expect(detectMissingDocs({ cin: '', permis: '' })).toEqual({ needsCIN: true, needsPermis: true })
  })
})
