-- ─────────────────────────────────────────────────────────────────────
-- migration_26_preorder_fields.sql
-- ─────────────────────────────────────────────────────────────────────
-- Extends `preorder_vehicles` with two new owner-managed fields:
--
--   • budget_dedouanement  NUMERIC(12,2)  — customs / clearance budget
--                                            shown alongside the price
--                                            on both the dashboard card
--                                            and the public catalog
--   • annee                INTEGER        — model year (already added by
--                                            migration 25, kept here for
--                                            idempotency / safety on
--                                            installs that skipped it)
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

alter table public.preorder_vehicles
  add column if not exists budget_dedouanement numeric(12,2),
  add column if not exists annee               integer;

-- Sanity comment so the columns are self-documenting in psql / DB tools.
comment on column public.preorder_vehicles.budget_dedouanement
  is 'Customs / clearance budget in DZD (owner-managed). Optional — null when not yet estimated.';
comment on column public.preorder_vehicles.annee
  is 'Model year. Optional.';
