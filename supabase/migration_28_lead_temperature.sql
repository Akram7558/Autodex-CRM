-- ─────────────────────────────────────────────────────────────────────
-- migration_28_lead_temperature.sql
-- ─────────────────────────────────────────────────────────────────────
-- Automatic lead temperature scoring (Chaud / Tiède / Froid).
--
-- Adds to `leads`:
--   • temperature_score          INT  0..100   — numeric heat
--   • temperature                TEXT chaud|tiede|froid — bucketed label
--   • temperature_updated_at     TIMESTAMPTZ  — last recomputation time
--   • manual_temperature_override BOOL        — when true, auto recalc
--                                                is skipped (owner override)
--   • froid_since                TIMESTAMPTZ  — set when the lead first
--                                                transitions to froid
--                                                (Phase 2 AI retargeting)
--
-- Adds:
--   • calculate_lead_temperature(lead_id)    — scoring function
--   • refresh_lead_temperatures(showroom_id) — batch refresh
--   • trg_recalc_temperature() / triggers     — auto recalc on insert /
--                                                suivi change
--   • Cold-transition notification (notifications.type='lead_stagnant')
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Columns + index ──────────────────────────────────────────────
alter table public.leads
  add column if not exists temperature_score          integer        default 50,
  add column if not exists temperature                text           default 'tiede',
  add column if not exists temperature_updated_at     timestamptz    default now(),
  add column if not exists manual_temperature_override boolean       default false,
  add column if not exists froid_since                timestamptz;

