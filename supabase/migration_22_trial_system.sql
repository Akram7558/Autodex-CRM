-- ─────────────────────────────────────────────────────────────────────
-- Trial / subscription tracking on showrooms
-- ─────────────────────────────────────────────────────────────────────
-- Adds trial-related columns to showrooms:
--   is_trial                — true while the showroom is in its 20-day
--                              free trial. Flips to false on conversion.
--   trial_ends_at           — when the trial expires. After conversion
--                              the same column stores the paid-subscription
--                              end date (kept as a single "active until").
--   trial_converted_at      — timestamp of conversion (NULL while trial).
--   trial_contract_amount   — DZD amount of the signed contract.
--   trial_converted_by      — super_admin who recorded the conversion.
--
-- Plus on super_admin_rdv:
--   linked_showroom_id      — pointer to the showroom that was provisioned
--                              from this RDV (set when status flips to
--                              'essai_gratuit' via /api/admin/start-trial).
--
-- Idempotent. RLS policies on showrooms / super_admin_rdv are unchanged —
-- existing tenant_all / rdv_select policies already cover the new cols.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. showrooms trial columns ─────────────────────────────────────
alter table showrooms
  add column if not exists trial_ends_at         timestamptz,
  add column if not exists is_trial              boolean       not null default false,
  add column if not exists trial_converted_at    timestamptz,
  add column if not exists trial_contract_amount numeric(12,2),
  add column if not exists trial_converted_by    uuid references auth.users(id) on delete set null;

-- Index used by the nightly cron and any "active trial" lookup.
create index if not exists idx_showrooms_trial_ends_at
  on showrooms(trial_ends_at)
  where is_trial = true and active = true;

-- ── 2. super_admin_rdv ↔ showroom link ─────────────────────────────
alter table super_admin_rdv
  add column if not exists linked_showroom_id uuid
    references showrooms(id) on delete set null;

create index if not exists idx_super_admin_rdv_linked_showroom
  on super_admin_rdv(linked_showroom_id)
  where linked_showroom_id is not null;
