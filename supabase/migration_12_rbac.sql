-- ─────────────────────────────────────────────────────────────────────
-- Multi-tenant RBAC foundation for AutoDex SaaS
-- ─────────────────────────────────────────────────────────────────────
-- Adds: showrooms, user_roles, lead_distribution tables.
-- Adds: showroom_id + assigned_to columns to leads (idempotent).
-- ─────────────────────────────────────────────────────────────────────

-- Showrooms (tenants). Each showroom has its own data + module flags.
create table if not exists showrooms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_email     text,
  module_vente    boolean not null default true,
  module_location boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_showrooms_owner_email on showrooms(owner_email);
create index if not exists idx_showrooms_active      on showrooms(active);

-- User → showroom role binding. A user can only belong to one showroom
-- with one role at a time (enforced by a partial unique index below).
create table if not exists user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  showroom_id uuid references showrooms(id) on delete cascade,
  role        text not null check (
    role in ('super_admin', 'owner', 'manager', 'closer', 'prospecteur')
  ),
  created_at  timestamptz not null default now()
);

-- One active role per user (super_admin is global, showroom_id is null).
create unique index if not exists uq_user_roles_user on user_roles(user_id);
create index if not exists idx_user_roles_showroom    on user_roles(showroom_id);
create index if not exists idx_user_roles_role        on user_roles(role);

-- Lead distribution percentages per (showroom, user). Used by the
-- auto-assignment engine when new leads arrive.
create table if not exists lead_distribution (
  id              uuid primary key default gen_random_uuid(),
  showroom_id     uuid not null references showrooms(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  percentage      integer not null default 0 check (percentage between 0 and 100),
  leads_received  integer not null default 0,
  created_at      timestamptz not null default now()
);

create unique index if not exists uq_lead_distribution_user
  on lead_distribution(showroom_id, user_id);
create index if not exists idx_lead_distribution_showroom
  on lead_distribution(showroom_id);

-- ── Extend leads with tenant + ownership ─────────────────────────────
-- showroom_id may already exist from earlier migrations; assigned_to is
-- the closer/prospecteur the lead is currently routed to.
alter table leads add column if not exists showroom_id uuid references showrooms(id);
alter table leads add column if not exists assigned_to uuid references auth.users(id);

create index if not exists idx_leads_showroom    on leads(showroom_id);
create index if not exists idx_leads_assigned_to on leads(assigned_to);
