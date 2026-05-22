-- ============================================================
-- Migration 43: Rentals — digital signature storage path
-- ============================================================
-- Adds `signature_url text` to public.rentals to hold the STORAGE PATH
-- (not a data URL) of the customer's hand-drawn signature, uploaded to
-- the private `rental-documents` bucket at:
--   rental-documents/{showroom_id}/rentals/{temp_uuid|rental_id}/signature-*.png
--
-- Reads resolve to a 1-hour signed URL via getSignedReadUrl(). The
-- existing `signed_at timestamptz` (migration 37) records WHEN it was
-- signed; this column records WHERE the image lives.
--
-- The booking wizard (POST /api/rental/rentals) degrades gracefully if
-- this column is absent: it strips signature_url from the insert and
-- still records signed_at, so the contract is created either way. Run
-- this migration to persist the signature image path.
--
-- Idempotent. Wrapped in BEGIN/COMMIT.
-- ============================================================

BEGIN;

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS signature_url text;

COMMIT;
