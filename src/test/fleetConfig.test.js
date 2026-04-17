/**
 * Tests for Fleet maintenance logic:
 *   1. getDefaultConfigForMake — lookup from fleet config defaults
 *   2. autoFillMaintenance     — mirrors Fleet.jsx logic (not exported, mirrored here)
 *   3. urgentDeadlines         — mirrors Fleet.jsx urgency count logic
 *
 * All pure logic, no React rendering needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDefaultConfigForMake } from '../../lib/fleetConfigDefaults'

// ── Mirror of Fleet.jsx::autoFillMaintenance (not exported) ──

function autoFillMaintenance(form) {
  const config = getDefaultConfigForMake(form.make)
  if (!config) return form

  const mileage = Number(form.mileage) || 0
  const purchaseDate = form.purchaseDate || (form.year ? `${form.year}-01-01` : null)
  const patch = {}

  if (!form.nextOilChangeMileage) {
    patch.nextOilChangeMileage = mileage + config.vidangeKm
  }

  if (!form.nextTimingBeltMileage) {
    patch.nextTimingBeltMileage = mileage + config.courroieKm
  }

  if (!form.warrantyEnd && purchaseDate && config.warrantyYears) {
    const d = new Date(purchaseDate)
    if (!isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + config.warrantyYears)
      patch.warrantyEnd = d.toISOString().split('T')[0]
    }
  }

  if (!form.nextControleTech && purchaseDate && config.controlTechYears) {
    const d = new Date(purchaseDate)
    if (!isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + config.controlTechYears)
      patch.nextControleTech = d.toISOString().split('T')[0]
    }
  }

  return { ...form, ...patch }
}

// ── Mirror of Fleet.jsx urgency count logic ───────────────────

function countUrgentDeadlines(vehicle, now = new Date()) {
  return [vehicle.nextOilChange, vehicle.nextTimingBelt, vehicle.nextControleTech, vehicle.nextRepair, vehicle.warrantyEnd]
    .filter(d => {
      if (!d) return false
      const dt = new Date(d)
      return !isNaN(dt.getTime()) && Math.ceil((dt - now) / 86400000) <= 30
    }).length
}

// ── Fixtures ──────────────────────────────────────────────────

const getMockVehicle = (o = {}) => ({
  make: 'Dacia', model: 'Logan', year: 2022, plate: '1-A-1234',
  mileage: 45000, purchaseDate: '2022-01-01',
  nextOilChange: null, nextTimingBelt: null, nextControleTech: null,
  nextRepair: null, warrantyEnd: null,
  ...o,
})

const MOCK_NOW = new Date('2024-06-01T00:00:00Z')

// ── getDefaultConfigForMake ───────────────────────────────────

describe('getDefaultConfigForMake', () => {
  it('returns config for a known make', () => {
    const config = getDefaultConfigForMake('Dacia')
    expect(config).not.toBeNull()
    expect(config.warrantyYears).toBe(3)
    expect(config.vidangeKm).toBe(10000)
    expect(config.courroieKm).toBe(80000)
  })

  it('is case-insensitive', () => {
    expect(getDefaultConfigForMake('dacia')).not.toBeNull()
    expect(getDefaultConfigForMake('DACIA')).not.toBeNull()
    expect(getDefaultConfigForMake('Dacia')).not.toBeNull()
  })

  it('returns null for unknown make', () => {
    expect(getDefaultConfigForMake('Unknown Brand')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getDefaultConfigForMake('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(getDefaultConfigForMake(null)).toBeNull()
  })

  it('returns Kia with 7-year warranty', () => {
    const config = getDefaultConfigForMake('Kia')
    expect(config.warrantyYears).toBe(7)
  })

  it('returns Hyundai with 5-year warranty', () => {
    const config = getDefaultConfigForMake('Hyundai')
    expect(config.warrantyYears).toBe(5)
  })
})

// ── autoFillMaintenance ────────────────────────────────────────

describe('autoFillMaintenance', () => {
  describe('oil change mileage', () => {
    it('sets nextOilChangeMileage = mileage + vidangeKm', () => {
      const form = { make: 'Dacia', mileage: 45000, purchaseDate: '2022-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextOilChangeMileage).toBe(55000) // 45000 + 10000
    })

    it('does not overwrite existing nextOilChangeMileage', () => {
      const form = { make: 'Dacia', mileage: 45000, nextOilChangeMileage: 50000, purchaseDate: '2022-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextOilChangeMileage).toBe(50000) // unchanged
    })
  })

  describe('timing belt mileage', () => {
    it('sets nextTimingBeltMileage = mileage + courroieKm', () => {
      const form = { make: 'Dacia', mileage: 45000, purchaseDate: '2022-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextTimingBeltMileage).toBe(125000) // 45000 + 80000
    })

    it('does not overwrite existing nextTimingBeltMileage', () => {
      const form = { make: 'Dacia', mileage: 45000, nextTimingBeltMileage: 100000, purchaseDate: '2022-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextTimingBeltMileage).toBe(100000)
    })
  })

  describe('warranty end date', () => {
    it('sets warrantyEnd = purchaseDate + warrantyYears', () => {
      const form = { make: 'Dacia', mileage: 0, purchaseDate: '2022-06-15' }
      const result = autoFillMaintenance(form)
      expect(result.warrantyEnd).toBe('2025-06-15') // Dacia: 3 years
    })

    it('falls back to year-01-01 when no purchaseDate', () => {
      const form = { make: 'Dacia', mileage: 0, year: 2022 }
      const result = autoFillMaintenance(form)
      expect(result.warrantyEnd).toBe('2025-01-01')
    })

    it('does not overwrite existing warrantyEnd', () => {
      const form = { make: 'Dacia', mileage: 0, purchaseDate: '2022-01-01', warrantyEnd: '2030-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.warrantyEnd).toBe('2030-01-01')
    })
  })

  describe('controle technique date', () => {
    it('sets nextControleTech = purchaseDate + controlTechYears (5 for all makes)', () => {
      const form = { make: 'Dacia', mileage: 0, purchaseDate: '2022-03-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextControleTech).toBe('2027-03-01') // 5 years
    })

    it('does not overwrite existing nextControleTech', () => {
      const form = { make: 'Dacia', mileage: 0, purchaseDate: '2022-01-01', nextControleTech: '2026-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextControleTech).toBe('2026-01-01')
    })
  })

  describe('unknown make', () => {
    it('returns form unchanged for unknown make', () => {
      const form = { make: 'Unknown', mileage: 10000, purchaseDate: '2022-01-01' }
      const result = autoFillMaintenance(form)
      expect(result.nextOilChangeMileage).toBeUndefined()
      expect(result.warrantyEnd).toBeUndefined()
    })
  })

  describe('save validation guard', () => {
    it('requires make, model, and plate to save (all present)', () => {
      const form = { make: 'Dacia', model: 'Logan', plate: '1-A-1234', mileage: 0 }
      // Guard: if (!form.make || !form.model || !form.plate) return
      const canSave = !!(form.make && form.model && form.plate)
      expect(canSave).toBe(true)
    })

    it('blocks save when make is missing', () => {
      const form = { make: '', model: 'Logan', plate: '1-A-1234', mileage: 0 }
      const canSave = !!(form.make && form.model && form.plate)
      expect(canSave).toBe(false)
    })

    it('blocks save when model is missing', () => {
      const form = { make: 'Dacia', model: '', plate: '1-A-1234', mileage: 0 }
      const canSave = !!(form.make && form.model && form.plate)
      expect(canSave).toBe(false)
    })

    it('blocks save when plate is missing', () => {
      const form = { make: 'Dacia', model: 'Logan', plate: '', mileage: 0 }
      const canSave = !!(form.make && form.model && form.plate)
      expect(canSave).toBe(false)
    })
  })
})

// ── Urgency / amortissement deadlines ─────────────────────────

describe('countUrgentDeadlines', () => {
  it('returns 0 when all deadlines are null', () => {
    const v = getMockVehicle()
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(0)
  })

  it('returns 0 for a deadline more than 30 days away', () => {
    const v = getMockVehicle({ warrantyEnd: '2024-08-01' }) // 61 days after 2024-06-01
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(0)
  })

  it('counts a deadline exactly 30 days away as urgent', () => {
    const v = getMockVehicle({ warrantyEnd: '2024-07-01' }) // 30 days after 2024-06-01
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(1)
  })

  it('counts a deadline already passed as urgent (≤ 30 days)', () => {
    const v = getMockVehicle({ warrantyEnd: '2024-05-01' }) // past date
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(1)
  })

  it('counts multiple urgent deadlines independently', () => {
    const v = getMockVehicle({
      nextOilChange:    '2024-06-10', // 9 days → urgent
      nextTimingBelt:   '2024-06-20', // 19 days → urgent
      nextControleTech: '2024-08-01', // 61 days → not urgent
      warrantyEnd:      '2024-06-25', // 24 days → urgent
    })
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(3)
  })

  it('counts up to 5 fields (nextOilChange, nextTimingBelt, nextControleTech, nextRepair, warrantyEnd)', () => {
    const urgentDate = '2024-06-05' // 4 days after mock now
    const v = getMockVehicle({
      nextOilChange:    urgentDate,
      nextTimingBelt:   urgentDate,
      nextControleTech: urgentDate,
      nextRepair:       urgentDate,
      warrantyEnd:      urgentDate,
    })
    expect(countUrgentDeadlines(v, MOCK_NOW)).toBe(5)
  })
})
