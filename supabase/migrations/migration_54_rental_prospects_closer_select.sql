BEGIN;
DROP POLICY IF EXISTS "rental_prospects_select" ON public.rental_prospects;
CREATE POLICY "rental_prospects_select" ON public.rental_prospects
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (showroom_id = public.user_showroom_id()
        AND public.user_app_role() IN ('owner','manager','closer'))
  );
COMMIT;
