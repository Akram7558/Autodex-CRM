-- ─────────────────────────────────────────────────────────────────────
-- SaaS subscription plans
-- ─────────────────────────────────────────────────────────────────────
-- Defines the catalogue of plans the AutoDex internal team offers when
-- converting a trial showroom to a paid subscription. The plan stamps
-- a price + duration on `showrooms.plan_id` at conversion time. Plans
-- are soft-deleted (active=false) — never hard-deleted, since older
-- showrooms may still reference them.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists saas_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  duration_months integer not null check (duration_months > 0),
  price           numeric(12,2) not null check (price >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Used by the GET endpoint and the conversion modal — surface only
-- active plans, ordered by length.
create index if not exists idx_saas_plans_active_duration
  on saas_plans(active, duration_months);


-- ── Seed default plans (idempotent — re-runs are no-ops) ────────────
-- Use a unique-on-name guard so re-running the migration won't create
-- duplicates. We add the index FIRST, then upsert via on conflict.
create unique index if not exists uq_saas_plans_name on saas_plans(name);

insert into saas_plans (name, duration_months, price, active) values
  ('Pack 3 mois',  3,  15000.00, true),
  ('Pack 6 mois',  6,  25000.00, true),
  ('Pack 1 an',    12, 45000.00, true)
on conflict (name) do nothing;


-- ── Touch updated_at trigger ────────────────────────────────────────
create or replace function public.saas_plans_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists saas_plans_touch_updated_at_trigger on saas_plans;
create trigger saas_plans_touch_updated_at_trigger
  before update on saas_plans
  for each row execute function public.saas_plans_touch_updated_at();


-- ── RLS ─────────────────────────────────────────────────────────────
alter table saas_plans enable row level security;

drop policy if exists "saas_plans_select" on saas_plans;
drop policy if exists "saas_plans_insert" on saas_plans;
drop policy if exists "saas_plans_update" on saas_plans;
drop policy if exists "saas_plans_delete" on saas_plans;

-- All authenticated users may read plans (public catalogue — owners
-- need to see what they're paying for, commercials need it for the
-- conversion modal).
create policy "saas_plans_select" on saas_plans for select
  to authenticated
  using (true);

-- Only super_admin writes.
create policy "saas_plans_insert" on saas_plans for insert
  to authenticated
  with check (public.is_super_admin());

create policy "saas_plans_update" on saas_plans for update
  to authenticated
  using      (public.is_super_admin())
  with check (public.is_super_admin());

create policy "saas_plans_delete" on saas_plans for delete
  to authenticated
  using (public.is_super_admin());


-- ── Showrooms.plan_id ───────────────────────────────────────────────
alter table showrooms
  add column if not exists plan_id uuid
    references saas_plans(id) on delete set null;

create index if not exists idx_showrooms_plan_id on showrooms(plan_id);
