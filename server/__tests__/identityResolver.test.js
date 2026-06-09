/**
 * identityResolver — unit tests
 *
 * Regression guard (v1.14.15): the user reported a real test where the
 * Step 1 form was populated entirely from a Bulgarian driving licence
 * (ИВАНОВА / МАРИЦА) and lost the Danish passport identity entirely
 * (ØSTERGÅRD / HANNE KRISTINE). After this fix, passport identity wins,
 * licence-only fields (number + expiry) still flow into their own slot,
 * and the lead carries an identityMismatch flag the UI can surface.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { applyIdentityPriority, detectIdentityMismatch, resolveIdentity } from '../lib/identityResolver.js'

describe('applyIdentityPriority', () => {
  it('returns input unchanged when no identity slots present', () => {
    const out = applyIdentityPriority({ firstName: 'Hassan', lastName: 'Alami' })
    expect(out.firstName).toBe('Hassan')
    expect(out.identitySource).toBeUndefined()
  })

  it('passport wins over driving licence', () => {
    const out = applyIdentityPriority({
      firstName: 'OLD',
      lastName: 'OLD',
      passportIdentity:       { firstName: 'HANNE KRISTINE', lastName: 'ØSTERGÅRD', dateOfBirth: '1985-06-09', issuingCountry: 'DNK' },
      drivingLicenseIdentity: { firstName: 'МАРИЦА',         lastName: 'ИВАНОВА',   dateOfBirth: '1985-08-01', issuingCountry: 'BGR' },
    })
    expect(out.firstName).toBe('HANNE KRISTINE')
    expect(out.lastName).toBe('ØSTERGÅRD')
    expect(out.dateOfBirth).toBe('1985-06-09')
    expect(out.issuingCountry).toBe('DNK')
    expect(out.identitySource).toBe('PASSPORT')
  })

  it('CIN wins over driving licence', () => {
    const out = applyIdentityPriority({
      cinIdentity:            { firstName: 'Hassan', lastName: 'Alami', dateOfBirth: '1990-05-15' },
      drivingLicenseIdentity: { firstName: 'H.',     lastName: 'A.',    dateOfBirth: '1990-05-15' },
    })
    expect(out.firstName).toBe('Hassan')
    expect(out.identitySource).toBe('CIN')
  })

  it('passport wins over CIN', () => {
    const out = applyIdentityPriority({
      passportIdentity: { firstName: 'Otman', lastName: 'Elmouhib' },
      cinIdentity:      { firstName: 'OTMAN', lastName: 'EL MOUHIB' },
    })
    expect(out.firstName).toBe('Otman')
    expect(out.identitySource).toBe('PASSPORT')
  })

  it('falls through to next slot when higher-priority slot is empty', () => {
    const out = applyIdentityPriority({
      passportIdentity:       {},   // present but empty — should be skipped
      drivingLicenseIdentity: { firstName: 'X', lastName: 'Y' },
    })
    expect(out.firstName).toBe('X')
    expect(out.identitySource).toBe('DRIVING_LICENSE')
  })

  it('preserves existing top-level fields when no slots present', () => {
    const out = applyIdentityPriority({ firstName: 'Legacy', lastName: 'Row' })
    expect(out.firstName).toBe('Legacy')
    expect(out.lastName).toBe('Row')
  })

  it('null/undefined safe', () => {
    expect(applyIdentityPriority(null)).toBe(null)
    expect(applyIdentityPriority(undefined)).toBe(undefined)
  })
})

describe('detectIdentityMismatch', () => {
  it('returns false when only one identity slot is present', () => {
    expect(detectIdentityMismatch({
      passportIdentity: { firstName: 'A', lastName: 'B' },
    })).toBe(false)
  })

  it('returns false when names match exactly', () => {
    expect(detectIdentityMismatch({
      passportIdentity:       { firstName: 'Otman', lastName: 'Elmouhib', dateOfBirth: '1990-01-01' },
      drivingLicenseIdentity: { firstName: 'Otman', lastName: 'Elmouhib', dateOfBirth: '1990-01-01' },
    })).toBe(false)
  })

  it('returns false for diacritic / case differences', () => {
    expect(detectIdentityMismatch({
      passportIdentity: { firstName: 'OTMAN', lastName: 'EL MOUHIB' },
      cinIdentity:      { firstName: 'Otman', lastName: 'Elmouhib' },
    })).toBe(false)
  })

  it('returns false when one name is a subset of the other', () => {
    expect(detectIdentityMismatch({
      passportIdentity:       { firstName: 'HANNE KRISTINE', lastName: 'ØSTERGÅRD' },
      drivingLicenseIdentity: { firstName: 'HANNE',          lastName: 'ØSTERGÅRD' },
    })).toBe(false)
  })

  it('returns true for Cyrillic vs Latin (the Bulgarian/Danish bug report)', () => {
    expect(detectIdentityMismatch({
      passportIdentity:       { firstName: 'HANNE KRISTINE', lastName: 'ØSTERGÅRD', dateOfBirth: '1985-06-09' },
      drivingLicenseIdentity: { firstName: 'МАРИЦА',         lastName: 'ИВАНОВА',   dateOfBirth: '1985-08-01' },
    })).toBe(true)
  })

  it('returns true for unrelated last names', () => {
    expect(detectIdentityMismatch({
      passportIdentity:       { firstName: 'Otman', lastName: 'Elmouhib' },
      drivingLicenseIdentity: { firstName: 'Otman', lastName: 'Bennani' },
    })).toBe(true)
  })

  it('returns true for different dates of birth', () => {
    expect(detectIdentityMismatch({
      passportIdentity: { firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' },
      cinIdentity:      { firstName: 'A', lastName: 'B', dateOfBirth: '1992-03-04' },
    })).toBe(true)
  })

  it('missing fields are not a mismatch — just unknown', () => {
    expect(detectIdentityMismatch({
      passportIdentity:       { firstName: 'Otman', lastName: 'Elmouhib' },
      drivingLicenseIdentity: { firstName: 'Otman' },  // no lastName, no dob
    })).toBe(false)
  })

  it('null/undefined safe', () => {
    expect(detectIdentityMismatch(null)).toBe(false)
    expect(detectIdentityMismatch({})).toBe(false)
  })
})

describe('resolveIdentity (priority + mismatch in one shot)', () => {
  it('applies priority and flags mismatch — the bug-report scenario', () => {
    const out = resolveIdentity({
      passportIdentity:       { firstName: 'HANNE KRISTINE', lastName: 'ØSTERGÅRD', dateOfBirth: '1985-06-09', issuingCountry: 'DNK' },
      drivingLicenseIdentity: { firstName: 'МАРИЦА',         lastName: 'ИВАНОВА',   dateOfBirth: '1985-08-01', issuingCountry: 'BGR' },
      passportNumber:       '000000000',
      drivingLicenseNumber: '8508010133',
    })
    // Identity from passport
    expect(out.firstName).toBe('HANNE KRISTINE')
    expect(out.lastName).toBe('ØSTERGÅRD')
    expect(out.dateOfBirth).toBe('1985-06-09')
    expect(out.issuingCountry).toBe('DNK')
    expect(out.identitySource).toBe('PASSPORT')
    // Both document numbers preserved
    expect(out.passportNumber).toBe('000000000')
    expect(out.drivingLicenseNumber).toBe('8508010133')
    // Mismatch flag raised
    expect(out.identityMismatch).toBe(true)
  })

  it('matching docs → mismatch false, priority still applied', () => {
    const out = resolveIdentity({
      cinIdentity:            { firstName: 'Otman', lastName: 'Elmouhib', dateOfBirth: '1990-01-01' },
      drivingLicenseIdentity: { firstName: 'Otman', lastName: 'Elmouhib', dateOfBirth: '1990-01-01' },
      cinNumber:            'AB123',
      drivingLicenseNumber: 'P-456',
    })
    expect(out.identitySource).toBe('CIN')
    expect(out.identityMismatch).toBe(false)
    expect(out.cinNumber).toBe('AB123')
    expect(out.drivingLicenseNumber).toBe('P-456')
  })
})
