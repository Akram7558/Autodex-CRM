-- ============================================================
-- Migration 41: Rental module — list-query indexes
-- ============================================================
-- Speeds up the rental list pages, which all run the shape:
--   WHERE showroom_id = $1  ORDER BY created_at DESC  LIMIT n
-- (fleet at /dashboard/location/vehicules, customers at
--  /dashboard/location/clients, and the Phase-2 rentals list).
--
-- Why NEW indexes are needed (and what is already covered):
--   • showroom_id EQUALITY filtering is already served by the existing
--     composites' leftmost column — so we do NOT add redundant single-
--     column showroom_id indexes (they would only add write overhead):
--       rental_vehicles  : idx_rental_vehicles_showroom_active  (showroom_id, is_active)
--       rental_customers : idx_rental_customers_phone           (showroom_id, phone)
--                          idx_rental_customers_blacklist       (showroom_id, blacklisted)
--       rentals          : idx_rentals_showroom_status_date     (showroom_id, status, start_date)
--   • rental_id lookups are already covered:
--       rental_payments    : idx_rental_payments_rental     (rental_id)
--       rental_inspections : idx_rental_inspections_rental  (rental_id, type)
--
-- What those composites CANNOT do is satisfy the ORDER BY created_at DESC
-- of the list pages (their 2nd column is is_active / phone / blacklisted /
-- status, not created_at), forcing a sort over the filtered set. The
-- (showroom_id, created_at DESC) indexes below let Postgres serve the
-- filter + sort + LIMIT directly from the index.
--
-- Idempotent. Wrapped in BEGIN/COMMIT.
-- ============================================================

BEGIN;

-- Fleet list: WHERE showroom_id = $1 ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_rental_vehicles_showroom_created
  ON public.rental_vehicles (showroom_id, created_at DESC);

-- Customers list: WHERE showroom_id = $1 ORDER BY created_at DESC + paging
CREATE INDEX IF NOT EXISTS idx_rental_customers_showroom_created
  ON public.rental_customers (showroom_id, created_at DESC);

-- Rentals list (Phase 2): WHERE showroom_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_rentals_showroom_created
  ON public.rentals (showroom_id, created_at DESC);

COMMIT;
