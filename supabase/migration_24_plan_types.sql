-- ─────────────────────────────────────────────────────────────────────
-- saas_plans.plan_type — split the catalogue into "Classique" + "Totale"
-- ─────────────────────────────────────────────────────────────────────
-- Classique: existing 3 plans (vente only).
-- Totale:    new 3 plans (vente + location + features TBD).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, INSERT ON CONFLICT DO NOTHING
-- via the unique-on-name index from migration_23.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Add the column with a default so existing rows get a value, then
--    apply the CHECK constraint. Two-step to avoid CHECK violations on
--    pre-existing NULLs (impossible here given the default, but good
--    discipline).
alter table saas_plans
  add column if not exists plan_type text not null default 'classique';

-- Drop the constraint (if any prior version exists) before re-adding so
-- this migration is re-runnable.
alter table saas_plans
  drop constraint if exists saas_plans_plan_type_check;

alter table saas_plans
  add constraint saas_plans_plan_type_check
  check (plan_type in ('classique', 'totale'));

-- 2. Defensive: any NULLs from a half-applied state get bumped to
--    'classique'. The default already covers freshly-inserted rows.
update saas_plans set plan_type = 'classique' where plan_type is null;

-- 3. Seed the three "Totale" plans. on conflict by name → no-op when
--    re-running the migration. Names include the suffix so they don't
--    collide with the migration_23 seeds.
insert into saas_plans (name, duration_months, price, active, plan_type) values
  ('Pack 3 mois — La Totale',  3,  25000.00, true, 'totale'),
  ('Pack 6 mois — La Totale',  6,  40000.00, true, 'totale'),
  ('Pack 1 an — La Totale',    12, 70000.00, true, 'totale')
on conflict (name) do nothing;
