-- ============================================================
-- Migration 36: Add plan_type (classique | totale) on saas_plans
-- Seed 3 "La Totale" premium plans (AI chatbot + location module)
--
-- Pricing:
--   Classique (existing): 3mo=15000, 6mo=25000, 12mo=45000
--   La Totale (new):      3mo=30000, 6mo=50000, 12mo=80000
-- ============================================================

BEGIN;

-- STEP 1: Add plan_type column (idempotent)
ALTER TABLE public.saas_plans
ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'classique';

-- STEP 2: Add CHECK constraint (drop-if-exists pattern for idempotency)
ALTER TABLE public.saas_plans DROP CONSTRAINT IF EXISTS saas_plans_plan_type_check;
ALTER TABLE public.saas_plans
ADD CONSTRAINT saas_plans_plan_type_check
CHECK (plan_type IN ('classique', 'totale'));

-- STEP 3: Ensure existing plans are marked classique (safety net)
UPDATE public.saas_plans
SET plan_type = 'classique'
WHERE plan_type IS NULL OR plan_type = '' OR plan_type NOT IN ('classique', 'totale');

-- STEP 4: Seed 3 La Totale plans (idempotent via NOT EXISTS check on (plan_type, duration_months))
INSERT INTO public.saas_plans (name, duration_months, price, plan_type, active)
SELECT v.name, v.duration_months, v.price, 'totale', true
FROM (VALUES
  ('Pack 3 mois - La Totale', 3, 30000),
  ('Pack 6 mois - La Totale', 6, 50000),
  ('Pack 1 an - La Totale', 12, 80000)
) AS v(name, duration_months, price)
WHERE NOT EXISTS (
  SELECT 1 FROM public.saas_plans p
  WHERE p.plan_type = 'totale' AND p.duration_months = v.duration_months
);

-- STEP 5: Verification
DO $$
DECLARE
  v_classique int;
  v_totale int;
  v_total int;
BEGIN
  SELECT count(*) INTO v_classique FROM public.saas_plans WHERE plan_type = 'classique';
  SELECT count(*) INTO v_totale FROM public.saas_plans WHERE plan_type = 'totale';
  SELECT count(*) INTO v_total FROM public.saas_plans;

  RAISE NOTICE 'Plans state: classique=%, totale=%, total=%', v_classique, v_totale, v_total;

  IF v_classique < 3 THEN
    RAISE EXCEPTION 'Migration 36 failed: expected >=3 classique plans, got %', v_classique;
  END IF;

  IF v_totale < 3 THEN
    RAISE EXCEPTION 'Migration 36 failed: expected >=3 totale plans, got %', v_totale;
  END IF;
END $$;

COMMIT;
