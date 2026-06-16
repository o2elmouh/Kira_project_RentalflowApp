import { describe, it, expect } from 'vitest'
import { getSignRedirectUrl } from '../../landing/sign-redirect.js'

describe('landing getSignRedirectUrl', () => {
  it('redirects a legacy signing link, preserving the full query', () => {
    expect(getSignRedirectUrl('?sign=abc-123')).toBe('https://app.kiraflow.ma/?sign=abc-123')
  })

  it('preserves additional query params', () => {
    expect(getSignRedirectUrl('?sign=tok&lang=ar')).toBe('https://app.kiraflow.ma/?sign=tok&lang=ar')
  })

  it('returns null when there is no sign param', () => {
    expect(getSignRedirectUrl('')).toBeNull()
    expect(getSignRedirectUrl('?lang=ar')).toBeNull()
  })

  it('returns null for an empty sign param', () => {
    expect(getSignRedirectUrl('?sign=')).toBeNull()
  })
})
