-- ============================================================
-- Migration 57: Location plan (location-only tier) on saas_plans
-- ============================================================
-- New 3-tier model:
--   classique → vente only         (existing)
--   location  → location only      (NEW — this migration)
--   totale    → vente + location   (existing)
--
-- Plans now DECLARE their modules (module_vente / module_location) so the
-- provisioning paths can derive showrooms.module_* from the chosen plan
-- (wired in the next step — app code unchanged here). Location pricing
-- mirrors Classique (15000 / 25000 / 45000 for 3 / 6 / 12 months); the
-- location fleet is UNLIMITED (same as La Totale).
--
-- Idempotent. Wrapped in a transaction.
-- ============================================================

BEGIN;

-- ── (a) Plans declare their modules ─────────────────────────────────
ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS module_vente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS module_location boolean NOT NULL DEFAULT false;

-- Backfill existing tiers to match their intent (the column defaults only
-- happen to be correct for classique; totale needs location=true).
UPDATE public.saas_plans
   SET module_vente = true, module_location = false
 WHERE plan_type = 'classique';

UPDATE public.saas_plans
   SET module_vente = true, module_location = true
 WHERE plan_type = 'totale';

-- ── (b) Extend the plan_type CHECK to include 'location' ────────────
-- Constraint name carried over from migration_36 (saas_plans_plan_type_check).
ALTER TABLE public.saas_plans DROP CONSTRAINT IF EXISTS saas_plans_plan_type_check;
ALTER TABLE public.saas_plans
  ADD CONSTRAINT saas_plans_plan_type_check
  CHECK (plan_type IN ('classique', 'totale', 'location'));

-- ── (c) Seed the 3 Location plans (idempotent — skip if name exists) ─
INSERT INTO public.saas_plans
  (name, duration_months, price, plan_type, module_vente, module_location, active)
SELECT v.name, v.duration_months, v.price, 'location', false, true, true
FROM (VALUES
  ('Pack 3 mois - Location', 3,  15000),
  ('Pack 6 mois - Location', 6,  25000),
  ('Pack 1 an - Location',   12, 45000)
) AS v(name, duration_months, price)
WHERE NOT EXISTS (
  SELECT 1 FROM public.saas_plans p WHERE p.name = v.name
);

-- ── (d) Fleet cap: 'location' is unlimited too (like 'totale') ──────
-- CREATE OR REPLACE of migration_39's enforce_rental_vehicle_limit, copied
-- VERBATIM, changing ONLY the plan_type condition
-- (= 'totale'  →  IN ('totale','location')). The BEFORE INSERT trigger
-- binding is preserved by REPLACE, so it is not recreated here.
CREATE OR REPLACE FUNCTION public.enforce_rental_vehicle_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_type   text;
  v_active_count integer;
BEGIN
  -- Resolve the showroom's active plan_type via the FK on showrooms.
  -- NULL plan_id (trial / unconverted) → Classique limit applies.
  SELECT COALESCE(sp.plan_type, 'classique')
    INTO v_plan_type
    FROM public.showrooms s
    LEFT JOIN public.saas_plans sp ON sp.id = s.plan_id
   WHERE s.id = NEW.showroom_id;

  IF v_plan_type IN ('totale', 'location') THEN
    RETURN NEW;  -- unlimited
  END IF;

  -- Count *active* rental_vehicles for this showroom. Soft-deleted
  -- (is_active=false) vehicles are excluded from the cap.
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.rental_vehicles
   WHERE showroom_id = NEW.showroom_id
     AND is_active   = true;

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'CLASSIQUE_RENTAL_LIMIT_REACHED'
      USING DETAIL = 'Plan Classique limited to 5 rental vehicles.',
            HINT   = 'Upgrade to La Totale for unlimited fleet.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
