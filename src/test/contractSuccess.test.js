import { describe, it, expect } from 'vitest'
import { describeSignatureState } from '../../utils/contractSuccess.js'

describe('describeSignatureState', () => {
  it('returns signed copy when contract has signedAt (electronic flow)', () => {
    const r = describeSignatureState({ signedAt: '2026-05-27T10:30:00.000Z' })
    expect(r.signed).toBe(true)
    expect(r.heading).toBe('Contrat signé')
    expect(r.subline.startsWith('Le client a signé le contrat le ')).toBe(true)
  })

  it('accepts snake_case signed_at as well', () => {
    const r = describeSignatureState({ signed_at: '2026-05-27T10:30:00.000Z' })
    expect(r.signed).toBe(true)
    expect(r.heading).toBe('Contrat signé')
  })

  it('returns finalisé copy when no signature timestamp (in-person flow)', () => {
    const r = describeSignatureState({})
    expect(r.signed).toBe(false)
    expect(r.heading).toBe('Contrat finalisé')
    expect(r.subline).toBe('Prêt à imprimer pour signature en agence.')
  })

  it('treats null/undefined contract safely', () => {
    const r = describeSignatureState(null)
    expect(r.signed).toBe(false)
    expect(r.heading).toBe('Contrat finalisé')
  })

  it('treats empty signedAt strings as unsigned', () => {
    const r = describeSignatureState({ signedAt: '', signed_at: null })
    expect(r.signed).toBe(false)
    expect(r.heading).toBe('Contrat finalisé')
  })
})
