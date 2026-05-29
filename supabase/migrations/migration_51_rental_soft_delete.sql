-- ============================================================
-- Migration 51: soft-delete (corbeille) for rentals + rental_prospects
-- ============================================================
-- Adds a nullable `deleted_at` timestamp to both rental tables so a
-- cancelled lead (rentals.status='cancelled' / rental_prospects.status=
-- 'perdue') can be moved to a "corbeille": the row is hidden from every
-- list + count (the app appends `.is('deleted_at', null)` to those selects)
-- but is NOT physically deleted.
--
-- Recovery is DB-only (set deleted_at back to NULL) — there is no corbeille
-- page, no restore UI, and no permanent-delete path in the app.
--
-- Backwards-compatible: existing rows keep deleted_at = NULL = "not deleted",
-- so nothing disappears until a user explicitly trashes it.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) + wrapped in a transaction. No RLS
-- change needed: the existing per-showroom policies already govern who can
-- UPDATE these rows, and the trash endpoints write deleted_at via the RLS-
-- aware authSb client.
-- ============================================================

BEGIN;

ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE rental_prospects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMIT;
