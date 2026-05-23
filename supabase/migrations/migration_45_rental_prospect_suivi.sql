-- ============================================================
-- Migration 45: rental_prospects.status → sales-like "suivi" workflow
-- ============================================================
-- migration_44 created public.rental_prospects with an INLINE column CHECK
-- on `status` allowing ('nouvelle','contactee','convertie','perdue')
-- (Postgres auto-named it `rental_prospects_status_check`). Default stays
-- 'nouvelle'.
--
-- We move to a follow-up ("suivi") model mirroring the sales Prospects page.
-- NEW allowed status set:
--   nouvelle, tentative_1, tentative_2, tentative_3, reporter,
--   rdv_planifie, convertie, perdue
--
--   • 'contactee' is REMOVED — existing rows are remapped to 'tentative_1'.
--   • 'convertie' stays terminal/machine-set (the convert-to-contract flow).
--   • 'perdue' stays as the DB CODE but is DISPLAYED as "Annulée" in the UI
--     (label-only — no DB change for that).
--
-- DEPLOY ORDER: run this migration in prod BEFORE the new UI/API code ships,
-- otherwise the new status values (tentative_*, reporter, rdv_planifie)
-- would violate the OLD CHECK and writes would fail.
--
-- Only the status CHECK is touched. The DEFAULT, RLS/policies, indexes,
-- trigger and the rental_prospects_dates_check constraint are untouched.
-- Idempotent + wrapped in a transaction.
-- ============================================================

BEGIN;

-- 1. Drop the known status CHECK by its conventional auto-name.
ALTER TABLE public.rental_prospects
  DROP CONSTRAINT IF EXISTS rental_prospects_status_check;

-- 2. Defensive: drop ANY remaining CHECK constraint on this table whose
--    definition references `status` (covers a differently-named constraint).
--    The dates/reason checks don't contain "status", so they're left alone.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.rental_prospects'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.rental_prospects DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

-- 3. Remap removed value before re-adding the constraint.
UPDATE public.rental_prospects
   SET status = 'tentative_1'
 WHERE status = 'contactee';

-- 4. Re-add the status CHECK with the new allowed set (DEFAULT 'nouvelle'
--    on the column is unchanged).
ALTER TABLE public.rental_prospects
  ADD CONSTRAINT rental_prospects_status_check
  CHECK (status IN (
    'nouvelle',
    'tentative_1',
    'tentative_2',
    'tentative_3',
    'reporter',
    'rdv_planifie',
    'convertie',
    'perdue'
  ));

COMMIT;
