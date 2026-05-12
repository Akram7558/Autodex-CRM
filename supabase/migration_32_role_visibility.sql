-- ─────────────────────────────────────────────────────────────────────
-- migration_32_role_visibility.sql
-- ─────────────────────────────────────────────────────────────────────
-- Lead visibility restrictions for closer / prospecteur roles. Owner +
-- manager keep full access to every lead in their showroom; closer
-- and prospecteur can only see, update, or delete leads that are
-- assigned to them (assigned_to = auth.uid()).
--
-- Implementation:
--   • `user_app_role()` SECURITY-DEFINER helper — returns the caller's
--     AppRole or NULL when unauthenticated.
--   • Replaces the old `tenant_all` policy on `leads` with four
--     per-operation policies:
--        - tenant_select  → showroom + role-aware filter
--        - tenant_insert  → showroom match (no per-row owner check;
--                            triggers stamp assigned_to after insert)
--        - tenant_update  → same predicate as select
--        - tenant_delete  → same predicate as select
--   • super_admin and service-role still bypass everything.
--
-- Service-role writes (catalog order route, auto-assign trigger,
-- SECURITY DEFINER functions) continue to work without change.
-- Migration is idempotent.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Role helper ──────────────────────────────────────────────────
create or replace function public.user_app_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
    from public.user_roles
   where user_id = auth.uid()
   limit 1
$$;

grant execute on function public.user_app_role() to authenticated, anon;

comment on function public.user_app_role() is
  'Returns the caller''s AppRole from user_roles (super_admin / commercial / prospecteur_saas / owner / manager / closer / prospecteur), or NULL when unauthenticated. Used by RLS policies that need to branch on role.';

-- ── 2. Replace `tenant_all` on leads with per-op policies ───────────
alter table public.leads enable row level security;

drop policy if exists "tenant_all"    on public.leads;
drop policy if exists "tenant_select" on public.leads;
drop policy if exists "tenant_insert" on public.leads;
drop policy if exists "tenant_update" on public.leads;
drop policy if exists "tenant_delete" on public.leads;

-- SELECT: owner / manager / super_admin / commercial see every lead in
-- their tenancy; closer / prospecteur are scoped to their own
-- assignments.
create policy "tenant_select" on public.leads
  for select
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or assigned_to = auth.uid()
      )
    )
  );

-- INSERT: any tenant member can create a lead in their showroom.
-- (Service-role / SECURITY DEFINER inserts bypass RLS regardless.)
create policy "tenant_insert" on public.leads
  for insert
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

-- UPDATE: same predicate as SELECT — you can only edit what you can see.
-- Closer / prospecteur can update their own leads (suivi changes, etc.).
create policy "tenant_update" on public.leads
  for update
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or assigned_to = auth.uid()
      )
    )
  )
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

-- DELETE: same predicate as SELECT.
create policy "tenant_delete" on public.leads
  for delete
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or assigned_to = auth.uid()
      )
    )
  );
