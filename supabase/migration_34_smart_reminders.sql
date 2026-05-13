-- ─────────────────────────────────────────────────────────────────────
-- migration_34_smart_reminders.sql
-- ─────────────────────────────────────────────────────────────────────
-- Automatic, temperature-aware reminders for non-contacted leads, with
-- escalation to owner+manager when the assignee ignores the prompts.
--
-- Adds to `leads`:
--   • reminder_count    INT 0..3   — how many reminders fired
--   • last_reminder_at  TIMESTAMPTZ
--   • escalated         BOOL       — owner/manager already notified
--   • escalated_at      TIMESTAMPTZ
--
-- Extends `notifications.type` CHECK with two new values:
--   'reminder'   — sent to the assignee
--   'escalation' — sent to owner + managers when assignee ignored
--
-- Extends `trg_activities_signal` (introduced in migration 29) to ALSO
-- reset the reminder state when a contact-type activity is logged —
-- the lead "exits" the reminder loop the moment someone reaches out.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Columns on leads ─────────────────────────────────────────────
alter table public.leads
  add column if not exists reminder_count   integer     default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists escalated        boolean     default false,
  add column if not exists escalated_at     timestamptz;

-- Heal the reminder_count CHECK constraint idempotently.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'leads_reminder_count_check'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads drop constraint leads_reminder_count_check;
  end if;
  alter table public.leads
    add constraint leads_reminder_count_check
    check (reminder_count is null or (reminder_count between 0 and 3));
end$$;

comment on column public.leads.reminder_count is
  'Number of reminder notifications already raised for this lead. Capped at 3 — beyond that only escalation fires.';
comment on column public.leads.escalated is
  'Set true the first time the assignee ignored a reminder long enough for owner+manager to be notified. Cleared together with reminder_count on the next contact (see trg_activities_signal).';

-- ── 2. Extend notifications.type CHECK ──────────────────────────────
-- Strategy: drop whatever named constraint exists on the column, then
-- recreate a single permissive one that covers the full set of values
-- used by every cron / trigger / API path today.
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
      from pg_constraint
     where conrelid = 'public.notifications'::regclass
       and contype  = 'c'
       and (
         conname ilike '%type%' or
         pg_get_constraintdef(oid) ilike '%notifications.type%' or
         pg_get_constraintdef(oid) ilike '%type IN%' or
         pg_get_constraintdef(oid) ilike '%type =%'
       )
  loop
    execute format('alter table public.notifications drop constraint %I', c_name);
  end loop;
end$$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'lead_ignored',
    'lead_stagnant',
    'stock_rupture',
    'vendor_inactive',
    'reminder',
    'escalation'
  ));

-- ── 3. Reset reminder state when a contact event happens ────────────
-- Extends migration_29 `trg_activities_signal`. We CREATE OR REPLACE
-- the same function body but add the four reminder-reset assignments.
-- The trigger itself doesn't change — just the function it calls.
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
           hot_alert_sent    = false,
           -- migration_34 — leaving the reminder loop on contact.
           reminder_count    = 0,
           last_reminder_at  = null,
           escalated         = false,
           escalated_at      = null
     where id = new.lead_id;
  end if;

  -- A new activity always re-scores the lead — even status_change,
  -- because activity_count is one of the temperature factors.
  perform public._recompute_lead(new.lead_id);

  return new;
end;
$$;

-- The trg_activities_signal_ins trigger declared in migration 29
-- continues to point at this function; no DROP/RECREATE needed.
