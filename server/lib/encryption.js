import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * AES-256-GCM helpers shared by the leads pipeline and the Phase 5 clients
 * encryption layer.
 *
 * Wire format: `${ivHex}:${tagHex}:${encHex}` — 12-byte IV, 16-byte auth tag,
 * arbitrary-length ciphertext, all hex-encoded.
 *
 * Dev fallback: if `ENCRYPTION_KEY` is unset, encrypt() returns the plaintext
 * unchanged and decrypt() is a no-op. This keeps local-dev usable without a
 * key (lets the app boot) at the cost of "encrypting" plaintext into the DB.
 * Production sets `ENCRYPTION_KEY` so this path never triggers.
 */

// Lazy: re-read ENCRYPTION_KEY the first time a crypto op runs (and again if
// the env value changes between calls — useful in tests and during a hot
// re-key). The cached Buffer is invalidated when the hex string changes.
let _cachedHex = null
let _cachedKey = null
function getKey() {
  const hex = process.env.ENCRYPTION_KEY || null
  if (hex === _cachedHex) return _cachedKey
  _cachedHex = hex
  _cachedKey = hex ? Buffer.from(hex, 'hex') : null
  return _cachedKey
}

export function isEncryptionConfigured() {
  return getKey() !== null
}

export function encrypt(text) {
  if (text == null || text === '') return text
  const key = getKey()
  if (!key) return text                                // dev fallback
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(blob) {
  if (blob == null || blob === '') return blob
  const key = getKey()
  if (!key) return blob
  if (typeof blob !== 'string' || !blob.includes(':')) return blob  // already plaintext (migration in flight)
  const parts = blob.split(':')
  if (parts.length !== 3) return blob
  const [ivHex, tagHex, encHex] = parts
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
    return dec.toString('utf8')
  } catch {
    // Tag mismatch / corrupt / wrong key — return the original blob so calling
    // code can decide whether to fail loudly or fall back. Don't leak via
    // exception type which key is in use.
    return blob
  }
}

/**
 * Returns true if a string is in the encrypted wire format. Used by the
 * one-shot migration to remain idempotent (skip already-encrypted rows).
 */
export function isEncryptedBlob(value) {
  if (typeof value !== 'string' || !value.includes(':')) return false
  const parts = value.split(':')
  if (parts.length !== 3) return false
  return /^[0-9a-f]{24}$/i.test(parts[0])   // 12-byte IV = 24 hex chars
      && /^[0-9a-f]{32}$/i.test(parts[1])   // 16-byte tag = 32 hex chars
      && /^[0-9a-f]+$/i.test(parts[2])
}
