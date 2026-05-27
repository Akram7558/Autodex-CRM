-- ============================================================
-- Migration 49: rentals.status → add 'tentative_1' / '_2' / '_3'
-- ============================================================
-- migration_46 set the status CHECK to
--   ('draft','confirmed','active','completed','overdue','cancelled','reporter')
-- and named the constraint `rentals_status_check`. This migration extends it
-- with three new "À-confirmer" sub-statuses used to track relance attempts
-- on a draft (unblocks Chantier 1 — tentative_1/_2/_3 buttons on the draft
-- row, mirroring the sales/prospects suivi vocabulary).
--
-- New full set (10 values):
--   draft, tentative_1, tentative_2, tentative_3, reporter,
--   confirmed, active, completed, overdue, cancelled
--
-- NO data remap: no existing row uses tentative_X (the column was constrained
-- to the 7 previous values). All existing rows stay valid in the new set.
--
-- DEPLOY ORDER: run this migration in prod BEFORE the build step ships,
-- otherwise writing status='tentative_1/2/3' would violate the OLD CHECK.
--
-- Only the status CHECK is touched. DEFAULT 'draft', RLS, indexes, triggers,
-- the rentals_dates_check constraint and check_rental_overlap() are
-- untouched. Idempotent (DROP IF EXISTS) + wrapped in a transaction.
-- ============================================================

BEGIN;

-- 1. Drop the named status CHECK from migration_46.
ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_status_check;

-- 2. Re-add with the three tentative_X sub-statuses.
ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_status_check
  CHECK (status IN (
    'draft',
    'tentative_1',
    'tentative_2',
    'tentative_3',
    'reporter',
    'confirmed',
    'active',
    'completed',
    'overdue',
    'cancelled'
  ));

COMMIT;
