-- ─────────────────────────────────────────────────────────────────────
-- migration_27_lead_order_type.sql
-- ─────────────────────────────────────────────────────────────────────
-- Adds an `order_type` discriminator on `leads` so the showroom prospects
-- page can split catalog-driven leads into:
--   • 'vehicle'  — visitor ordered an in-stock vehicle
--   • 'preorder' — visitor placed a pre-order
--   •  NULL      — regular lead (manual entry, ad lead, etc.)
--
-- Backfilled by POST /api/catalog/[slug]/order from now on; existing rows
-- stay NULL and surface only under the "Tous" tab.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

alter table public.leads
  add column if not exists order_type text;

-- Enforce the allowed values at the DB layer. Recreate idempotently so
-- a partial install (column added without constraint) gets healed.
do $$
begin
  if exists (
    select 1
    from   pg_constraint
    where  conname = 'leads_order_type_check'
      and  conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads drop constraint leads_order_type_check;
  end if;

  alter table public.leads
    add constraint leads_order_type_check
    check (order_type is null or order_type in ('vehicle', 'preorder'));
end$$;

comment on column public.leads.order_type
  is 'Catalog order discriminator: ''vehicle'' (in-stock order), ''preorder'' (pre-order), NULL (regular lead).';
