// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'crypto'

// Pin a known key before importing the module so the dev-fallback path
// doesn't activate. Restore the original env on teardown so other tests are
// not affected.
let originalKey
beforeAll(() => {
  originalKey = process.env.ENCRYPTION_KEY
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')
})
afterAll(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = originalKey
})

const { encrypt, decrypt, isEncryptedBlob, isEncryptionConfigured } = await import('./encryption.js')

describe('encryption', () => {
  it('reports configured when ENCRYPTION_KEY is set', () => {
    expect(isEncryptionConfigured()).toBe(true)
  })

  it('round-trips ASCII strings', () => {
    const pt = 'BJ123456'
    const ct = encrypt(pt)
    expect(ct).not.toBe(pt)
    expect(decrypt(ct)).toBe(pt)
  })

  it('round-trips unicode + special characters', () => {
    const pt = "Otmane d'El-Mouhib · 1990-06-15"
    expect(decrypt(encrypt(pt))).toBe(pt)
  })

  it('uses a fresh IV per encrypt() — same plaintext yields different ciphertext', () => {
    const a = encrypt('same')
    const b = encrypt('same')
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe('same')
    expect(decrypt(b)).toBe('same')
  })

  it('passes through null / undefined / empty string unchanged', () => {
    expect(encrypt(null)).toBe(null)
    expect(encrypt(undefined)).toBe(undefined)
    expect(encrypt('')).toBe('')
    expect(decrypt(null)).toBe(null)
    expect(decrypt(undefined)).toBe(undefined)
    expect(decrypt('')).toBe('')
  })

  it('decrypts a plaintext-looking blob as itself (migration-in-flight tolerance)', () => {
    // Old plaintext rows that pre-date encryption: no colons → passed through.
    expect(decrypt('plaintext-cin')).toBe('plaintext-cin')
  })

  it('returns the original blob on tag mismatch (no exception leakage)', () => {
    const valid = encrypt('hello')
    const [iv, tag, ct] = valid.split(':')
    // Flip one byte of the auth tag → tampered.
    const tamperedTag = (parseInt(tag[0], 16) ^ 1).toString(16) + tag.slice(1)
    const tampered = `${iv}:${tamperedTag}:${ct}`
    expect(decrypt(tampered)).toBe(tampered)
  })

  it('isEncryptedBlob detects the wire format', () => {
    expect(isEncryptedBlob(encrypt('x'))).toBe(true)
    expect(isEncryptedBlob('plaintext')).toBe(false)
    expect(isEncryptedBlob('a:b:c')).toBe(false)             // wrong hex shape
    expect(isEncryptedBlob(null)).toBe(false)
    expect(isEncryptedBlob(undefined)).toBe(false)
  })
})

describe('encryption — dev fallback (no key)', () => {
  // Separate module load with ENCRYPTION_KEY unset so we exercise the
  // dev-fallback path. vi.resetModules() lets us re-import.
  let modNoKey
  beforeAll(async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    delete process.env.ENCRYPTION_KEY
    modNoKey = await import('./encryption.js')
  })

  it('reports NOT configured', () => {
    expect(modNoKey.isEncryptionConfigured()).toBe(false)
  })

  it('encrypt/decrypt are no-ops', () => {
    expect(modNoKey.encrypt('plain')).toBe('plain')
    expect(modNoKey.decrypt('plain')).toBe('plain')
  })
})
