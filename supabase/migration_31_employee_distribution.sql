-- ─────────────────────────────────────────────────────────────────────
-- migration_31_employee_distribution.sql
-- ─────────────────────────────────────────────────────────────────────
-- Showroom-side team management + round-robin lead distribution.
--
--   • user_roles.created_by         — who provisioned this teammate
--                                     (managers can only delete their
--                                      own creations; owners can delete
--                                      anyone in their showroom)
--   • showroom_lead_distribution    — opt-in rotation table per
--                                      showroom; one row per active
--                                      teammate
--   • showroom_pick_next_assignee() — simplest round-robin: pick the
--                                      teammate whose last_assigned_at
--                                      is oldest (or never)
--   • trg_auto_assign_lead          — AFTER INSERT on leads: when
--                                      assigned_to IS NULL, fills it
--                                      from the rotation and bumps the
--                                      assignee's last_assigned_at
--
-- Idempotent — safe to re-run. SaaS-side distribution tables
-- (saas_rdv_distribution / saas_prospect_distribution) are NOT
-- touched.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. created_by on user_roles ─────────────────────────────────────
alter table public.user_roles
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.user_roles.created_by is
  'Auth user id of the owner/manager who provisioned this row. Used to gate manager-side employee deletion: a manager can only delete teammates they themselves created.';

-- ── 2. Distribution table ───────────────────────────────────────────
create table if not exists public.showroom_lead_distribution (
  id                uuid        primary key default gen_random_uuid(),
  showroom_id       uuid        not null references public.showrooms(id) on delete cascade,
  user_id           uuid        not null references auth.users(id)       on delete cascade,
  active            boolean     not null default true,
  last_assigned_at  timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint showroom_lead_distribution_uniq unique (showroom_id, user_id)
);

create index if not exists idx_showroom_lead_distribution_active
  on public.showroom_lead_distribution (showroom_id, active);

-- updated_at touch on UPDATE.
create or replace function public.trg_touch_showroom_lead_distribution()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_showroom_lead_distribution_touch
  on public.showroom_lead_distribution;
create trigger trg_showroom_lead_distribution_touch
  before update on public.showroom_lead_distribution
  for each row execute function public.trg_touch_showroom_lead_distribution();

-- ── 3. RLS ──────────────────────────────────────────────────────────
-- SELECT for any authenticated member of the same showroom (or
-- super_admin); writes go through service-role from the API so no
-- write policy is required — default deny stays in effect for
-- authenticated clients.
alter table public.showroom_lead_distribution enable row level security;

drop policy if exists "tenant_select_showroom_lead_distribution"
  on public.showroom_lead_distribution;
create policy "tenant_select_showroom_lead_distribution"
  on public.showroom_lead_distribution
  for select to authenticated
  using (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

-- ── 4. Pick next assignee (round-robin) ─────────────────────────────
-- Simple rule: pick whoever was assigned the longest time ago — NULL
-- last_assigned_at sorts first so brand-new teammates get the next lead.
create or replace function public.showroom_pick_next_assignee(p_showroom_id uuid)
returns uuid
language sql
security definer
stable
as $$
  select user_id
    from public.showroom_lead_distribution
   where showroom_id = p_showroom_id
     and active = true
   order by last_assigned_at asc nulls first
   limit 1
$$;

-- ── 5. Auto-assign trigger on leads ─────────────────────────────────
-- Only fires when assigned_to was left NULL by the inserter. Manual
-- assignments by the UI are respected. Falls back silently to a no-op
-- when the rotation is empty.
create or replace function public.trg_auto_assign_lead()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  if new.assigned_to is not null then return new; end if;
  if new.showroom_id is null then return new; end if;

  select public.showroom_pick_next_assignee(new.showroom_id) into v_user_id;
  if v_user_id is null then return new; end if;

  -- Stamp the lead with the assignee. Updating `assigned_to` does NOT
  -- re-fire our own AFTER INSERT trigger, so no recursion.
  update public.leads
     set assigned_to = v_user_id
   where id = new.id;

  update public.showroom_lead_distribution
     set last_assigned_at = now()
   where user_id = v_user_id
     and showroom_id = new.showroom_id;

  return new;
end;
$$;

drop trigger if exists trg_leads_auto_assign on public.leads;
create trigger trg_leads_auto_assign
  after insert on public.leads
  for each row execute function public.trg_auto_assign_lead();

-- ── 6. Grants ───────────────────────────────────────────────────────
grant execute on function public.showroom_pick_next_assignee(uuid) to authenticated;
