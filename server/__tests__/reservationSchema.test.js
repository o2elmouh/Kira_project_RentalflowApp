/**
 * Schema-truth tests for server/lib/reservationSchema.
 *
 * Regression (v1.14.6): the GET /reservations/:id route SELECT and the
 * POST allow-list both referenced columns that never existed on the
 * `reservations` table (`daily_rate`, `notes`, `pickup_location`,
 * `return_location`, `extras`), producing a 500 with:
 *
 *   column reservations.daily_rate does not exist
 *
 * pickup_location and return_location are real concepts but live INSIDE
 * source_metadata (jsonb), not as their own columns. These tests guard
 * against that drift creeping back in.
 *
 * Source of truth: supabase/migrations/011_reservations.sql
 */
import { describe, it, expect } from 'vitest'
import {
  RESERVATION_ALLOWED_FIELDS,
  RESERVATION_DETAIL_COLUMNS,
} from '../lib/reservationSchema.js'

const PHANTOM_COLUMNS = [
  'daily_rate', 'notes', 'pickup_location', 'return_location', 'extras',
]

// Mirror of migration 011 — columns physically present on `reservations`.
const REAL_COLUMNS = new Set([
  'id', 'agency_id',
  'client_id', 'customer_name', 'customer_contact',
  'vehicle_id', 'car_model',
  'start_date', 'end_date',
  'total_price', 'currency',
  'source_channel', 'status', 'source_metadata',
  'lead_id', 'contract_id',
  'created_at', 'updated_at', 'created_by',
])

describe('RESERVATION_ALLOWED_FIELDS', () => {
  it('contains no phantom columns', () => {
    for (const phantom of PHANTOM_COLUMNS) {
      expect(RESERVATION_ALLOWED_FIELDS).not.toContain(phantom)
    }
  })

  it('only references columns that exist in the reservations table', () => {
    for (const f of RESERVATION_ALLOWED_FIELDS) {
      expect(REAL_COLUMNS.has(f)).toBe(true)
    }
  })

  it('includes the fields the wizard payload sets', () => {
    // buildReservationPayload writes these — they must be allowed through.
    const writtenByWizard = [
      'customer_name', 'customer_contact', 'car_model',
      'vehicle_id', 'client_id', 'start_date', 'end_date',
      'total_price', 'currency', 'source_channel', 'status',
      'source_metadata', 'lead_id',
    ]
    for (const f of writtenByWizard) {
      expect(RESERVATION_ALLOWED_FIELDS).toContain(f)
    }
  })

  it('excludes server-managed fields', () => {
    // These are set by the route handler / DB defaults — never by client.
    const serverManaged = ['id', 'agency_id', 'created_at', 'updated_at', 'created_by', 'contract_id']
    for (const f of serverManaged) {
      expect(RESERVATION_ALLOWED_FIELDS).not.toContain(f)
    }
  })
})

describe('RESERVATION_DETAIL_COLUMNS', () => {
  it('contains no phantom columns', () => {
    for (const phantom of PHANTOM_COLUMNS) {
      expect(RESERVATION_DETAIL_COLUMNS).not.toContain(phantom)
    }
  })

  it('only references columns that exist in the reservations table', () => {
    for (const c of RESERVATION_DETAIL_COLUMNS) {
      expect(REAL_COLUMNS.has(c)).toBe(true)
    }
  })

  it('includes the fields the detail panel needs', () => {
    const renderedByPanel = [
      'id', 'status', 'start_date', 'end_date',
      'total_price', 'currency', 'customer_name',
      'customer_contact', 'car_model', 'source_channel',
      'source_metadata',
    ]
    for (const c of renderedByPanel) {
      expect(RESERVATION_DETAIL_COLUMNS).toContain(c)
    }
  })
})
