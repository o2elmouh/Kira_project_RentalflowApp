/**
 * Maps a raw Supabase vehicles row to the API shape used across server routes.
 * DB columns:  brand, plate_number
 * API shape:   make,  plate
 * Keeps field names consistent with vehicleFromDb() in lib/db.js (frontend mapper).
 */
export function vehicleRowToApi(row) {
  if (!row) return row
  return {
    ...row,
    make:  row.brand,
    plate: row.plate_number,
  }
}
