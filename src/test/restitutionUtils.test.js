/**
 * Tests for utils/restitutionUtils — pure function computeExtraFees.
 * No React, no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { computeExtraFees, FUEL_LEVELS, FUEL_OPTIONS, ZONES } from '../../utils/restitutionUtils'

// ── Fixtures ──────────────────────────────────────────────────

const getMockVehicle = (o = {}) => ({
  maxKmEnabled: false,
  maxKmPerDay: 300,
  ...o,
})

const getMockContract = (o = {}) => ({
  startMileage: 50000,
  startDate: '2024-01-01',
  endDate: '2024-01-04', // 3 days
  fuelLevel: 'Plein',
  ...o,
})

// ── computeExtraFees ──────────────────────────────────────────

describe('computeExtraFees', () => {
  describe('km fees', () => {
    it('returns zero extra km when maxKmEnabled is false', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: false }),
        returnMileage: 51000,
        returnFuelLevel: 'Plein',
        contract: getMockContract(),
      })
      expect(result.extraKm).toBe(0)
      expect(result.extraKmFee).toBe(0)
      expect(result.kmAllowed).toBe(0)
    })

    it('calculates allowed km = maxKmPerDay × contractDays', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: true, maxKmPerDay: 100 }),
        returnMileage: 50200,
        returnFuelLevel: 'Plein',
        contract: getMockContract(), // 3 days → 300 allowed
      })
      expect(result.kmAllowed).toBe(300)
    })

    it('charges 2 MAD per extra km when limit exceeded', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: true, maxKmPerDay: 100 }),
        returnMileage: 50500, // 500 km driven, 300 allowed → 200 extra
        returnFuelLevel: 'Plein',
        contract: getMockContract(),
      })
      expect(result.extraKm).toBe(200)
      expect(result.extraKmFee).toBe(400)
    })

    it('does not charge extra km when usage is within limit', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: true, maxKmPerDay: 300 }),
        returnMileage: 50800, // 800 km driven, 900 km allowed (3 × 300)
        returnFuelLevel: 'Plein',
        contract: getMockContract(),
      })
      expect(result.extraKm).toBe(0)
      expect(result.extraKmFee).toBe(0)
    })
  })

  describe('fuel fees', () => {
    it('charges 100 MAD per missing quarter-tank', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: '1/2', // departed Plein (4), returned 1/2 (2) → diff = 2
        contract: getMockContract({ fuelLevel: 'Plein' }),
      })
      expect(result.fuelDiff).toBe(2)
      expect(result.fuelFee).toBe(200)
    })

    it('charges no fuel fee when return level matches departure', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: 'Plein',
        contract: getMockContract({ fuelLevel: 'Plein' }),
      })
      expect(result.fuelDiff).toBe(0)
      expect(result.fuelFee).toBe(0)
    })

    it('uses fuelPriceOverride instead of computed fuel fee', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: '1/4', // would normally be 300 (3 × 100)
        contract: getMockContract({ fuelLevel: 'Plein' }),
        fuelPriceOverride: 150,
      })
      expect(result.fuelFee).toBe(150)
    })

    it('accepts fuelPriceOverride of 0 (free override)', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: 'Vide',
        contract: getMockContract({ fuelLevel: 'Plein' }),
        fuelPriceOverride: 0,
      })
      expect(result.fuelFee).toBe(0)
    })
  })

  describe('damage fees', () => {
    it('adds damageFee to totalExtraFees', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: 'Plein',
        contract: getMockContract(),
        damageFee: 800,
      })
      expect(result.totalExtraFees).toBe(800)
    })

    it('defaults damageFee to 0 when not provided', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle(),
        returnMileage: 50000,
        returnFuelLevel: 'Plein',
        contract: getMockContract(),
      })
      expect(result.totalExtraFees).toBe(0)
    })
  })

  describe('total calculation', () => {
    it('sums extraKmFee + fuelFee + damageFee', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: true, maxKmPerDay: 100 }),
        returnMileage: 50500,   // 500 km driven, 300 allowed → 200 extra × 2 = 400
        returnFuelLevel: '1/2', // fuelDiff 2 × 100 = 200
        contract: getMockContract({ startMileage: 50000, fuelLevel: 'Plein' }),
        damageFee: 300,
      })
      expect(result.extraKmFee).toBe(400)
      expect(result.fuelFee).toBe(200)
      expect(result.totalExtraFees).toBe(900)
    })
  })

  describe('contract duration', () => {
    it('uses contractDays in km calculation', () => {
      const result = computeExtraFees({
        vehicle: getMockVehicle({ maxKmEnabled: true, maxKmPerDay: 100 }),
        returnMileage: 50000,
        returnFuelLevel: 'Plein',
        contract: getMockContract({ startDate: '2024-01-01', endDate: '2024-01-06' }), // 5 days
      })
      expect(result.contractDays).toBe(5)
      expect(result.kmAllowed).toBe(500)
    })
  })
})

// ── Constants ─────────────────────────────────────────────────

describe('FUEL_LEVELS', () => {
  it('assigns correct numeric values in ascending order', () => {
    expect(FUEL_LEVELS['Vide']).toBe(0)
    expect(FUEL_LEVELS['1/4']).toBe(1)
    expect(FUEL_LEVELS['1/2']).toBe(2)
    expect(FUEL_LEVELS['3/4']).toBe(3)
    expect(FUEL_LEVELS['Plein']).toBe(4)
  })
})

describe('FUEL_OPTIONS', () => {
  it('has 5 levels', () => {
    expect(FUEL_OPTIONS).toHaveLength(5)
  })
})

describe('ZONES', () => {
  it('has exactly 5 zones A-E', () => {
    expect(ZONES).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})
