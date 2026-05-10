-- ─────────────────────────────────────────────────────────────────────
-- Public catalog scaffolding
-- ─────────────────────────────────────────────────────────────────────
-- Adds public-facing fields on `showrooms` (slug, contact info,
-- opening hours, catalog toggle), creates the `preorder_vehicles`
-- table, flags individual `vehicles` rows as public/hidden, and
-- back-fills slugs for any existing showroom rows.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- PART 1 — Showrooms public info
-- ═════════════════════════════════════════════════════════════════════

alter table showrooms
  add column if not exists slug             text,
  add column if not exists phone            text,
  add column if not exists whatsapp         text,
  add column if not exists address          text,
  add column if not exists google_maps_url  text,
  add column if not exists logo_url         text,
  add column if not exists opening_hours    jsonb,
  add column if not exists catalog_enabled  boolean not null default false;

-- Partial unique index — `slug` may be null while we backfill.
create unique index if not exists idx_showrooms_slug
  on showrooms(slug)
  where slug is not null;


-- ═════════════════════════════════════════════════════════════════════
-- PART 2 — Auto-generate slugs for existing rows
-- ═════════════════════════════════════════════════════════════════════
-- Strategy: build a base slug from the showroom name, then dedupe by
-- appending `-2`, `-3`, … until it's unique. The DO block runs only
-- against rows where slug IS NULL so re-running this migration is a
-- no-op once every showroom has a slug.

do $$
declare
  r        record;
  base     text;
  candidate text;
  n        int;
begin
  for r in
    select id, name from showrooms where slug is null
  loop
    base := lower(regexp_replace(coalesce(r.name, ''), '[^a-zA-Z0-9]+', '-', 'g'));
    -- Trim leading/trailing dashes; fall back if empty.
    base := trim(both '-' from base);
    if base is null or base = '' then
      base := 'showroom';
    end if;

    candidate := base;
    n := 1;
    while exists (select 1 from showrooms where slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n::text;
    end loop;

    update showrooms set slug = candidate where id = r.id;
  end loop;
end$$;


-- ── BEFORE INSERT trigger so brand-new showrooms get a slug ─────────
-- Makes the API surface oblivious to slug generation: anyone can do
-- `insert into showrooms (name, ...)` and the row comes back with a
-- unique slug populated.
create or replace function public.showrooms_assign_slug()
returns trigger language plpgsql as $$
declare
  base      text;
  candidate text;
  n         int;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := lower(regexp_replace(coalesce(new.name, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base is null or base = '' then
    base := 'showroom';
  end if;

  candidate := base;
  n := 1;
  while exists (select 1 from showrooms where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n::text;
  end loop;

  new.slug := candidate;
  return new;
end$$;

drop trigger if exists showrooms_assign_slug_trigger on showrooms;
create trigger showrooms_assign_slug_trigger
  before insert on showrooms
  for each row execute function public.showrooms_assign_slug();


-- ═════════════════════════════════════════════════════════════════════
-- PART 3 — preorder_vehicles
-- ═════════════════════════════════════════════════════════════════════

create table if not exists preorder_vehicles (
  id              uuid primary key default gen_random_uuid(),
  showroom_id     uuid not null references showrooms(id) on delete cascade,
  marque          text not null,
  modele          text not null,
  annee           integer,
  prix_estime     numeric(12,2),
  description     text,
  image_url       text,
  delai_livraison text,
  disponible      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_preorder_vehicles_showroom on preorder_vehicles(showroom_id);
create index if not exists idx_preorder_vehicles_disponible on preorder_vehicles(disponible);


-- ── updated_at trigger ──────────────────────────────────────────────
create or replace function public.preorder_vehicles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists preorder_vehicles_touch_updated_at_trigger on preorder_vehicles;
create trigger preorder_vehicles_touch_updated_at_trigger
  before update on preorder_vehicles
  for each row execute function public.preorder_vehicles_touch_updated_at();


-- ── RLS ─────────────────────────────────────────────────────────────
-- Public SELECT for available rows so anonymous catalog visitors can
-- read them without authentication. Tenant-scoped writes via the
-- usual user_showroom_id() helper plus a super_admin bypass.
alter table preorder_vehicles enable row level security;

drop policy if exists "preorder_public_read"  on preorder_vehicles;
drop policy if exists "preorder_tenant_read"  on preorder_vehicles;
drop policy if exists "preorder_tenant_write" on preorder_vehicles;
drop policy if exists "preorder_tenant_update" on preorder_vehicles;
drop policy if exists "preorder_tenant_delete" on preorder_vehicles;
drop policy if exists "preorder_tenant_insert" on preorder_vehicles;

-- Anyone (anon role included) can read available preorders.
create policy "preorder_public_read" on preorder_vehicles
  for select
  using (disponible = true);

-- Authenticated tenants can read every row in their own showroom
-- (including disponible=false), and super_admin sees everything.
create policy "preorder_tenant_read" on preorder_vehicles
  for select
  to authenticated
  using (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

create policy "preorder_tenant_insert" on preorder_vehicles
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

create policy "preorder_tenant_update" on preorder_vehicles
  for update
  to authenticated
  using (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  )
  with check (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );

create policy "preorder_tenant_delete" on preorder_vehicles
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or showroom_id = public.user_showroom_id()
  );


-- ═════════════════════════════════════════════════════════════════════
-- PART 4 — vehicles.is_public
-- ═════════════════════════════════════════════════════════════════════
-- Lets owners hide individual vehicles from the public catalog without
-- changing their internal status.
alter table vehicles
  add column if not exists is_public boolean not null default true;

create index if not exists idx_vehicles_is_public on vehicles(is_public);
