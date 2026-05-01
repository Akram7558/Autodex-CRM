-- ─────────────────────────────────────────────────────────────────────
-- Internal AutoDex roles
-- ─────────────────────────────────────────────────────────────────────
-- Adds two SaaS-team roles to user_roles:
--   - commercial         — AutoDex sales rep (sees showrooms, NOT financials)
--   - prospecteur_saas   — AutoDex prospector (own SaaS prospects only)
--
-- Internal roles never belong to a single showroom (showroom_id IS NULL),
-- enforced by a CHECK constraint. RLS policies on the tenant tables are
-- updated so commercial can SELECT across all showrooms but cannot WRITE.
-- ─────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- PART 1 — Update role check constraint + add internal_no_showroom
-- ═════════════════════════════════════════════════════════════════════

alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add  constraint user_roles_role_check
  check (role in (
    'super_admin',
    'commercial',
    'prospecteur_saas',
    'owner',
    'manager',
    'closer',
    'prospecteur'
  ));

-- Internal team members never carry a showroom binding; tenant roles
-- always do. This keeps user_showroom_id() honest for both groups.
alter table user_roles drop constraint if exists user_roles_internal_no_showroom;
alter table user_roles add  constraint user_roles_internal_no_showroom
  check (
    (role in ('super_admin', 'commercial', 'prospecteur_saas')
       and showroom_id is null)
    or
    (role in ('owner', 'manager', 'closer', 'prospecteur')
       and showroom_id is not null)
  );


-- ═════════════════════════════════════════════════════════════════════
-- PART 2 — Helper functions (SECURITY DEFINER)
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.is_commercial()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid() and role = 'commercial'
  );
$$;

create or replace function public.is_prospecteur_saas()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid() and role = 'prospecteur_saas'
  );
$$;

create or replace function public.is_internal_team()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and role in ('super_admin', 'commercial', 'prospecteur_saas')
  );
$$;

revoke all on function public.is_commercial()        from public;
revoke all on function public.is_prospecteur_saas()  from public;
revoke all on function public.is_internal_team()     from public;
grant execute on function public.is_commercial()        to authenticated;
grant execute on function public.is_prospecteur_saas()  to authenticated;
grant execute on function public.is_internal_team()     to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- PART 3 — Update RLS policies on tenant tables
-- ═════════════════════════════════════════════════════════════════════
-- Pattern per table:
--   tenant_select  — super_admin OR commercial OR own showroom
--   tenant_write   — super_admin OR own showroom (commercial cannot write)
-- We replace the previous single `tenant_all` policy with the split pair.

-- ── leads ───────────────────────────────────────────────────────────
drop policy if exists "tenant_all"    on leads;
drop policy if exists "tenant_select" on leads;
drop policy if exists "tenant_write"  on leads;
create policy "tenant_select" on leads for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on leads for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());

-- ── vehicles ────────────────────────────────────────────────────────
drop policy if exists "tenant_all"    on vehicles;
drop policy if exists "tenant_select" on vehicles;
drop policy if exists "tenant_write"  on vehicles;
create policy "tenant_select" on vehicles for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on vehicles for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());

-- ── ventes ──────────────────────────────────────────────────────────
-- NOTE: commercial CAN read ventes (RLS allows it) but the application
-- UI hides money-bearing columns. This is intentional — the financial
-- guard lives in the UI/API layer, not the RLS layer.
drop policy if exists "tenant_all"    on ventes;
drop policy if exists "tenant_select" on ventes;
drop policy if exists "tenant_write"  on ventes;
create policy "tenant_select" on ventes for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on ventes for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());

-- ── activities ──────────────────────────────────────────────────────
drop policy if exists "tenant_all"    on activities;
drop policy if exists "tenant_select" on activities;
drop policy if exists "tenant_write"  on activities;
create policy "tenant_select" on activities for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on activities for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());

-- ── notifications ───────────────────────────────────────────────────
drop policy if exists "tenant_all"    on notifications;
drop policy if exists "tenant_select" on notifications;
drop policy if exists "tenant_write"  on notifications;
create policy "tenant_select" on notifications for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on notifications for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());

-- ── lead_distribution ───────────────────────────────────────────────
drop policy if exists "tenant_all"    on lead_distribution;
drop policy if exists "tenant_select" on lead_distribution;
drop policy if exists "tenant_write"  on lead_distribution;
create policy "tenant_select" on lead_distribution for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or showroom_id = public.user_showroom_id()
  );
create policy "tenant_write" on lead_distribution for all
  to authenticated
  using      (public.is_super_admin() or showroom_id = public.user_showroom_id())
  with check (public.is_super_admin() or showroom_id = public.user_showroom_id());


-- ── showrooms ──────────────────────────────────────────────────────
-- Commercial may SELECT all showrooms; only super_admin may write.
drop policy if exists "showroom_select"        on showrooms;
drop policy if exists "showroom_admin_write"   on showrooms;
drop policy if exists "showroom_admin_update"  on showrooms;
drop policy if exists "showroom_admin_delete"  on showrooms;

create policy "showroom_select" on showrooms for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or id = public.user_showroom_id()
  );

create policy "showroom_admin_write" on showrooms for insert
  to authenticated
  with check (public.is_super_admin());

create policy "showroom_admin_update" on showrooms for update
  to authenticated
  using      (public.is_super_admin())
  with check (public.is_super_admin());

create policy "showroom_admin_delete" on showrooms for delete
  to authenticated
  using (public.is_super_admin());
