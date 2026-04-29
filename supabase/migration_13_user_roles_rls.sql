-- ─────────────────────────────────────────────────────────────────────
-- Row-Level Security for user_roles
-- ─────────────────────────────────────────────────────────────────────
-- Lets every authenticated user read their own role row, and lets
-- super_admins read all rows (so the Super Admin dashboard can list users).
-- ─────────────────────────────────────────────────────────────────────

alter table user_roles enable row level security;

drop policy if exists "user_roles read own" on user_roles;

create policy "user_roles read own"
on user_roles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_roles read all for super_admin" on user_roles;

create policy "user_roles read all for super_admin"
on user_roles for select
to authenticated
using (
  exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  )
);
