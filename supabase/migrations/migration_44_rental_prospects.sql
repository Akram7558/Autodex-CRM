-- ============================================================
-- Migration 44: Rental prospects (public rental requests)
-- ============================================================
-- Public rental requests submitted from the catalog (/s/[slug]) by
-- anonymous visitors interested in renting a vehicle. They land here as
-- 'nouvelle', are worked in the dashboard pipeline (chunk C), and are
-- converted into a rental contract via the booking wizard (chunk D) — at
-- which point converted_rental_id is set and status becomes 'convertie'.
--
-- reason codes:
--   mariage        → Mariage
--   long_trajet    → Long trajet
--   professionnel  → Professionnel
--   remplacement   → Véhicule de remplacement
--   tourisme       → Tourisme
--   evenement      → Événement
--   essai          → Essai avant achat
--   autre          → Autre (free text supplied in reason_other)
--
-- status codes:
--   nouvelle  → new request (default)
--   contactee → the showroom has reached out
--   convertie → turned into a rental (converted_rental_id set)
--   perdue    → lost / not pursued
--
-- SECURITY MODEL — matches the existing public catalog write path
-- (/api/catalog/[slug]/order): anonymous inserts go through a SERVER
-- ROUTE using the SERVICE ROLE key, which bypasses RLS. The table is
-- therefore NOT exposed to the anon role and there is NO public insert
-- policy. The RLS below only governs AUTHENTICATED dashboard access,
-- scoped to the caller's showroom (mirrors rental_customers).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.rental_prospects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showroom_id         uuid NOT NULL REFERENCES public.showrooms(id) ON DELETE CASCADE,
  -- The vehicle they're interested in. Nullable: kept if the car is later
  -- removed from the fleet (ON DELETE SET NULL).
  rental_vehicle_id   uuid REFERENCES public.rental_vehicles(id) ON DELETE SET NULL,
  full_name           text NOT NULL,
  phone               text NOT NULL,                 -- normalized +213XXXXXXXXX (API)
  desired_start_date  date,
  desired_end_date    date,
  reason              text NOT NULL
    CHECK (reason IN ('mariage','long_trajet','professionnel','remplacement','tourisme','evenement','essai','autre')),
  reason_other        text,                          -- free text when reason = 'autre'
  message             text,
  status              text NOT NULL DEFAULT 'nouvelle'
    CHECK (status IN ('nouvelle','contactee','convertie','perdue')),
  converted_rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'catalog_public',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_prospects_dates_check
    CHECK (desired_end_date IS NULL OR desired_start_date IS NULL OR desired_end_date >= desired_start_date)
);

-- Pipeline list: WHERE showroom_id = $1 [AND status = $2] ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_rental_prospects_showroom_status_created
  ON public.rental_prospects (showroom_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_prospects_vehicle
  ON public.rental_prospects (rental_vehicle_id);

-- Reuse the shared rental updated_at trigger (migration 37).
DROP TRIGGER IF EXISTS trg_rental_prospects_touch ON public.rental_prospects;
CREATE TRIGGER trg_rental_prospects_touch
  BEFORE UPDATE ON public.rental_prospects
  FOR EACH ROW EXECUTE FUNCTION public.rental_touch_updated_at();

-- ── RLS (authenticated dashboard access only) ────────────────
ALTER TABLE public.rental_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_prospects_select" ON public.rental_prospects;
CREATE POLICY "rental_prospects_select" ON public.rental_prospects
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_prospects_insert" ON public.rental_prospects;
CREATE POLICY "rental_prospects_insert" ON public.rental_prospects
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_prospects_update" ON public.rental_prospects;
CREATE POLICY "rental_prospects_update" ON public.rental_prospects
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager')
    )
  );

DROP POLICY IF EXISTS "rental_prospects_delete" ON public.rental_prospects;
CREATE POLICY "rental_prospects_delete" ON public.rental_prospects
  FOR DELETE TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager')
    )
  );

COMMIT;
