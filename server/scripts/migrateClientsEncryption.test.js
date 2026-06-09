// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'

// Pin a real ENCRYPTION_KEY so encrypt() produces ciphertext (not the dev
// no-op fallback). Restore afterward.
let originalKey
beforeAll(() => {
  originalKey = process.env.ENCRYPTION_KEY
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')
})
afterAll(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = originalKey
})

vi.mock('../lib/supabaseAdmin.js', () => ({ default: { from: vi.fn() } }))

const { migrateClientsEncryption } = await import('./migrateClientsEncryption.js')
const { isEncryptedBlob, encrypt } = await import('../lib/encryption.js')

/**
 * Chainable QB that supports the methods the script uses.
 * Critically, .range() resolves to {data, error} (this is where the script
 * awaits). For updates we await directly on the QB after .eq().
 */
class QB {
  constructor(result) {
    this._r = result
    for (const m of ['select', 'order', 'update', 'eq']) {
      this[m] = vi.fn().mockReturnValue(this)
    }
    // For paged reads the script chains .range() and awaits it.
    this.range = vi.fn().mockResolvedValue(result)
  }
  then(resolve, reject) {
    return Promise.resolve(this._r).then(resolve, reject)
  }
}

let db
beforeEach(() => {
  db = { from: vi.fn() }
})

describe('migrateClientsEncryption', () => {
  it('refuses to run when ENCRYPTION_KEY is not set', async () => {
    const saved = process.env.ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY
    vi.resetModules()
    const { migrateClientsEncryption: fn } = await import('./migrateClientsEncryption.js')
    await expect(fn(db)).rejects.toThrow(/ENCRYPTION_KEY is not set/)
    process.env.ENCRYPTION_KEY = saved
  })

  it('returns zero counts when there are no clients', async () => {
    db.from.mockReturnValueOnce(new QB({ data: [], error: null }))
    const result = await migrateClientsEncryption(db)
    expect(result).toEqual({ processed: 0, encrypted: 0, skipped: 0, nullified: 0 })
  })

  it('encrypts plaintext rows and writes ciphertext into _enc columns', async () => {
    const row = {
      id: 'c1',
      id_number: 'BJ123456',
      driving_license_num: '19/987654',
      date_of_birth: '1990-06-15',
      id_number_enc: null,
      driving_license_num_enc: null,
      date_of_birth_enc: null,
    }
    const readQB   = new QB({ data: [row], error: null })
    const updateQB = new QB({ data: null, error: null })
    db.from
      .mockReturnValueOnce(readQB)
      .mockReturnValueOnce(updateQB)

    const result = await migrateClientsEncryption(db)
    expect(result.processed).toBe(1)
    expect(result.encrypted).toBe(1)

    // Inspect the patch passed to update()
    const patch = updateQB.update.mock.calls[0][0]
    expect(isEncryptedBlob(patch.id_number_enc)).toBe(true)
    expect(isEncryptedBlob(patch.driving_license_num_enc)).toBe(true)
    expect(isEncryptedBlob(patch.date_of_birth_enc)).toBe(true)
  })

  it('is idempotent — skips rows whose _enc columns are already ciphertext', async () => {
    const row = {
      id: 'c1',
      id_number: 'BJ123456',
      driving_license_num: '19/987654',
      date_of_birth: '1990-06-15',
      id_number_enc:           encrypt('BJ123456'),
      driving_license_num_enc: encrypt('19/987654'),
      date_of_birth_enc:       encrypt('1990-06-15'),
    }
    db.from.mockReturnValueOnce(new QB({ data: [row], error: null }))
    const result = await migrateClientsEncryption(db)
    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.encrypted).toBe(0)
    // No update() call expected — db.from should have been called once (the select).
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('handles null plaintext gracefully — no encryption, no update', async () => {
    const row = {
      id: 'c1',
      id_number: null,
      driving_license_num: null,
      date_of_birth: null,
      id_number_enc: null,
      driving_license_num_enc: null,
      date_of_birth_enc: null,
    }
    db.from.mockReturnValueOnce(new QB({ data: [row], error: null }))
    const result = await migrateClientsEncryption(db)
    expect(result.skipped).toBe(1)
    expect(result.encrypted).toBe(0)
  })

  it('encrypts only the fields that need it (partial-row case)', async () => {
    const row = {
      id: 'c1',
      id_number: 'BJ123456',
      driving_license_num: '19/987654',
      date_of_birth: null,
      id_number_enc:           encrypt('BJ123456'),   // already done
      driving_license_num_enc: null,                  // needs encryption
      date_of_birth_enc:       null,                  // no plaintext to encrypt
    }
    const readQB   = new QB({ data: [row], error: null })
    const updateQB = new QB({ data: null, error: null })
    db.from.mockReturnValueOnce(readQB).mockReturnValueOnce(updateQB)

    await migrateClientsEncryption(db)
    const patch = updateQB.update.mock.calls[0][0]
    expect(patch.id_number_enc).toBeUndefined()        // untouched
    expect(isEncryptedBlob(patch.driving_license_num_enc)).toBe(true)
    expect(patch.date_of_birth_enc).toBeUndefined()    // both plaintext+ciphertext null already
  })

  it('throws when the initial fetch fails', async () => {
    db.from.mockReturnValueOnce(new QB({ data: null, error: { message: 'boom' } }))
    await expect(migrateClientsEncryption(db)).rejects.toThrow('fetch clients: boom')
  })
})
