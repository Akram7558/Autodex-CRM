-- ─────────────────────────────────────────────────────────────────────
-- Add an optional `notes` column to ventes.
-- ─────────────────────────────────────────────────────────────────────
-- Captured by the ConfirmVenteModal on the showroom side. Free-form
-- text, no length cap (we trim on the client side). Idempotent.
-- ─────────────────────────────────────────────────────────────────────

alter table ventes add column if not exists notes text;
