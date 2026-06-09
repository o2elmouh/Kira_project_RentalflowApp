/**
 * Single source of truth for which columns exist on the `reservations`
 * table. Mirrors supabase/migrations/011_reservations.sql.
 *
 * Both the POST allow-list and the GET detail SELECT must stay in sync
 * with this list — anything else triggers Postgres
 * "column reservations.X does not exist" 500s at runtime.
 *
 * NOTE: pickup_location, return_location, and any future channel-specific
 * fields live INSIDE the `source_metadata` JSONB column, not as their own
 * columns. Do not add them here.
 */

// Columns that may be set via POST /reservations or PATCH body.
// agency_id, created_by, created_at, updated_at, id, contract_id are
// server-managed and intentionally excluded.
export const RESERVATION_ALLOWED_FIELDS = [
  'customer_name', 'customer_contact',
  'car_model', 'vehicle_id', 'client_id',
  'start_date', 'end_date',
  'total_price', 'currency',
  'source_channel', 'status',
  'source_metadata',
  'lead_id',
]

// SELECT list for GET /reservations/:id — the detail panel.
// Joins (clients, vehicles) are appended at the route layer.
export const RESERVATION_DETAIL_COLUMNS = [
  'id', 'agency_id', 'status',
  'start_date', 'end_date',
  'total_price', 'currency',
  'customer_name', 'customer_contact', 'car_model',
  'source_channel', 'source_metadata',
  'vehicle_id', 'client_id',
  'lead_id', 'contract_id',
  'created_at', 'created_by',
]
