-- ============================================================
-- Migration 46: rentals.status → add 'reporter'
-- ============================================================
-- migration_37 created public.rentals with an INLINE column CHECK on
-- `status` allowing ('draft','confirmed','active','completed','overdue',
-- 'cancelled') (Postgres auto-named it `rentals_status_check`).
-- DEFAULT stays 'draft'.
--
-- Adds a new status: 'reporter' — a contract whose start/RDV is postponed
-- (date à revoir). By DESIGN it is EXCLUDED from:
--   • check_rental_overlap() — counts only confirmed/active/overdue, so a
--     reported contract does NOT block the vehicle (function left untouched);
--   • the agenda (pickups=confirmed / returns=active / overdue);
--   • the hub "contrats actifs" + rented-today KPIs;
--   • catalog/availability checks.
-- All of those use explicit confirmed/active/overdue inclusion lists, so the
-- new code requires no change there — adding the value here is enough.
--
-- NO data remap: no existing row changes code; the 6 existing codes stay
-- valid in the new set.
--
-- DEPLOY ORDER: run this migration in prod BEFORE the new UI/API code ships,
-- otherwise writing status='reporter' would violate the OLD CHECK.
--
-- Only the status CHECK is touched. DEFAULT, RLS, indexes, the trigger, the
-- rentals_dates_check constraint and check_rental_overlap() are untouched.
-- Idempotent + wrapped in a transaction.
-- ============================================================

BEGIN;

-- 1. Drop the known status CHECK by its conventional auto-name.
ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_status_check;

-- 2. Defensive: drop ANY remaining CHECK on this table whose definition
--    references `status` (covers a differently-named constraint). The
--    dates / duration / amount checks don't contain "status", so they are
--    left intact by the ILIKE '%status%' filter.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.rentals'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.rentals DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

-- 3. Re-add the status CHECK with 'reporter' added (DEFAULT 'draft' on the
--    column is unchanged).
ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_status_check
  CHECK (status IN (
    'draft',
    'confirmed',
    'active',
    'completed',
    'overdue',
    'cancelled',
    'reporter'
  ));

COMMIT;
