-- ============================================================
-- Migration 52: Location module — perf indexes for hot queries
-- ============================================================
-- The page-auth dedup (getServerAuth) shaved the network round-trips off the
-- location server pages; this migration tightens the DB side. The tables are
-- small today (these queries measure ~0ms), so the indexes are a SCALE
-- investment — they let Postgres serve each hot list / timeline / agenda
-- query straight from an index once the row counts grow.
--
-- Why each NEW index (and what the EXISTING ones could NOT do):
--
--   1. rentals list (contrats/page.tsx):
--        WHERE showroom_id = $1 AND deleted_at IS NULL [AND status IN (...)]
--        ORDER BY created_at DESC LIMIT 100
--      The existing idx_rentals_showroom_created (showroom_id, created_at DESC)
--      is a FULL index — it still indexes soft-deleted rows. The new PARTIAL
--      index matches the list's `.is('deleted_at', null)` predicate exactly,
--      so it is smaller and serves filter + sort + limit directly. We KEEP the
--      old full index (it still serves any query that doesn't filter deleted_at).
--
--   2. rental_prospects list:
--        WHERE showroom_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC
--      The existing idx_rental_prospects_showroom_status_created has `status`
--      as its 2nd column, so it cannot serve the (showroom_id -> created_at)
--      sort unless status is also filtered. The new partial index does.
--
--   3. rental_prospects -> rental backlink (contrats prospect-origin badge +
--      dashboard): WHERE converted_rental_id = $1 / IS NOT NULL.
--      No index on converted_rental_id today; the vast majority of prospect
--      rows have it NULL, so a PARTIAL (... WHERE converted_rental_id IS NOT
--      NULL) index stays tiny.
--
--   4. rental_activities timeline (contrats list expand):
--        WHERE rental_id IN (...) ORDER BY created_at DESC
--      Today only (rental_id) is indexed (migration_50), forcing a per-rental
--      sort. Adding created_at DESC as the 2nd column serves the ordering from
--      the index. We KEEP the old (rental_id)-only index.
--
--   5. agenda returns / overdue (hub + agenda widget):
--        filter rentals on (showroom_id, status, end_date).
--      The existing idx_rentals_showroom_status_date is keyed on START_date as
--      its 3rd column; the agenda's returns / overdue branch filters END_date.
--      This composite covers it.
--
-- Plain CREATE INDEX IF NOT EXISTS (NOT CONCURRENTLY): the tables are small,
-- the brief lock is acceptable, and the whole migration runs inside one
-- transaction (CONCURRENTLY cannot run in a transaction block). Idempotent and
-- reversible by DROP INDEX. No table / column / RLS / policy change — indexes
-- only.
-- ============================================================

BEGIN;

-- 1. rentals live list: showroom + created-desc, soft-delete-aware.
CREATE INDEX IF NOT EXISTS idx_rentals_showroom_created_live
  ON public.rentals (showroom_id, created_at DESC) WHERE deleted_at IS NULL;

-- 2. rental_prospects live list: showroom + created-desc, soft-delete-aware.
CREATE INDEX IF NOT EXISTS idx_rental_prospects_showroom_created_live
  ON public.rental_prospects (showroom_id, created_at DESC) WHERE deleted_at IS NULL;

-- 3. rental_prospects -> rental backlink (prospect-origin badge + dashboard).
CREATE INDEX IF NOT EXISTS idx_rental_prospects_converted_rental
  ON public.rental_prospects (converted_rental_id) WHERE converted_rental_id IS NOT NULL;

-- 4. rental_activities per-contract timeline (rental_id + created-desc).
CREATE INDEX IF NOT EXISTS idx_rental_activities_rental_created
  ON public.rental_activities (rental_id, created_at DESC);

-- 5. agenda returns / overdue — rentals filtered by end_date.
CREATE INDEX IF NOT EXISTS idx_rentals_showroom_status_end_date
  ON public.rentals (showroom_id, status, end_date);

COMMIT;
