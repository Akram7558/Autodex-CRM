-- ============================================================
-- Migration 56: notifications cleanup + temp-cold recipient backfill
-- ============================================================
-- Part of the notifications data/logic overhaul.
--
-- (a) The 4 DERIVED alerts (lead_ignored, lead_stagnant, stock_rupture,
--     vendor_inactive) are now COMPUTED on the fly by GET /api/check-alerts
--     (no rows). The old POST generator inserted a fresh row per lead per
--     hour/day with a time-bucketed dedupe_key and never cleaned up — the
--     "5439 unread" spam. This deletes those accumulated derived rows.
--
--     NOTE: the temp-cold EVENT notifications also use type='lead_stagnant'
--     but are legitimately deduped (dedupe_key 'temp_cold:<lead_id>', one per
--     lead) and must be KEPT. They are excluded from the delete via the
--     dedupe_key guard. (If you instead want a full wipe, drop that guard.)
--
-- (b) The temp-cold generators (_recompute_lead from migration 29 and the
--     trg_recalc_temperature trigger function from migration 28) inserted the
--     "lead devenu froid" notification with user_id = NULL. They now stamp
--     user_id := the lead's assigned_to so the lead's OWNER sees their own
--     cold-lead alert under the new per-user scoping. ONLY the user_id
--     assignment changed; the dedupe ('temp_cold:<lead_id>') is preserved.
--     Existing temp-cold rows are also backfilled.
--
-- Idempotent. Wrapped in a transaction.
-- ============================================================

BEGIN;

-- ── (a) One-off cleanup of the derived-rule spam ─────────────────────
-- Keep temp-cold event rows (dedupe_key 'temp_cold:%'); purge the rest.
DELETE FROM public.notifications
 WHERE type IN ('lead_ignored', 'lead_stagnant', 'stock_rupture', 'vendor_inactive')
   AND coalesce(dedupe_key, '') NOT LIKE 'temp_cold:%';

-- ── (b0) Backfill recipient on EXISTING temp-cold rows ───────────────
UPDATE public.notifications n
   SET user_id = l.assigned_to
  FROM public.leads l
 WHERE n.lead_id = l.id
   AND n.dedupe_key LIKE 'temp_cold:%'
   AND n.user_id IS NULL
   AND l.assigned_to IS NOT NULL;

-- ── (b1) _recompute_lead (migration 29) — add user_id to the insert ──
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

  insert into public.lead_temperature_history (lead_id, score, temperature)
    values (p_lead_id, v_calc.score, v_calc.temp);

  delete from public.lead_temperature_history
   where id in (
     select id from public.lead_temperature_history
      where lead_id = p_lead_id
      order by recorded_at desc
      offset 30
   );

  -- Cold-transition notification (deduped by lead).
  -- migration_56: user_id := the lead's owner (was NULL).
  if v_calc.temp = 'froid' and (v_lead.temperature is distinct from 'froid') then
    insert into public.notifications (showroom_id, user_id, type, title, message, lead_id, dedupe_key)
    select v_lead.showroom_id,
           v_lead.assigned_to,
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

-- ── (b2) trg_recalc_temperature (migration 28) — add user_id ─────────
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

  update public.leads
     set temperature_score      = v_calc.score,
         temperature            = v_calc.temp,
         temperature_updated_at = now(),
         froid_since            = v_new_froid_since
   where id = new.id;

  -- Cold-transition notification (deduped by lead).
  -- migration_56: user_id := the lead's owner (was NULL).
  if v_calc.temp = 'froid' and (v_prev_temp is distinct from 'froid') then
    insert into public.notifications (showroom_id, user_id, type, title, message, lead_id, dedupe_key)
    select new.showroom_id,
           new.assigned_to,
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

COMMIT;
