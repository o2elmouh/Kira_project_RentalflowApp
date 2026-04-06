// Shared restitution helpers used by Restitution.jsx

export const FUEL_LEVELS = { 'Vide': 0, '1/4': 1, '1/2': 2, '3/4': 3, 'Plein': 4 }
export const FUEL_OPTIONS = ['Vide', '1/4', '1/2', '3/4', 'Plein']

export const ZONES = ['A', 'B', 'C', 'D', 'E']

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
}

export function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

export function computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee = 0 }) {
  const startMileage = contract.startMileage || contract.mileageOut || 0
  const startDate = contract.startDate
  const endDate = contract.endDate || today()
  const contractDays = Math.max(1, daysBetween(startDate, endDate))
  const kmDriven = Math.max(0, (returnMileage || 0) - startMileage)
  const departureLevel = contract.fuelLevel || 'Plein'

  let extraKm = 0
  let extraKmFee = 0
  let kmAllowed = 0
  if (vehicle?.maxKmEnabled && vehicle?.maxKmPerDay) {
    kmAllowed = vehicle.maxKmPerDay * contractDays
    extraKm = Math.max(0, kmDriven - kmAllowed)
    extraKmFee = extraKm * 2
  }

  const fuelDiff = Math.max(0, (FUEL_LEVELS[departureLevel] || 0) - (FUEL_LEVELS[returnFuelLevel] || 0))
  const fuelFee = fuelDiff * 100
  const totalExtraFees = extraKmFee + fuelFee + (Number(damageFee) || 0)

  return { extraKm, extraKmFee, kmAllowed, kmDriven, fuelDiff, fuelFee, totalExtraFees, contractDays }
}
