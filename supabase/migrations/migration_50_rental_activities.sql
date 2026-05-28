-- ============================================================
-- Migration 50: rental_activities — per-contract audit log
-- ============================================================
-- A who/when/what trail for every rental contract action (Chantier 3),
-- written server-side by the rental routes (create / reserve / pickup /
-- report / payment / status-suivi / vehicle-change / dates-edit / cancel).
-- Separate from the sales `activities` table (which is lead-coupled) — this
-- one is rental-scoped and mirrors the rental_payments RLS so owner/manager
-- see the whole showroom's trail while a closer sees only their own rentals.
--
-- Columns:
--   actor_id   — who did it (users.id; SET NULL if the user is later removed)
--   type       — coarse action category (CHECK list below)
--   title      — short human label (e.g. "Réservé", "Véhicule changé")
--   body       — optional detail (amounts, old→new dates, etc.)
--
-- ON DELETE CASCADE on rental_id/showroom_id: the log dies with its contract
-- / showroom (it's an audit trail of THAT contract, not global accounting).
--
-- Idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS) + wrapped in a
-- transaction. No data backfill — logging starts when the app code ships.
-- ============================================================

BEGIN;

-- 1. Table.
CREATE TABLE IF NOT EXISTS public.rental_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showroom_id uuid NOT NULL REFERENCES public.showrooms(id) ON DELETE CASCADE,
  rental_id   uuid NOT NULL REFERENCES public.rentals(id)   ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type        text NOT NULL
    CHECK (type IN (
      'created', 'status_change', 'reserved', 'picked_up', 'reported',
      'vehicle_changed', 'dates_changed', 'payment', 'cancelled'
    )),
  title       text NOT NULL,
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes (per-contract timeline + per-showroom feed).
CREATE INDEX IF NOT EXISTS idx_rental_activities_rental
  ON public.rental_activities (rental_id);
CREATE INDEX IF NOT EXISTS idx_rental_activities_showroom
  ON public.rental_activities (showroom_id);

-- 3. RLS — mirrors rental_payments (migration_38): super_admin OR own-showroom,
--    with closers scoped to rentals they're assigned to / created.
ALTER TABLE public.rental_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_activities_select" ON public.rental_activities;
CREATE POLICY "rental_activities_select" ON public.rental_activities
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_activities.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

DROP POLICY IF EXISTS "rental_activities_insert" ON public.rental_activities;
CREATE POLICY "rental_activities_insert" ON public.rental_activities
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.id = rental_activities.rental_id
         AND r.showroom_id = public.user_showroom_id()
         AND (
           public.user_app_role() IN ('owner','manager')
           OR (
             public.user_app_role() = 'closer'
             AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
           )
         )
    )
  );

COMMIT;
