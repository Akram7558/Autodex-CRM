-- ─────────────────────────────────────────────────────────────────────
-- migration_29_ai_features.sql
-- ─────────────────────────────────────────────────────────────────────
-- Four AI-adjacent lead features built on top of migration 28:
--
--   1. Hot-lead alerts
--        leads.last_contacted_at   — set when a contact-type activity
--                                    is logged for the lead
--        leads.hot_alert_sent      — gate so the cron only emails once
--                                    per cold-period
--        Trigger on `activities` to maintain last_contacted_at
--
--   2. Best time to call
--        leads.best_call_hour      — INTEGER 0..23, the mode of the
--                                    lead's activity hours (falls back
--                                    to creation hour)
--
--   3. Score history (sparkline)
--        lead_temperature_history  — append-only timeline, max 30 rows
--                                    per lead (older rows trimmed in
--                                    the refresh function)
--
--   4. Car matching
--        suggest_vehicles_for_lead(uuid) — scores in-stock vehicles
--                                          + pre-orders by similarity
--                                          to the lead's preferences
--
-- Migration is idempotent. Replaces refresh_lead_temperatures() and
-- trg_recalc_temperature() from migration 28 so they route through a
-- single helper `_recompute_lead(uuid)` that also writes history,
-- updates best_call_hour and (the existing) cold-transition
-- notification — everything stays in lockstep.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Columns on leads ─────────────────────────────────────────────
alter table public.leads
  add column if not exists last_contacted_at timestamptz,
  add column if not exists hot_alert_sent    boolean default false,
  add column if not exists best_call_hour    integer;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'leads_best_call_hour_check'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads drop constraint leads_best_call_hour_check;
  end if;
  alter table public.leads
    add constraint leads_best_call_hour_check
    check (best_call_hour is null or (best_call_hour between 0 and 23));
end$$;

comment on column public.leads.last_contacted_at is
  'Set by trg_activities_signal whenever a contact-type activity is logged. Cleared/forwarded by the hot-alert cron.';
comment on column public.leads.hot_alert_sent is
  'True once the hot-alert cron has notified the owner about this lead. Reset to false when a fresh contact activity is logged.';
comment on column public.leads.best_call_hour is
  'Mode of the lead''s activity hours (0..23). Falls back to creation hour when no activities exist. Used by the "Meilleur moment pour appeler" UI hint.';

-- ── 2. Temperature history table ────────────────────────────────────
create table if not exists public.lead_temperature_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  score       integer not null,
  temperature text    not null,
  recorded_at timestamptz default now()
);

create index if not exists idx_temp_history_lead
  on public.lead_temperature_history(lead_id, recorded_at desc);

alter table public.lead_temperature_history enable row level security;

drop policy if exists "tenant_select_temp_history" on public.lead_temperature_history;
create policy "tenant_select_temp_history" on public.lead_temperature_history
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.leads l
       where l.id = lead_temperature_history.lead_id
         and l.showroom_id = public.user_showroom_id()
    )
  );

-- Writes happen exclusively from SECURITY DEFINER functions so no
-- insert/update/delete policy is needed; deny everything to the
-- authenticated role explicitly for safety.
drop policy if exists "deny_writes_temp_history" on public.lead_temperature_history;
create policy "deny_writes_temp_history" on public.lead_temperature_history
  for insert to authenticated with check (false);
-- (update/delete fall back to "no policy → denied" by default)

