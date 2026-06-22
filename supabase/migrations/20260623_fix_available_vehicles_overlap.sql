-- ─────────────────────────────────────────────────────────────
-- Migration 20260623 — Availability = period-overlap ONLY
-- ─────────────────────────────────────────────────────────────
--
-- Bug: a car finalized for the BEGINNING OF NEXT MONTH became unavailable for
-- EVERY period — including the current month when it is physically free.
--
-- Root cause: `ContractStep.handleFinalize` flips `vehicles.status` to 'rented'
-- the moment a contract is finalized (a physical-state hint shown in Fleet /
-- Dashboard / FleetMap). Migration 004 (`004_migration_v2.sql`) had regressed
-- `get_available_vehicles` to gate on `v.status = 'available'`, so that global
-- flag wrongly hid the car from availability for all date ranges — even ranges
-- that don't overlap the future booking.
--
-- Fix: availability must depend on ONE rule — is the vehicle booked during the
-- requested period? We restore the date-overlap-only logic (the documented
-- intent in v1.14.23 and the original 001/002 definitions), excluding only
-- vehicles that are physically out of service (maintenance/retired).
--
-- Overlap predicate is half-open (`pickup_date < end AND return_date > start`),
-- identical to `lib/db.js#findVehicleConflicts`, so a car can be re-rented the
-- same day it is returned and a booking that starts on day X does not block a
-- rental that ends on day X. Only `status='active'` contracts hold a car —
-- abandoned 'draft' wizard rows never reserve the vehicle.
--
-- Signature and return type (SETOF vehicles) are unchanged → CREATE OR REPLACE
-- is sufficient (no DROP FUNCTION needed).

CREATE OR REPLACE FUNCTION get_available_vehicles(
  p_agency_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS SETOF vehicles
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT v.*
    FROM vehicles v
   WHERE v.agency_id = p_agency_id
     AND v.status NOT IN ('maintenance', 'retired')
     AND v.id NOT IN (
       SELECT c.vehicle_id
         FROM contracts c
        WHERE c.agency_id = p_agency_id
          AND c.status = 'active'
          AND c.pickup_date::DATE < p_end_date
          AND c.return_date::DATE > p_start_date
     )
   ORDER BY v.brand, v.model;
$$;
