-- ─────────────────────────────────────────────────────────────────────
-- SaaS prospects — replace 'perdu' with 'annule' + cancellation tracking
-- ─────────────────────────────────────────────────────────────────────
-- Renames the terminal "lost" status from `perdu` to `annule` and
-- captures a mandatory cancellation reason / optional comment / who
-- cancelled and when. The activity audit log gets the reason inlined.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Drop existing CHECK ──────────────────────────────────────────
alter table super_admin_prospects
  drop constraint if exists super_admin_prospects_suivi_check;

-- ── 2. Migrate any historical perdu rows ────────────────────────────
update super_admin_prospects
   set suivi = 'annule'
 where suivi = 'perdu';

-- ── 3. Recreate CHECK with the new enum ─────────────────────────────
alter table super_admin_prospects
  add constraint super_admin_prospects_suivi_check
  check (suivi in (
    'nouveau','tentative_1','tentative_2','tentative_3',
    'reporter','rdv_planifie','annule'
  ));

-- ── 4. Cancellation tracking columns ────────────────────────────────
alter table super_admin_prospects
  add column if not exists cancellation_reason  text,
  add column if not exists cancellation_comment text,
  add column if not exists cancelled_at         timestamptz,
  add column if not exists cancelled_by         uuid references auth.users(id) on delete set null;

create index if not exists idx_sap_cancelled_at on super_admin_prospects(cancelled_at);

-- ── 5. Suivi-change activity now inlines the cancellation reason ────
create or replace function public.sap_log_suivi_change()
returns trigger language plpgsql security definer as $$
begin
  if new.suivi is distinct from old.suivi then
    insert into super_admin_activities (prospect_id, type, description, metadata, user_id)
    values (
      new.id,
      'suivi_changed',
      case
        when new.suivi = 'annule' then
          'Suivi : ' || coalesce(old.suivi, '∅') || ' → annule (Raison : '
            || coalesce(new.cancellation_reason, 'non précisée') || ')'
        else
          'Suivi : ' || coalesce(old.suivi, '∅') || ' → ' || coalesce(new.suivi, '∅')
      end,
      jsonb_build_object(
        'old_suivi',           old.suivi,
        'new_suivi',           new.suivi,
        'cancellation_reason', new.cancellation_reason,
        'cancellation_comment', new.cancellation_comment
      ),
      auth.uid()
    );
  end if;
  return new;
end$$;

-- Existing trigger from migration 16 already wires this function up;
-- recreate it defensively in case the function signature was redefined.
drop trigger if exists tr_sap_log_suivi on super_admin_prospects;
create trigger tr_sap_log_suivi
  after update of suivi on super_admin_prospects
  for each row execute function public.sap_log_suivi_change();

-- ── 6. Auto-stamp cancelled_at / cancelled_by on transition ─────────
create or replace function public.sap_stamp_cancellation()
returns trigger language plpgsql security definer as $$
begin
  if new.suivi = 'annule' and old.suivi is distinct from 'annule' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  elsif new.suivi <> 'annule' and old.suivi = 'annule' then
    -- Reverting away from "annule" wipes the cancellation context so
    -- the row goes back to a clean state.
    new.cancelled_at         := null;
    new.cancelled_by         := null;
    new.cancellation_reason  := null;
    new.cancellation_comment := null;
  end if;
  return new;
end$$;

drop trigger if exists sap_stamp_cancellation_trigger on super_admin_prospects;
create trigger sap_stamp_cancellation_trigger
  before update of suivi on super_admin_prospects
  for each row execute function public.sap_stamp_cancellation();