-- ── 3. Internal helper: per-lead recompute ──────────────────────────
-- Single source of truth for "recompute this lead". Both the leads
-- trigger and the activities trigger call this. It writes:
--   • temperature_score / temperature / temperature_updated_at
--   • froid_since (transitions)
--   • best_call_hour (mode of activity hours, fallback to created_at)
--   • lead_temperature_history row + trim beyond 30 entries
--   • cold-transition notification (deduped)
-- Skips overridden + closed leads.
create or replace function public._recompute_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_lead             record;
  v_calc             record;
  v_new_froid_since  timestamptz;
  v_best_hour        integer;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;
  if v_lead.manual_temperature_override is true then return; end if;
  if v_lead.suivi in ('vendu','perdu','annule') then return; end if;

  select score, temp into v_calc
    from public.calculate_lead_temperature(p_lead_id);
  if v_calc is null then return; end if;

  -- best_call_hour: most common hour of all activities for this lead,
  -- falling back to the lead creation hour. NULL only if both are
  -- somehow unset, which shouldn't happen since created_at is non-null.
  select hour_of_day into v_best_hour
    from (
      select extract(hour from a.created_at)::int as hour_of_day,
             count(*) as freq
        from public.activities a
       where a.lead_id = p_lead_id
       group by hour_of_day
       order by freq desc, hour_of_day asc
       limit 1
    ) t;

  if v_best_hour is null then
    v_best_hour := extract(hour from v_lead.created_at)::int;
  end if;

  v_new_froid_since := case
    when v_calc.temp = 'froid' and v_lead.temperature is distinct from 'froid' then now()
    when v_calc.temp <> 'froid' then null
    else v_lead.froid_since
  end;

  update public.leads
     set temperature_score      = v_calc.score,
         temperature            = v_calc.temp,
         temperature_updated_at = now(),
         froid_since            = v_new_froid_since,
         best_call_hour         = v_best_hour
   where id = p_lead_id;

  -- History append.
  insert into public.lead_temperature_history (lead_id, score, temperature)
    values (p_lead_id, v_calc.score, v_calc.temp);

  -- Trim history beyond the most recent 30 entries.
  delete from public.lead_temperature_history
   where id in (
     select id from public.lead_temperature_history
      where lead_id = p_lead_id
      order by recorded_at desc
      offset 30
   );

  -- Cold-transition notification (deduped by lead).
  if v_calc.temp = 'froid' and (v_lead.temperature is distinct from 'froid') then
    insert into public.notifications (showroom_id, type, title, message, lead_id, dedupe_key)
    select v_lead.showroom_id,
           'lead_stagnant',
           '⚠️ Lead devenu froid',
           coalesce(v_lead.full_name, 'Un lead') || ' est devenu froid. Relancez-le !',
           p_lead_id,
           'temp_cold:' || p_lead_id::text
    where not exists (
      select 1 from public.notifications
       where dedupe_key = 'temp_cold:' || p_lead_id::text
    );
  end if;
end;
$$;

