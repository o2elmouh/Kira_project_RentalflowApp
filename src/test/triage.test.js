import { describe, it, expect } from 'vitest'
import { preFilter, detectLanguage, translateToFrench } from '../../server/lib/triage.js'

describe('detectLanguage', () => {
  it('detects French', () => {
    expect(detectLanguage('Bonjour je voudrais louer une voiture pour la semaine')).toBe('fra')
  })
  it('detects English', () => {
    expect(detectLanguage('Hi I would like to rent a car for the weekend')).toBe('eng')
  })
  it('returns und for very short text', () => {
    expect(detectLanguage('ok')).toBe('und')
  })
  it('detects Arabic', () => {
    expect(['arb', 'ary']).toContain(detectLanguage('بغيت نحجز سيارة ليوم الجمعة من فضلك'))
  })
})

describe('preFilter', () => {
  it('PASS on HIGH signal keyword — French', () => {
    const r = preFilter('Bonjour, je souhaite faire une réservation pour samedi')
    expect(r.result).toBe('pass')
  })
  it('PASS on 2 MEDIUM keywords', () => {
    const r = preFilter('Ma voiture a eu un accident hier, j\'ai besoin d\'aide')
    expect(r.result).toBe('pass')
  })
  it('AMBIGUOUS on 1 MEDIUM keyword', () => {
    const r = preFilter('Bonjour, est-ce que la voiture est disponible ?')
    expect(r.result).toBe('ambiguous')
  })
  it('AMBIGUOUS on 3 LOW keywords', () => {
    const r = preFilter('Quel est le prix et le tarif disponible pour cette option ?')
    expect(r.result).toBe('ambiguous')
  })
  it('FAIL on no rental keywords', () => {
    const r = preFilter('Bonjour maman, comment tu vas aujourd\'hui ?')
    expect(r.result).toBe('fail')
  })
  it('PASS on HIGH signal — English', () => {
    const r = preFilter('I want to make a car rental booking for next Monday')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — Arabic/Darija', () => {
    const r = preFilter('بغيت نحجز سيارة ليوم الجمعة')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — German', () => {
    const r = preFilter('Ich möchte einen Mietwagen für nächste Woche buchen')
    expect(r.result).toBe('pass')
  })
  it('PASS on HIGH signal — Dutch', () => {
    const r = preFilter('Ik wil een auto huren voor het weekend')
    expect(r.result).toBe('pass')
  })
  it('returns matched keywords list', () => {
    const r = preFilter('Je veux louer une voiture')
    expect(r.matchedKeywords.length).toBeGreaterThan(0)
  })
  it('is case-insensitive', () => {
    const r = preFilter('LOCATION VOITURE DISPONIBLE')
    expect(r.result).toBe('pass')
  })
  it('handles null input', () => {
    expect(preFilter(null).result).toBe('fail')
  })
  it('handles empty string', () => {
    expect(preFilter('').result).toBe('fail')
  })
  it('PASS on 1 MEDIUM + 2 LOW keywords', () => {
    const r = preFilter('voiture prix disponible disponibilité')
    expect(r.result).toBe('pass')
  })
})

describe('translateToFrench', () => {
  it('returns empty string unchanged', async () => {
    const result = await translateToFrench('')
    expect(result).toBe('')
  })
})
