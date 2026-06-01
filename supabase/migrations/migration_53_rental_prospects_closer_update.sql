-- ============================================================
-- Migration 53: allow CLOSER to update own-showroom rental_prospects
-- ============================================================
-- BUG: on /dashboard/location/prospects a closer can SEE prospects
-- (rental_prospects_select already includes 'closer') but changing a
-- prospect's suivi/status via PATCH /api/rental/prospects/[id] failed with
-- "Demande introuvable." and the dropdown reverted.
--
-- ROOT CAUSE (confirmed): the endpoint performs the UPDATE through the
-- RLS-scoped (anon-key, cookie-session) client `ctx.authSb`. The
-- migration_44 `rental_prospects_update` policy lists only
-- ('owner','manager') in BOTH USING and WITH CHECK, so a closer's UPDATE
-- matches 0 rows; the select-after-update returns null and the route
-- throws 404 "Demande introuvable." (route.ts line 102). It is an RLS
-- row-scope block, NOT an app-level role check — ALLOWED_ROLES in the
-- endpoint already includes 'closer'.
--
-- DECISION: closers may manage location prospects. This migration extends
-- ONLY the UPDATE policy to include 'closer', still STRICTLY scoped to the
-- caller's own showroom (showroom_id = public.user_showroom_id()), so a
-- closer can NEVER update another showroom's prospects — the multi-tenant
-- boundary is preserved. super_admin keeps full access via is_super_admin().
--
-- Scope: touches ONLY rental_prospects_update. The SELECT / INSERT / DELETE
-- policies, all other roles, and every other table are left untouched.
-- Structure mirrors migration_44 (DROP + CREATE the same named policy);
-- idempotent and safe to re-run.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "rental_prospects_update" ON public.rental_prospects;
CREATE POLICY "rental_prospects_update" ON public.rental_prospects
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      showroom_id = public.user_showroom_id()
      AND public.user_app_role() IN ('owner','manager','closer')
    )
  );

COMMIT;
