-- ============================================================
-- Migration 48: rental_payments → add receipt_url
-- ============================================================
-- Adds a NULLABLE column to store a private storage path for a payment
-- receipt photo (e.g. the cashier voucher, BaridiMob screenshot, CCP slip).
-- Unblocks the upcoming reserve-flow rework where non-cash deposits will
-- require a receipt photo uploaded to the private `rental-documents`
-- bucket (path stored here, mirroring rentals.signature_url from
-- migration_43).
--
-- migration_37 created public.rental_payments(id, rental_id, type, amount,
-- method, reference, notes, created_by, created_at). This migration adds a
-- single column:
--
--   receipt_url text  -- nullable, no default, no CHECK
--
-- Why no CHECK? The column stores an OPAQUE storage path (e.g.
-- "{showroom_id}/rentals/{rental_id}/receipt-…"). Validation lives in the
-- API (which kinds/extensions are allowed) and in the storage RLS
-- (migration_40, which enforces the showroom prefix). NULL = no receipt
-- attached (e.g. cash payments where one isn't needed).
--
-- NO BACKFILL needed: every existing payment row simply has receipt_url IS
-- NULL. RLS, indexes, the CHECK constraints on type/method, and all other
-- tables are left untouched. Idempotent + wrapped in a transaction.
--
-- DEPLOY ORDER: run this migration in prod BEFORE the build step (the new
-- reserve dialog upload + the contract detail receipt link) ships. Reading
-- a missing column would break the GET/INSERT paths; the build step is
-- harmless against the OLD schema only because nothing references this
-- column yet.
-- ============================================================

BEGIN;

-- 1. Add the column. Nullable, no default, no CHECK — see header.
ALTER TABLE public.rental_payments
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMIT;
