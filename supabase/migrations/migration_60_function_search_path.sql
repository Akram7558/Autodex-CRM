-- ============================================================
-- Migration 60: Pin search_path=public on public functions (F4)
-- ============================================================
-- SECURITY FIX. Functions without an explicit `search_path` are exposed
-- to search-path-injection (a caller-controlled search_path can resolve
-- unqualified names to attacker objects — especially dangerous for
-- SECURITY DEFINER functions). This pins `search_path = public` on every
-- function in schema `public` that lacks it. Extension-owned functions are
-- skipped (they are managed by their extension).
--
-- Idempotent: functions that already pin a search_path are excluded by the
-- NOT EXISTS guard, so re-running changes nothing.
--
-- NOTE: the live DB is patched separately (via Cowork); this file records
-- the fix so a db reset / rebuild from migrations reproduces it.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
