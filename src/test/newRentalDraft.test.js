/**
 * Tests for lib/newRentalDraft — localStorage-backed wizard drafts.
 *
 * Regression (v1.14.5): the previous redaction strategy replaced PII fields
 * with the literal string '***' before persisting. When the user resumed a
 * draft, those sentinels were rehydrated into React form state and POSTed
 * back to /clients, where Postgres rejected '***' for `date_of_birth` with
 * "invalid input syntax for type date". The fix deletes PII keys on save
 * and strips any legacy '***' sentinels on read.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDraft, loadDrafts, getDraft, deleteDraft, clearDrafts,
} from '../../lib/newRentalDraft'

const AGENCY = 'agency-test'

beforeEach(() => {
  globalThis.window = globalThis.window || {}
  const store = new Map()
  globalThis.window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
})

const fullClient = {
  firstName: 'Karim',
  lastName:  'El Fassi',
  cinNumber: 'AB123456',
  drivingLicenseNumber: 'DL999',
  dateOfBirth: '1990-05-15',
  passportNumber: 'P000',
  idNumber: 'X1',
  email: 'k@example.com',
  phone: '+212600000000',
}

describe('saveDraft / getDraft PII handling', () => {
  it('strips PII keys entirely on save — never persists as literal "***"', () => {
    const saved = saveDraft(AGENCY, { client: fullClient, step: 1 })
    const reloaded = getDraft(AGENCY, saved.id)
    expect(reloaded.client.cinNumber).toBeUndefined()
    expect(reloaded.client.drivingLicenseNumber).toBeUndefined()
    expect(reloaded.client.dateOfBirth).toBeUndefined()
    expect(reloaded.client.passportNumber).toBeUndefined()
    expect(reloaded.client.idNumber).toBeUndefined()
  })

  it('preserves non-PII fields (name, contact) for picker labels and prefill', () => {
    const saved = saveDraft(AGENCY, { client: fullClient, step: 1 })
    const reloaded = getDraft(AGENCY, saved.id)
    expect(reloaded.client.firstName).toBe('Karim')
    expect(reloaded.client.lastName).toBe('El Fassi')
    expect(reloaded.client.email).toBe('k@example.com')
    expect(reloaded.client.phone).toBe('+212600000000')
  })

  it('returns no "***" sentinels — JSON.stringify of reloaded draft is clean', () => {
    const saved = saveDraft(AGENCY, { client: fullClient, step: 1 })
    const reloaded = getDraft(AGENCY, saved.id)
    expect(JSON.stringify(reloaded)).not.toContain('***')
  })
})

describe('sanitizeLegacyPii (read-path shim)', () => {
  it('strips "***" sentinels from drafts written by older versions', () => {
    // Simulate a draft saved by the pre-v1.14.5 redaction logic.
    const legacy = [{
      id: 'd1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      step: 1,
      client: {
        firstName: 'Karim',
        lastName: 'El Fassi',
        cinNumber: '***',
        drivingLicenseNumber: '***',
        dateOfBirth: '***',
      },
      rental: null,
      photos: null,
    }]
    window.localStorage.setItem(`rentaflow:newRental:drafts:${AGENCY}`, JSON.stringify(legacy))

    const drafts = loadDrafts(AGENCY)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].client.cinNumber).toBeUndefined()
    expect(drafts[0].client.drivingLicenseNumber).toBeUndefined()
    expect(drafts[0].client.dateOfBirth).toBeUndefined()
    expect(drafts[0].client.firstName).toBe('Karim')
  })

  it('does not strip real values that happen to match other patterns', () => {
    saveDraft(AGENCY, { client: { firstName: 'Real', email: 'a@b.com' }, step: 0 })
    const drafts = loadDrafts(AGENCY)
    expect(drafts[0].client.firstName).toBe('Real')
    expect(drafts[0].client.email).toBe('a@b.com')
  })
})

describe('draft lifecycle', () => {
  it('round-trips step, rental, photos through save → load', () => {
    const saved = saveDraft(AGENCY, {
      client: { firstName: 'X' },
      rental: { startDate: '2026-06-01', totalPrice: 500 },
      photos: { front: 'blob:1' },
      step: 2,
    })
    const reloaded = getDraft(AGENCY, saved.id)
    expect(reloaded.step).toBe(2)
    expect(reloaded.rental.totalPrice).toBe(500)
    expect(reloaded.photos.front).toBe('blob:1')
  })

  it('deletes a draft by id without touching others', () => {
    const a = saveDraft(AGENCY, { client: { firstName: 'A' }, step: 0 })
    const b = saveDraft(AGENCY, { client: { firstName: 'B' }, step: 0 })
    deleteDraft(AGENCY, a.id)
    const remaining = loadDrafts(AGENCY)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  it('clearDrafts wipes every draft for the agency', () => {
    saveDraft(AGENCY, { client: { firstName: 'A' }, step: 0 })
    saveDraft(AGENCY, { client: { firstName: 'B' }, step: 0 })
    clearDrafts(AGENCY)
    expect(loadDrafts(AGENCY)).toEqual([])
  })
})
