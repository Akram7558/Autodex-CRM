-- ============================================================
-- Migration 39: Rental module — helpers + triggers + backfill
-- ============================================================
-- Adds:
--   • check_rental_overlap(...)         — booking-conflict detector
--   • enforce_rental_vehicle_limit()    — 5-vehicle cap for Classique
--   • auto_init_rental_settings()       — default settings on new
--                                          showroom create
--   • Triggers for the two above
--   • Backfill: rental_settings rows for every existing showroom
--
-- Active plan resolution: a showroom's plan_type is read from
-- `saas_plans` joined on `showrooms.plan_id`. Showrooms in trial /
-- never-converted have `plan_id IS NULL` → treated as 'classique'
-- (limit applies). When the owner converts to La Totale, plan_id is
-- set by the convert-trial admin route and the limit disappears.
-- ============================================================

BEGIN;

-- ── 1. Booking overlap detector ──────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rental_overlap(
  p_vehicle_id          uuid,
  p_start               date,
  p_end                 date,
  p_exclude_rental_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.rentals r
     WHERE r.rental_vehicle_id = p_vehicle_id
       AND r.status IN ('confirmed', 'active', 'overdue')
       AND r.start_date <= p_end
       AND r.end_date   >= p_start
       AND (p_exclude_rental_id IS NULL OR r.id <> p_exclude_rental_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_rental_overlap(uuid, date, date, uuid)
  TO authenticated;

-- ── 2. Classique 5-vehicle limit ────────────────────────────
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

  IF v_plan_type = 'totale' THEN
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

DROP TRIGGER IF EXISTS trg_rental_vehicles_enforce_limit ON public.rental_vehicles;
CREATE TRIGGER trg_rental_vehicles_enforce_limit
  BEFORE INSERT ON public.rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rental_vehicle_limit();

-- ── 3. Auto-init rental_settings on showroom create ─────────
CREATE OR REPLACE FUNCTION public.auto_init_rental_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rental_settings (showroom_id)
  VALUES (NEW.id)
  ON CONFLICT (showroom_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_showrooms_init_rental_settings ON public.showrooms;
CREATE TRIGGER trg_showrooms_init_rental_settings
  AFTER INSERT ON public.showrooms
  FOR EACH ROW EXECUTE FUNCTION public.auto_init_rental_settings();

-- ── 4. Backfill rental_settings for existing showrooms ──────
INSERT INTO public.rental_settings (showroom_id)
SELECT s.id
  FROM public.showrooms s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.rental_settings rs WHERE rs.showroom_id = s.id
 )
ON CONFLICT (showroom_id) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────
DO $$
DECLARE
  v_settings_count int;
  v_showroom_count int;
BEGIN
  SELECT count(*) INTO v_settings_count FROM public.rental_settings;
  SELECT count(*) INTO v_showroom_count FROM public.showrooms;
  RAISE NOTICE 'Migration 39: % rental_settings rows for % showrooms.',
    v_settings_count, v_showroom_count;
  IF v_settings_count < v_showroom_count THEN
    RAISE EXCEPTION 'Migration 39 failed: settings backfill incomplete (% < %)',
      v_settings_count, v_showroom_count;
  END IF;
END$$;

COMMIT;
