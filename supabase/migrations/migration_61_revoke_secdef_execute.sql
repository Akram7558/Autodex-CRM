-- ============================================================
-- Migration 61: Revoke API EXECUTE on internal SECURITY DEFINER fns (F3)
-- ============================================================
-- SECURITY FIX. Many public functions were EXECUTE-able by anon /
-- authenticated over PostgREST (/rest/v1/rpc/<name>) purely by the default
-- PUBLIC grant, even though they are internal trigger functions, internal
-- SQL helpers, or RPCs only ever invoked by the service-role server client.
-- This removes API EXECUTE from those.
--
-- • service_role keeps EXECUTE via its own direct grant — revoking PUBLIC /
--   anon / authenticated does NOT affect the service-role server routes.
-- • Trigger firing and calls from inside other SECURITY DEFINER functions
--   are not subject to the caller's EXECUTE privilege, so revoking here
--   cannot break triggers or the wrapper RPCs.
-- • The 6 RLS-helper functions (is_super_admin / user_showroom_id /
--   user_app_role / is_commercial / is_internal_team / is_prospecteur_saas)
--   are intentionally NOT touched — RLS policy evaluation calls them as the
--   invoking role, so authenticated must keep EXECUTE or RLS breaks.
--
-- NOTE: the live DB is patched separately (via Cowork); this file records
-- the fix so a db reset / rebuild from migrations reproduces it.

-- Internal + trigger + service-role-only functions: no legitimate API path.
REVOKE EXECUTE ON FUNCTION public._recompute_lead(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_init_rental_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_lead_temperature(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_rental_vehicle_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_lead_temperatures(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_touch_distribution_on_rdv() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_touch_prospect_distribution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_validate_distribution_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_validate_prospect_distribution_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sap_log_suivi_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sap_stamp_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.showroom_pick_next_assignee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suggest_preorders_for_lead(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suggest_vehicles_for_lead(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_activities_signal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_assign_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_temperature() FROM PUBLIC, anon, authenticated;

-- These 3 are invoked by authenticated server routes (ctx.authSb): keep authenticated, drop the rest.
REVOKE EXECUTE ON FUNCTION public.check_rental_overlap(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_rental_overlap(uuid, date, date, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_pick_next_commercial() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.saas_pick_next_commercial() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.saas_pick_next_prospecteur() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.saas_pick_next_prospecteur() TO authenticated;
