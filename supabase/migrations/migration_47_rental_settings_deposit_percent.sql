-- ============================================================
-- Migration 47: rental_settings → add deposit_min_percent
-- ============================================================
-- Adds a per-showroom CONFIGURABLE minimum reservation deposit (caution)
-- percentage. Until now the reservation floor was hardcoded at 5% in the
-- app (RENTAL_MIN_DEPOSIT_FRACTION in src/components/rental/booking/types.ts
-- + POST /api/rental/rentals/[id]/reserve). This column lets each loueur set
-- their own minimum (e.g. 5 / 10 / 20 %).
--
-- migration_37 created public.rental_settings with one row PER SHOWROOM
-- (showroom_id uuid NOT NULL UNIQUE). migration_39 guarantees a row for every
-- showroom (auto-init trigger on showrooms INSERT + a one-time backfill), so
-- the new column lands on every existing settings row automatically.
--
-- New column: deposit_min_percent integer NOT NULL DEFAULT 5
--   • Whole percents only (integer), matching min/max_rental_days.
--   • DB-LEVEL SAFETY FLOOR via CHECK (>= 5 AND <= 100): the configured
--     minimum can never drop below 5% (or exceed 100%), even if the API/UI
--     validation is bypassed. The app re-validates the same bounds.
--
-- NO BACKFILL statement needed: ADD COLUMN ... NOT NULL DEFAULT 5 fills every
-- existing row with 5 automatically (constant default → fast, no rewrite race).
--
-- ONLY the new column + its CHECK are touched. RLS policies, the
-- updated_at touch trigger, every other column, and all other tables are left
-- untouched. Idempotent + wrapped in a transaction.
--
-- DEPLOY ORDER: run this migration in prod BEFORE the build step (settings
-- page field + reserve flow reading this column) ships. Low-risk either way:
-- every read path falls back to 5% when the column/row can't be loaded.
-- ============================================================

BEGIN;

-- 1. Add the column. NOT NULL DEFAULT 5 backfills existing rows automatically.
ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS deposit_min_percent integer NOT NULL DEFAULT 5;

-- 2. Add the safety-floor CHECK (5..100), only if it doesn't already exist so
--    re-running this migration won't error on a duplicate constraint name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.rental_settings'::regclass
       AND conname  = 'rental_settings_deposit_min_percent_check'
  ) THEN
    ALTER TABLE public.rental_settings
      ADD CONSTRAINT rental_settings_deposit_min_percent_check
      CHECK (deposit_min_percent >= 5 AND deposit_min_percent <= 100);
  END IF;
END
$$;

COMMIT;
