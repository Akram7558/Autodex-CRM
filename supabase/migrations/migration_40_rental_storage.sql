-- ============================================================
-- Migration 40: Rental module — Storage bucket + RLS
-- ============================================================
-- Adds a private Supabase Storage bucket `rental-documents` and the
-- policies that scope every read / write to the caller's showroom.
--
-- Path convention enforced by RLS:
--   rental-documents/{showroom_id}/customers/{customer_id|temp_uuid}/*
--   rental-documents/{showroom_id}/rentals/{rental_id}/*       (Phase 2B)
--
-- Idempotent. Wrapped in BEGIN/COMMIT.
-- ============================================================

BEGIN;

-- ── 1. Bucket ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('rental-documents', 'rental-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Storage RLS policies on storage.objects ──────────────
-- Pre-condition helpers already exist in the database from earlier
-- migrations:
--   public.is_super_admin()       (migration 14)
--   public.user_showroom_id()     (migration 14)
--   public.user_app_role()        (migration 32)
--
-- Drop policies first so this migration is re-runnable.

DROP POLICY IF EXISTS "rental_storage_select"  ON storage.objects;
DROP POLICY IF EXISTS "rental_storage_insert"  ON storage.objects;
DROP POLICY IF EXISTS "rental_storage_update"  ON storage.objects;
DROP POLICY IF EXISTS "rental_storage_delete"  ON storage.objects;

-- SELECT — anyone in the matching showroom (closer included), super
-- admin always.
CREATE POLICY "rental_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rental-documents'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[1] = public.user_showroom_id()::text
        AND public.user_app_role() IN ('owner','manager','closer')
      )
    )
  );

-- INSERT — owner / manager / closer of the matching showroom. Closer
-- needs INSERT for the booking wizard (Phase 2B) so they can attach
-- CIN / permis on customer create. Path must start with their
-- showroom_id; further sub-folder ('customers' / 'rentals') is open.
CREATE POLICY "rental_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rental-documents'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[1] = public.user_showroom_id()::text
        AND public.user_app_role() IN ('owner','manager','closer')
      )
    )
  );

-- UPDATE — owner / manager only (closer can't replace docs).
CREATE POLICY "rental_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rental-documents'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[1] = public.user_showroom_id()::text
        AND public.user_app_role() IN ('owner','manager')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'rental-documents'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[1] = public.user_showroom_id()::text
        AND public.user_app_role() IN ('owner','manager')
      )
    )
  );

-- DELETE — owner only.
CREATE POLICY "rental_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'rental-documents'
    AND (
      public.is_super_admin()
      OR (
        (storage.foldername(name))[1] = public.user_showroom_id()::text
        AND public.user_app_role() = 'owner'
      )
    )
  );

-- ── Verification ─────────────────────────────────────────────
DO $$
DECLARE
  v_bucket_exists boolean;
  v_policy_count  int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'rental-documents')
    INTO v_bucket_exists;
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'rental_storage_%';
  RAISE NOTICE 'Migration 40: bucket=% policies=%', v_bucket_exists, v_policy_count;
  IF NOT v_bucket_exists THEN
    RAISE EXCEPTION 'Migration 40 failed: bucket missing';
  END IF;
  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'Migration 40 failed: expected 4 storage policies, got %', v_policy_count;
  END IF;
END$$;

COMMIT;
