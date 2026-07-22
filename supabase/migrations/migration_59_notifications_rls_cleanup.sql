-- ============================================================
-- Migration 59: Notifications RLS cleanup (F2)
-- ============================================================
-- SECURITY FIX. The `notifications` table carried leftover permissive
-- policies (USING/CHECK true TO public — *_all) plus a redundant
-- `tenant_write` policy. These widened access beyond the intended tenant
-- scope. This migration drops them; the scoped tenant_* policies that
-- remain already cover every legitimate read/write path.
--
-- Safe for the app: the surviving scoped tenant_* policies cover all app
-- paths; the dropped policies only ever *widened* access.
--
-- NOTE: the live DB is patched separately (via Cowork); this file records
-- the fix so a db reset / rebuild from migrations reproduces it.

DROP POLICY IF EXISTS notifications_select_all ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_all ON public.notifications;
DROP POLICY IF EXISTS notifications_update_all ON public.notifications;
DROP POLICY IF EXISTS tenant_write ON public.notifications;
REVOKE ALL ON public.notifications FROM anon;
