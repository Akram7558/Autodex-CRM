-- ============================================================
-- Migration 35: Fix public.users sync from auth.users
-- 1) Update CHECK constraint to include all real roles
-- 2) Delete orphan seed rows (fake IDs not in auth.users)
-- 3) Backfill all auth.users into public.users
-- 4) Create trigger to auto-sync on future signups
--
-- ⚠️ ALREADY EXECUTED IN PRODUCTION on 2026-05-15 via Cowork
-- This file is committed for repo/staging consistency only.
-- ============================================================

-- STEP 1: Update CHECK constraint
ALTER TABLE public.users DROP CONSTRAINT users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'admin','manager','agent',
    'super_admin','owner','commercial','closer',
    'prospecteur_saas','user'
  ]));

-- STEP 2: Delete orphan seed rows (fake IDs not in auth.users)
DELETE FROM public.users
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = public.users.id);

-- STEP 3: Backfill all auth.users into public.users
INSERT INTO public.users (id, email, full_name, role, showroom_id, is_active, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  ) AS full_name,
  COALESCE(ur.role, 'user') AS role,
  ur.showroom_id,
  true,
  au.created_at
FROM auth.users au
LEFT JOIN LATERAL (
  SELECT role, showroom_id
  FROM user_roles
  WHERE user_id = au.id
  LIMIT 1
) ur ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- STEP 4: Create trigger function + trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, is_active, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    'user',
    true,
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN public.users.full_name IS NULL OR public.users.full_name = ''
        OR public.users.full_name = split_part(EXCLUDED.email, '@', 1)
      THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
