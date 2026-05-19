-- ============================================================
-- Migration 38: Rental module — RLS policies
-- ============================================================
-- Per-role visibility for the 6 rental tables. Helpers reused from
-- previous migrations:
--   • public.is_super_admin()    — bypass for AutoDex internal team
--   • public.user_showroom_id()  — caller's showroom (NULL = none)
--   • public.user_app_role()     — caller's AppRole (text)
--
-- Role matrix (showroom-side):
--                          owner/manager   closer                          prospecteur
--   rental_vehicles        ALL             SELECT only                     NONE
--   rental_customers       ALL             SELECT + INSERT                 NONE
--   rentals                ALL             SELECT/INSERT/UPDATE own rows   NONE
--   rental_inspections     ALL             SELECT/INSERT for own rentals   NONE
--   rental_payments        ALL             SELECT/INSERT for own rentals   NONE
--   rental_settings        ALL (owner/mgr) SELECT only                     NONE
--
-- "Own rentals" = rentals where closer is assigned_to OR created_by.
-- Idempotent — every policy drop-and-recreate.
-- ============================================================

BEGIN;

-- ── 1. rental_vehicles ──────────────────────────────────────
ALTER TABLE public.rental_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_vehicles_select" ON public.rental_vehicles;
CREATE POLICY "rental_vehicles_select" ON public.rental_vehicles
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_vehicles_write" ON public.rental_vehicles;
CREATE POLICY "rental_vehicles_write" ON public.rental_vehicles
  FOR ALL TO authenticated
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

-- ── 2. rental_customers ─────────────────────────────────────
ALTER TABLE public.rental_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_customers_select" ON public.rental_customers;
CREATE POLICY "rental_customers_select" ON public.rental_customers
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_customers_insert" ON public.rental_customers;
CREATE POLICY "rental_customers_insert" ON public.rental_customers
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_customers_update" ON public.rental_customers;
CREATE POLICY "rental_customers_update" ON public.rental_customers
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

DROP POLICY IF EXISTS "rental_customers_delete" ON public.rental_customers;
CREATE POLICY "rental_customers_delete" ON public.rental_customers
  FOR DELETE TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager')
    )
  );

-- ── 3. rentals ──────────────────────────────────────────────
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rentals_select" ON public.rentals;
CREATE POLICY "rentals_select" ON public.rentals
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND (
        public.user_app_role() IN ('owner','manager')
        OR (
          public.user_app_role() = 'closer'
          AND (assigned_to = auth.uid() OR created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "rentals_insert" ON public.rentals;
CREATE POLICY "rentals_insert" ON public.rentals
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND (
        public.user_app_role() IN ('owner','manager')
        OR (
          public.user_app_role() = 'closer'
          AND assigned_to = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "rentals_update" ON public.rentals;
CREATE POLICY "rentals_update" ON public.rentals
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND (
        public.user_app_role() IN ('owner','manager')
        OR (
          public.user_app_role() = 'closer'
          AND (assigned_to = auth.uid() OR created_by = auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND (
        public.user_app_role() IN ('owner','manager')
        OR (
          public.user_app_role() = 'closer'
          AND (assigned_to = auth.uid() OR created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "rentals_delete" ON public.rentals;
CREATE POLICY "rentals_delete" ON public.rentals
  FOR DELETE TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager')
    )
  );

-- ── 4. rental_inspections ───────────────────────────────────
ALTER TABLE public.rental_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_inspections_select" ON public.rental_inspections;
CREATE POLICY "rental_inspections_select" ON public.rental_inspections
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_inspections.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS "rental_inspections_insert" ON public.rental_inspections;
CREATE POLICY "rental_inspections_insert" ON public.rental_inspections
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_inspections.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS "rental_inspections_modify" ON public.rental_inspections;
CREATE POLICY "rental_inspections_modify" ON public.rental_inspections
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_inspections.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND public.user_app_role() IN ('owner','manager')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_inspections.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND public.user_app_role() IN ('owner','manager')
    )
  );

-- ── 5. rental_payments ──────────────────────────────────────
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_payments_select" ON public.rental_payments;
CREATE POLICY "rental_payments_select" ON public.rental_payments
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_payments.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS "rental_payments_insert" ON public.rental_payments;
CREATE POLICY "rental_payments_insert" ON public.rental_payments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_payments.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

-- ── 6. rental_settings ──────────────────────────────────────
ALTER TABLE public.rental_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_settings_select" ON public.rental_settings;
CREATE POLICY "rental_settings_select" ON public.rental_settings
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

DROP POLICY IF EXISTS "rental_settings_write" ON public.rental_settings;
CREATE POLICY "rental_settings_write" ON public.rental_settings
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() = 'owner'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() = 'owner'
    )
  );

COMMIT;
