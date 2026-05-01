-- ─────────────────────────────────────────────────────────────────────
-- AutoDex SaaS pipeline — Prospects + RDV + Activities
-- ─────────────────────────────────────────────────────────────────────
-- Separate from the showroom-tenant data: this pipeline tracks
-- showrooms that the AutoDex internal team is trying to sign up as
-- paying tenants. Three tables:
--
--   super_admin_prospects   — leads (potential showroom clients)
--   super_admin_rdv         — sales meetings with those prospects
--   super_admin_activities  — audit trail (suivi changes, RDVs, notes)
--
-- RLS:
--   super_admin / commercial   → full access
--   prospecteur_saas           → own prospects only (assigned_to OR
--                                created_by = auth.uid()), NO RDV access
--   anyone else                → nothing
-- ─────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════
-- PART 1 — TABLES
-- ═════════════════════════════════════════════════════════════════════

create table if not exists super_admin_prospects (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text not null,
  city            text,
  showroom_name   text not null,
  showroom_size   text check (showroom_size in ('petit','moyen','grand')),
  email           text,
  notes           text,
  suivi           text not null default 'nouveau'
                    check (suivi in ('nouveau','tentative_1','tentative_2','tentative_3',
                                     'reporter','rdv_planifie','perdu')),
  source          text not null default 'manuel'
                    check (source in ('facebook_ads','tiktok_ads','landing_page',
                                      'manuel','reference','autre')),
  assigned_to     uuid references auth.users(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_sap_assigned_to  on super_admin_prospects(assigned_to);
create index if not exists idx_sap_suivi        on super_admin_prospects(suivi);
create index if not exists idx_sap_source       on super_admin_prospects(source);
create index if not exists idx_sap_created_at   on super_admin_prospects(created_at desc);


create table if not exists super_admin_rdv (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references super_admin_prospects(id) on delete cascade,
  scheduled_at  timestamptz not null,
  status        text not null default 'planifie'
                  check (status in ('planifie','converti','essai_gratuit','reporter','annule')),
  notes         text,
  assigned_to   uuid references auth.users(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sar_prospect      on super_admin_rdv(prospect_id);
create index if not exists idx_sar_status        on super_admin_rdv(status);
create index if not exists idx_sar_scheduled_at  on super_admin_rdv(scheduled_at);
create index if not exists idx_sar_assigned_to   on super_admin_rdv(assigned_to);


create table if not exists super_admin_activities (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid references super_admin_prospects(id) on delete cascade,
  rdv_id       uuid references super_admin_rdv(id)        on delete cascade,
  type         text not null,
  description  text not null,
  metadata     jsonb,
  user_id      uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_saa_prospect    on super_admin_activities(prospect_id);
create index if not exists idx_saa_rdv         on super_admin_activities(rdv_id);
create index if not exists idx_saa_created_at  on super_admin_activities(created_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- PART 2 — TRIGGERS
-- ═════════════════════════════════════════════════════════════════════

-- ── Stamp created_by / default assigned_to on insert ─────────────────
create or replace function public.sap_stamp_creator()
returns trigger language plpgsql as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.assigned_to is null then
    new.assigned_to := new.created_by;
  end if;
  return new;
end$$;

drop trigger if exists tr_sap_stamp_creator on super_admin_prospects;
create trigger tr_sap_stamp_creator
  before insert on super_admin_prospects
  for each row execute function public.sap_stamp_creator();

drop trigger if exists tr_sar_stamp_creator on super_admin_rdv;
create trigger tr_sar_stamp_creator
  before insert on super_admin_rdv
  for each row execute function public.sap_stamp_creator();

-- ── Touch updated_at ────────────────────────────────────────────────
create or replace function public.sap_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists tr_sap_touch_updated_at on super_admin_prospects;
create trigger tr_sap_touch_updated_at
  before update on super_admin_prospects
  for each row execute function public.sap_touch_updated_at();

drop trigger if exists tr_sar_touch_updated_at on super_admin_rdv;
create trigger tr_sar_touch_updated_at
  before update on super_admin_rdv
  for each row execute function public.sap_touch_updated_at();

-- super_admin_activities is append-only; updated_at would be misleading.

-- ── Activity audit: prospect created ────────────────────────────────
create or replace function public.sap_log_prospect_created()
returns trigger language plpgsql as $$
begin
  insert into super_admin_activities (prospect_id, type, description, user_id)
  values (new.id, 'created', 'Prospect créé', new.created_by);
  return new;
end$$;

drop trigger if exists tr_sap_log_created on super_admin_prospects;
create trigger tr_sap_log_created
  after insert on super_admin_prospects
  for each row execute function public.sap_log_prospect_created();

-- ── Activity audit: suivi changed ───────────────────────────────────
create or replace function public.sap_log_suivi_change()
returns trigger language plpgsql as $$
begin
  if new.suivi is distinct from old.suivi then
    insert into super_admin_activities (prospect_id, type, description, user_id, metadata)
    values (
      new.id,
      'suivi_changed',
      coalesce(old.suivi, '∅') || ' → ' || coalesce(new.suivi, '∅'),
      auth.uid(),
      jsonb_build_object('from', old.suivi, 'to', new.suivi)
    );
  end if;
  return new;
end$$;

drop trigger if exists tr_sap_log_suivi on super_admin_prospects;
create trigger tr_sap_log_suivi
  after update of suivi on super_admin_prospects
  for each row execute function public.sap_log_suivi_change();

-- ── Activity audit: assignment changed ──────────────────────────────
create or replace function public.sap_log_assignment_change()
returns trigger language plpgsql as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    insert into super_admin_activities (prospect_id, type, description, user_id, metadata)
    values (
      new.id,
      'assigned',
      'Réassigné',
      auth.uid(),
      jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to)
    );
  end if;
  return new;
end$$;

drop trigger if exists tr_sap_log_assignment on super_admin_prospects;
create trigger tr_sap_log_assignment
  after update of assigned_to on super_admin_prospects
  for each row execute function public.sap_log_assignment_change();

-- ── Activity audit: RDV created ─────────────────────────────────────
create or replace function public.sar_log_rdv_created()
returns trigger language plpgsql as $$
begin
  insert into super_admin_activities (prospect_id, rdv_id, type, description, user_id, metadata)
  values (
    new.prospect_id,
    new.id,
    'rdv_created',
    'RDV planifié pour ' || to_char(new.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI'),
    new.created_by,
    jsonb_build_object('scheduled_at', new.scheduled_at)
  );
  return new;
end$$;

drop trigger if exists tr_sar_log_created on super_admin_rdv;
create trigger tr_sar_log_created
  after insert on super_admin_rdv
  for each row execute function public.sar_log_rdv_created();

-- ── Activity audit: RDV status changed ──────────────────────────────
create or replace function public.sar_log_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into super_admin_activities (prospect_id, rdv_id, type, description, user_id, metadata)
    values (
      new.prospect_id,
      new.id,
      'rdv_status_changed',
      'RDV : ' || coalesce(old.status, '∅') || ' → ' || coalesce(new.status, '∅'),
      auth.uid(),
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end$$;

drop trigger if exists tr_sar_log_status on super_admin_rdv;
create trigger tr_sar_log_status
  after update of status on super_admin_rdv
  for each row execute function public.sar_log_status_change();


-- ═════════════════════════════════════════════════════════════════════
-- PART 3 — RLS POLICIES
-- ═════════════════════════════════════════════════════════════════════

-- Helper: caller's role (relies on existing is_super_admin / is_commercial /
-- is_prospecteur_saas from migration 13 + 15).

alter table super_admin_prospects  enable row level security;
alter table super_admin_rdv        enable row level security;
alter table super_admin_activities enable row level security;

-- ── super_admin_prospects ───────────────────────────────────────────
drop policy if exists "prospects_select" on super_admin_prospects;
drop policy if exists "prospects_insert" on super_admin_prospects;
drop policy if exists "prospects_update" on super_admin_prospects;
drop policy if exists "prospects_delete" on super_admin_prospects;

create policy "prospects_select" on super_admin_prospects for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or (
      public.is_prospecteur_saas()
      and (assigned_to = auth.uid() or created_by = auth.uid())
    )
  );

create policy "prospects_insert" on super_admin_prospects for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.is_commercial()
    or public.is_prospecteur_saas()
  );

create policy "prospects_update" on super_admin_prospects for update
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or (
      public.is_prospecteur_saas()
      and (assigned_to = auth.uid() or created_by = auth.uid())
    )
  )
  with check (
    public.is_super_admin()
    or public.is_commercial()
    or (
      public.is_prospecteur_saas()
      and (assigned_to = auth.uid() or created_by = auth.uid())
    )
  );

create policy "prospects_delete" on super_admin_prospects for delete
  to authenticated
  using (public.is_super_admin());

-- ── super_admin_rdv ─────────────────────────────────────────────────
drop policy if exists "rdv_select" on super_admin_rdv;
drop policy if exists "rdv_insert" on super_admin_rdv;
drop policy if exists "rdv_update" on super_admin_rdv;
drop policy if exists "rdv_delete" on super_admin_rdv;

create policy "rdv_select" on super_admin_rdv for select
  to authenticated
  using (public.is_super_admin() or public.is_commercial());

create policy "rdv_insert" on super_admin_rdv for insert
  to authenticated
  with check (public.is_super_admin() or public.is_commercial());

create policy "rdv_update" on super_admin_rdv for update
  to authenticated
  using      (public.is_super_admin() or public.is_commercial())
  with check (public.is_super_admin() or public.is_commercial());

create policy "rdv_delete" on super_admin_rdv for delete
  to authenticated
  using (public.is_super_admin());

-- ── super_admin_activities ──────────────────────────────────────────
drop policy if exists "activities_select" on super_admin_activities;
drop policy if exists "activities_insert" on super_admin_activities;
drop policy if exists "activities_update" on super_admin_activities;
drop policy if exists "activities_delete" on super_admin_activities;

-- SELECT: same scope as the parent prospect.
create policy "activities_select" on super_admin_activities for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_commercial()
    or (
      public.is_prospecteur_saas()
      and exists (
        select 1 from super_admin_prospects p
         where p.id = super_admin_activities.prospect_id
           and (p.assigned_to = auth.uid() or p.created_by = auth.uid())
      )
    )
  );

-- INSERT: any internal role on rows they can see. We trust the
-- triggers to insert on behalf of users; manual inserts must come from
-- an internal team member.
create policy "activities_insert" on super_admin_activities for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.is_commercial()
    or public.is_prospecteur_saas()
  );

create policy "activities_update" on super_admin_activities for update
  to authenticated
  using      (public.is_super_admin())
  with check (public.is_super_admin());

create policy "activities_delete" on super_admin_activities for delete
  to authenticated
  using (public.is_super_admin());
