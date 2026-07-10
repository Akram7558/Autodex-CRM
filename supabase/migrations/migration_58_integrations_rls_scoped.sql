-- ============================================================
-- Migration 58: Scope integrations RLS (owner/super_admin only)
-- ============================================================
-- SECURITY FIX (P0). migration_03 created the `integrations` table with
-- 4 wide-open policies (USING(true) / WITH CHECK(true) TO public) — i.e.
-- anyone holding the public anon key could SELECT every showroom's Meta
-- access_token. This migration drops them and installs showroom-scoped,
-- owner-only policies (super_admin override), mirroring the other tables.
--
-- Safe for the app: recon confirmed ALL app access to `integrations` goes
-- through server routes using the SERVICE-ROLE client (bypasses RLS) —
-- /api/integrations/list, /connect/whatsapp, /disconnect. No browser code
-- touches the table directly, and no anon/public flow reads it.
--
-- NOTE: the live DB is patched separately; this file records the fix so a
-- rebuild from migrations keeps it.

DROP POLICY IF EXISTS integrations_select_all ON public.integrations;
DROP POLICY IF EXISTS integrations_insert_all ON public.integrations;
DROP POLICY IF EXISTS integrations_update_all ON public.integrations;
DROP POLICY IF EXISTS integrations_delete_all ON public.integrations;
CREATE POLICY integrations_select ON public.integrations FOR SELECT TO authenticated
  USING (is_super_admin() OR (showroom_id = user_showroom_id() AND user_app_role() = 'owner'));
CREATE POLICY integrations_insert ON public.integrations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (showroom_id = user_showroom_id() AND user_app_role() = 'owner'));
CREATE POLICY integrations_update ON public.integrations FOR UPDATE TO authenticated
  USING (is_super_admin() OR (showroom_id = user_showroom_id() AND user_app_role() = 'owner'))
  WITH CHECK (is_super_admin() OR (showroom_id = user_showroom_id() AND user_app_role() = 'owner'));
CREATE POLICY integrations_delete ON public.integrations FOR DELETE TO authenticated
  USING (is_super_admin() OR (showroom_id = user_showroom_id() AND user_app_role() = 'owner'));
REVOKE ALL ON public.integrations FROM anon;
