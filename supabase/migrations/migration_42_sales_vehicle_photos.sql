-- ============================================================
-- Migration 42: Sales vehicles — multi-photo support
-- ============================================================
-- Adds `photos_urls text[]` to public.vehicles so a sales vehicle can
-- carry several photos instead of just one. Values are PUBLIC URLs from
-- the public `vehicules` storage bucket (created in migration_04) — the
-- SAME model the single `image_url` already used, so the public catalog
-- (/s/[slug]) keeps rendering them to anonymous visitors with no signing.
--
-- The legacy `image_url` column is KEPT for backward compatibility: the
-- public catalog and other legacy reads still use it. Going forward,
-- image_url MUST mirror photos_urls[1] (the main photo) — the app writes
-- both columns together on every save.
--
-- Backfill: existing rows with a non-null image_url seed photos_urls with
-- that single URL so no photo disappears from the new gallery.
--
-- Idempotent. Wrapped in BEGIN/COMMIT.
-- ============================================================

BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS photos_urls text[] NOT NULL DEFAULT '{}';

-- Seed the gallery from the legacy single-photo column.
UPDATE public.vehicles
   SET photos_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND image_url <> ''
   AND (photos_urls IS NULL OR photos_urls = '{}');

COMMIT;