-- ── 4. Refresh function — now routes through _recompute_lead ────────
create or replace function public.refresh_lead_temperatures(p_showroom_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id
      from public.leads
     where showroom_id = p_showroom_id
       and (manual_temperature_override is not true)
       and (suivi is null or suivi not in ('vendu','perdu','annule'))
  loop
    perform public._recompute_lead(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 5. Leads trigger — same hook points, routed through helper ──────
create or replace function public.trg_recalc_temperature()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Re-entry guard via _recompute_lead's own override/closed checks.
  perform public._recompute_lead(new.id);
  return new;
end;
$$;

-- Triggers already created in migration 28; idempotent recreate:
drop trigger if exists trg_leads_recalc_temp_ins on public.leads;
drop trigger if exists trg_leads_recalc_temp_upd on public.leads;
create trigger trg_leads_recalc_temp_ins
  after insert on public.leads
  for each row execute function public.trg_recalc_temperature();
create trigger trg_leads_recalc_temp_upd
  after update of suivi on public.leads
  for each row execute function public.trg_recalc_temperature();

-- ── 6. Activities trigger — last_contacted_at + auto recompute ──────
-- Treats every non-status-change activity as a "contact event":
--   call, email, meeting, note, sms, whatsapp, note_added, …
-- (the column is TEXT and we want to be tolerant of future values).
create or replace function public.trg_activities_signal()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_contact boolean;
begin
  if new.lead_id is null then return new; end if;

  v_is_contact := new.type is not null and new.type <> 'status_change';

  if v_is_contact then
    update public.leads
       set last_contacted_at = coalesce(new.created_at, now()),
           hot_alert_sent    = false
     where id = new.lead_id;
  end if;

  -- A new activity always re-scores the lead — even status_change,
  -- because activity_count is one of the temperature factors.
  perform public._recompute_lead(new.lead_id);

  return new;
end;
$$;

drop trigger if exists trg_activities_signal_ins on public.activities;
create trigger trg_activities_signal_ins
  after insert on public.activities
  for each row execute function public.trg_activities_signal();

-- ── 7. Vehicle matching ─────────────────────────────────────────────
-- Returns up to N best-matching available vehicles for a given lead,
-- scored 0..100. Reference is the lead's linked vehicle when present.
-- When the lead has no linked vehicle, we fall back to a price-only
-- match using lead.budget_dzd, or return an empty set.
--
-- Reasons array is human-readable French tags for the UI.
create or replace function public.suggest_vehicles_for_lead(
  p_lead_id uuid,
  p_limit   integer default 3
)
returns table (
  vehicle_id    uuid,
  match_score   integer,
  match_reasons text[]
)
language plpgsql
security definer
stable
as $$
declare
  v_lead   record;
  v_ref    record;
  v_budget numeric;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  if v_lead.vehicle_id is not null then
    select * into v_ref from public.vehicles where id = v_lead.vehicle_id;
  end if;
  v_budget := coalesce(v_ref.price_dzd, v_lead.budget_dzd);

  return query
  select v.id,
         (
           coalesce(case when v_ref.brand is not null and lower(v.brand)  = lower(v_ref.brand)  then 40 else 0 end, 0)
         + coalesce(case when v_ref.model is not null and lower(v.model)  = lower(v_ref.model)  then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and v.price_dzd is not null
                          and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.20
                         then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and v.price_dzd is not null
                          and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.10
                         then 10 else 0 end, 0)
         + coalesce(case when v_ref.color is not null and v.color is not null
                          and lower(v.color) = lower(v_ref.color) then 10 else 0 end, 0)
         + coalesce(case when v_ref.type_moteur is not null and v.type_moteur is not null
                          and lower(v.type_moteur) = lower(v_ref.type_moteur) then 5 else 0 end, 0)
         + coalesce(case when v_ref.year is not null and v.year is not null
                          and abs(v.year - v_ref.year) <= 1 then 5 else 0 end, 0)
         )::int as score,
         array_remove(array[
           case when v_ref.brand is not null and lower(v.brand)  = lower(v_ref.brand)  then 'Même marque' end,
           case when v_ref.model is not null and lower(v.model)  = lower(v_ref.model)  then 'Même modèle' end,
           case when v_budget is not null and v.price_dzd is not null
                 and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.10 then 'Prix très proche'
                when v_budget is not null and v.price_dzd is not null
                 and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.20 then 'Prix similaire' end,
           case when v_ref.color is not null and v.color is not null
                 and lower(v.color) = lower(v_ref.color) then 'Même couleur' end,
           case when v_ref.type_moteur is not null and v.type_moteur is not null
                 and lower(v.type_moteur) = lower(v_ref.type_moteur) then 'Même motorisation' end,
           case when v_ref.year is not null and v.year is not null
                 and abs(v.year - v_ref.year) <= 1 then 'Année proche' end
         ], null) as reasons
    from public.vehicles v
   where v.showroom_id = v_lead.showroom_id
     and v.status = 'available'
     and (v_lead.vehicle_id is null or v.id <> v_lead.vehicle_id)
   order by score desc, v.created_at desc
   limit p_limit;
end;
$$;

-- Pre-order variant (separate types / tables).
create or replace function public.suggest_preorders_for_lead(
  p_lead_id uuid,
  p_limit   integer default 2
)
returns table (
  preorder_id   uuid,
  match_score   integer,
  match_reasons text[]
)
language plpgsql
security definer
stable
as $$
declare
  v_lead   record;
  v_ref    record;
  v_budget numeric;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  if v_lead.vehicle_id is not null then
    select * into v_ref from public.vehicles where id = v_lead.vehicle_id;
  end if;
  v_budget := coalesce(v_ref.price_dzd, v_lead.budget_dzd);

  return query
  select p.id,
         (
           coalesce(case when v_ref.brand is not null and lower(p.marque) = lower(v_ref.brand) then 40 else 0 end, 0)
         + coalesce(case when v_ref.model is not null and lower(p.modele) = lower(v_ref.model) then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and p.prix_estime is not null
                          and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.20
                         then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and p.prix_estime is not null
                          and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.10
                         then 10 else 0 end, 0)
         + coalesce(case when v_ref.year is not null and p.annee is not null
                          and abs(p.annee - v_ref.year) <= 1 then 5 else 0 end, 0)
         )::int as score,
         array_remove(array[
           case when v_ref.brand is not null and lower(p.marque) = lower(v_ref.brand) then 'Même marque' end,
           case when v_ref.model is not null and lower(p.modele) = lower(v_ref.model) then 'Même modèle' end,
           case when v_budget is not null and p.prix_estime is not null
                 and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.10 then 'Prix très proche'
                when v_budget is not null and p.prix_estime is not null
                 and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.20 then 'Prix similaire' end,
           case when v_ref.year is not null and p.annee is not null
                 and abs(p.annee - v_ref.year) <= 1 then 'Année proche' end
         ], null) as reasons
    from public.preorder_vehicles p
   where p.showroom_id = v_lead.showroom_id
     and p.disponible = true
   order by score desc, p.created_at desc
   limit p_limit;
end;
$$;

-- ── 8. Grants ───────────────────────────────────────────────────────
grant execute on function public._recompute_lead(uuid)                  to authenticated;
grant execute on function public.refresh_lead_temperatures(uuid)        to authenticated;
grant execute on function public.suggest_vehicles_for_lead(uuid, int)   to authenticated;
grant execute on function public.suggest_preorders_for_lead(uuid, int)  to authenticated;
