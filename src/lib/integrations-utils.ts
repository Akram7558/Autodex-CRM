import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function supaServer(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // No anon fallback: integrations RLS is owner/super_admin-scoped, so an
  // anon-keyed cookie-less client would silently see zero rows and mask a
  // misconfig. Fail loud instead.
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing (required for integrations routes)')
  return createClient(url, key, { auth: { persistSession: false } })
}

export const ALLOWED_PROVIDERS = ['whatsapp', 'messenger', 'instagram'] as const
export type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number]

export function isAllowedProvider(v: unknown): v is AllowedProvider {
  return typeof v === 'string' && (ALLOWED_PROVIDERS as readonly string[]).includes(v)
}
