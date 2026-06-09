import { describe, it, expect } from 'vitest'
import { vehicleRowToApi } from '../../server/lib/vehicleMapper.js'

describe('vehicleRowToApi', () => {
  it('maps brand → make', () => {
    const row = { id: '1', brand: 'Dacia', model: 'Duster', plate_number: '12345-A-6' }
    expect(vehicleRowToApi(row).make).toBe('Dacia')
  })
  it('maps plate_number → plate', () => {
    const row = { id: '1', brand: 'Dacia', model: 'Duster', plate_number: '12345-A-6' }
    expect(vehicleRowToApi(row).plate).toBe('12345-A-6')
  })
  it('preserves model and id', () => {
    const row = { id: '1', brand: 'Dacia', model: 'Duster', plate_number: '12345-A-6' }
    const v = vehicleRowToApi(row)
    expect(v.id).toBe('1')
    expect(v.model).toBe('Duster')
  })
  it('handles null plate_number gracefully', () => {
    const row = { id: '1', brand: 'Dacia', model: 'Duster', plate_number: null }
    expect(vehicleRowToApi(row).plate).toBe(null)
  })
  it('returns row unchanged if null', () => {
    expect(vehicleRowToApi(null)).toBe(null)
  })
})