-- Healing CHECK constraints (drop + recreate so partial installs catch up).
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'leads_temperature_score_check'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads drop constraint leads_temperature_score_check;
  end if;
  alter table public.leads
    add constraint leads_temperature_score_check
    check (temperature_score is null or (temperature_score between 0 and 100));

  if exists (
    select 1 from pg_constraint
     where conname = 'leads_temperature_check'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads drop constraint leads_temperature_check;
  end if;
  alter table public.leads
    add constraint leads_temperature_check
    check (temperature is null or temperature in ('chaud','tiede','froid'));
end$$;

create index if not exists idx_leads_temperature
  on public.leads (temperature, showroom_id);

comment on column public.leads.temperature_score
  is 'Auto-computed lead heat 0..100. Recalculated by trg_recalc_temperature and refresh_lead_temperatures.';
comment on column public.leads.temperature
  is 'Bucket: chaud (≥70), tiede (40–69), froid (<40). Mirrors temperature_score.';
comment on column public.leads.manual_temperature_override
  is 'When true, automatic recalculation is skipped — owner has manually set the bucket.';
comment on column public.leads.froid_since
  is 'Set when the lead first transitions to froid. Cleared when it leaves froid. Phase 2 AI retargeting uses this marker.';

-- ── 2. Scoring function ─────────────────────────────────────────────
-- Returns (score, temp). Reads the lead row + activities count and
-- timestamps to compute a fresh value. Stateless — does not modify any
-- row, only returns the computed values.
create or replace function public.calculate_lead_temperature(p_lead_id uuid)
returns table(score integer, temp text)
language plpgsql
security definer
as $$
declare
  v_lead           record;
  v_last_activity  timestamptz;
  v_days_since     integer;
  v_activity_count integer;
  v_score          integer := 50;
  v_temp           text;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  -- Most recent activity, or fall back to lead creation date.
  select max(created_at) into v_last_activity
    from public.activities
   where lead_id = p_lead_id;

  if v_last_activity is not null then
    v_days_since := floor(extract(epoch from (now() - v_last_activity)) / 86400)::int;
  else
    v_days_since := floor(extract(epoch from (now() - v_lead.created_at)) / 86400)::int;
  end if;

  -- FACTOR 1 — time since last activity (biggest weight)
  if v_days_since <= 1 then       v_score := v_score + 25;
  elsif v_days_since <= 3 then    v_score := v_score + 15;
  elsif v_days_since <= 7 then    v_score := v_score + 5;
  elsif v_days_since <= 14 then   v_score := v_score - 10;
  elsif v_days_since <= 30 then   v_score := v_score - 25;
  else                            v_score := v_score - 40;
  end if;

  -- FACTOR 2 — suivi status. Tolerant of both the TypeScript enum and any
  -- legacy / spec-only values ('reserve', 'annule') so the function is
  -- safe to keep across schema evolutions.
  if v_lead.suivi in ('reserve', 'rdv_planifie') then v_score := v_score + 20;
  elsif v_lead.suivi = 'tentative_1' then             v_score := v_score + 0;
  elsif v_lead.suivi = 'tentative_2' then             v_score := v_score - 5;
  elsif v_lead.suivi = 'tentative_3' then             v_score := v_score - 15;
  elsif v_lead.suivi = 'reporter' then                v_score := v_score - 10;
  elsif v_lead.suivi = 'nouveau' then                 v_score := v_score + 5;
  end if;

  -- FACTOR 3 — vehicle linked
  if v_lead.vehicle_id is not null then v_score := v_score + 10; end if;

  -- FACTOR 4 — source quality. Tolerant of multiple casings/spellings.
  if v_lead.source in ('facebook','instagram') then          v_score := v_score + 5;
  elsif v_lead.source in ('website','catalogue_public') then v_score := v_score + 10;
  elsif v_lead.source in ('walk-in','walk_in') then          v_score := v_score + 15;
  elsif v_lead.source in ('referral','reference') then       v_score := v_score + 10;
  end if;

  -- FACTOR 5 — activity count (engagement)
  select count(*) into v_activity_count from public.activities where lead_id = p_lead_id;
  if v_activity_count >= 5 then    v_score := v_score + 10;
  elsif v_activity_count >= 3 then v_score := v_score + 5;
  elsif v_activity_count = 0 then  v_score := v_score - 10;
  end if;

  -- FACTOR 6 — deposit paid (depot_amount > 0)
  if v_lead.depot_amount is not null and v_lead.depot_amount > 0 then
    v_score := v_score + 15;
  end if;

  -- CLAMP
  v_score := greatest(0, least(100, v_score));

  if v_score >= 70 then     v_temp := 'chaud';
  elsif v_score >= 40 then  v_temp := 'tiede';
  else                      v_temp := 'froid';
  end if;

  score := v_score;
  temp  := v_temp;
  return next;
end;
$$;

-- ── 3. Batch refresh ────────────────────────────────────────────────
-- Recomputes every non-closed, non-overridden lead for a showroom in
-- one call. Returns the number of rows updated.
create or replace function public.refresh_lead_temperatures(p_showroom_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
  r       record;
  v_calc  record;
  v_new_froid_since timestamptz;
begin
  for r in
    select id, temperature, froid_since, showroom_id, full_name
      from public.leads
     where showroom_id = p_showroom_id
       and (manual_temperature_override is not true)
       and (suivi is null or suivi not in ('vendu','perdu','annule'))
  loop
    select score, temp into v_calc from public.calculate_lead_temperature(r.id);
    if v_calc is null then continue; end if;

    v_new_froid_since := case
      when v_calc.temp = 'froid' and r.temperature is distinct from 'froid' then now()
      when v_calc.temp <> 'froid' then null
      else r.froid_since
    end;

    update public.leads
       set temperature_score      = v_calc.score,
           temperature            = v_calc.temp,
           temperature_updated_at = now(),
           froid_since            = v_new_froid_since
     where id = r.id;

    -- Cold transition notification (one per lead, deduped by key).
    if v_calc.temp = 'froid' and (r.temperature is distinct from 'froid') then
      insert into public.notifications (showroom_id, type, title, message, lead_id, dedupe_key)
      select r.showroom_id,
             'lead_stagnant',
             '⚠️ Lead devenu froid',
             coalesce(r.full_name, 'Un lead') || ' est devenu froid. Relancez-le !',
             r.id,
             'temp_cold:' || r.id::text
      where not exists (
        select 1 from public.notifications
         where dedupe_key = 'temp_cold:' || r.id::text
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── 4. Trigger — auto recalc on insert / suivi change ───────────────
create or replace function public.trg_recalc_temperature()
returns trigger
language plpgsql
security definer
as $$
declare
  v_calc            record;
  v_prev_temp       text;
  v_new_froid_since timestamptz;
begin
  if new.manual_temperature_override is true then return new; end if;
  if new.suivi in ('vendu','perdu','annule') then return new; end if;

  -- Previous temperature: OLD on UPDATE, the column's pre-UPDATE value
  -- (which equals NEW.temperature since we're updating OF suivi, not
  -- temperature) on INSERT we have no OLD, treat as NULL.
  if tg_op = 'UPDATE' then
    v_prev_temp := old.temperature;
  else
    v_prev_temp := null;
  end if;

  select score, temp into v_calc from public.calculate_lead_temperature(new.id);
  if v_calc is null then return new; end if;

  v_new_froid_since := case
    when v_calc.temp = 'froid' and v_prev_temp is distinct from 'froid' then now()
    when v_calc.temp <> 'froid' then null
    else new.froid_since
  end;

  -- Note: this UPDATE does not modify `suivi`, so the AFTER UPDATE OF
  -- suivi trigger does not re-fire (no recursion).
  update public.leads
     set temperature_score      = v_calc.score,
         temperature            = v_calc.temp,
         temperature_updated_at = now(),
         froid_since            = v_new_froid_since
   where id = new.id;

  if v_calc.temp = 'froid' and (v_prev_temp is distinct from 'froid') then
    insert into public.notifications (showroom_id, type, title, message, lead_id, dedupe_key)
    select new.showroom_id,
           'lead_stagnant',
           '⚠️ Lead devenu froid',
           coalesce(new.full_name, 'Un lead') || ' est devenu froid. Relancez-le !',
           new.id,
           'temp_cold:' || new.id::text
    where not exists (
      select 1 from public.notifications
       where dedupe_key = 'temp_cold:' || new.id::text
    );
  end if;

  return new;
end;
$$;

-- Drop + recreate the triggers so reruns pick up any function changes.
drop trigger if exists trg_leads_recalc_temp_ins on public.leads;
drop trigger if exists trg_leads_recalc_temp_upd on public.leads;

create trigger trg_leads_recalc_temp_ins
  after insert on public.leads
  for each row execute function public.trg_recalc_temperature();

create trigger trg_leads_recalc_temp_upd
  after update of suivi on public.leads
  for each row execute function public.trg_recalc_temperature();

-- ── 5. RLS pass-through for the RPCs ────────────────────────────────
-- SECURITY DEFINER on the functions means they can read/write regardless
-- of caller RLS, but the API layer still validates the caller is owner /
-- manager of the target showroom before calling them.
grant execute on function public.calculate_lead_temperature(uuid)         to authenticated, anon;
grant execute on function public.refresh_lead_temperatures(uuid)          to authenticated;
