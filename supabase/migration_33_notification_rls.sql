-- ─────────────────────────────────────────────────────────────────────
-- migration_33_notification_rls.sql
-- ─────────────────────────────────────────────────────────────────────
-- Scopes `notifications` visibility per role, mirroring the leads
-- visibility split introduced in migration 32.
--
-- Before: notifications had a single `tenant_all` policy keyed on
-- showroom_id, so closer / prospecteur could see every notification
-- raised in the showroom (cold leads, hot-lead alerts, stock rupture,
-- etc.) even when those notifications referenced leads they could not
-- access.
--
-- After:
--   • owner / manager / super_admin / commercial → every notification
--     in their tenancy (unchanged).
--   • closer / prospecteur → only notifications where one of:
--        - user_id matches the caller (direct addressing)
--        - lead_id references a lead they are assigned to
--        - vehicle_id-only / org-wide alerts: hidden by default for
--          restricted roles (they don't act on stock / vendor alerts).
--
-- Service-role + SECURITY DEFINER inserts (cron hot alerts, cold
-- transition notifications written by _recompute_lead) continue to
-- bypass RLS, so no INSERT path is broken.
--
-- Migration is idempotent.
-- ─────────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists "tenant_all"    on public.notifications;
drop policy if exists "tenant_select" on public.notifications;
drop policy if exists "tenant_insert" on public.notifications;
drop policy if exists "tenant_update" on public.notifications;
drop policy if exists "tenant_delete" on public.notifications;

-- SELECT — role-aware.
create policy "tenant_select" on public.notifications
  for select
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or user_id = auth.uid()
        or (
          lead_id is not null
          and exists (
            select 1 from public.leads l
             where l.id = notifications.lead_id
               and l.assigned_to = auth.uid()
          )
        )
      )
    )
  );

-- INSERT — tenant-only check, matches the prior behaviour.
create policy "tenant_insert" on public.notifications
  for insert
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

-- UPDATE — only rows you can see (used by mark-read).
create policy "tenant_update" on public.notifications
  for update
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or user_id = auth.uid()
        or (
          lead_id is not null
          and exists (
            select 1 from public.leads l
             where l.id = notifications.lead_id
               and l.assigned_to = auth.uid()
          )
        )
      )
    )
  )
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

-- DELETE — same predicate as SELECT.
create policy "tenant_delete" on public.notifications
  for delete
  using (
    public.is_super_admin()
    or (
      showroom_id = public.user_showroom_id()
      and (
        public.user_app_role() in ('owner','manager','super_admin','commercial')
        or user_id = auth.uid()
        or (
          lead_id is not null
          and exists (
            select 1 from public.leads l
             where l.id = notifications.lead_id
               and l.assigned_to = auth.uid()
          )
        )
      )
    )
  );
