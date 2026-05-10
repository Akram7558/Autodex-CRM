// ─────────────────────────────────────────────────────────────────────
// Public showroom catalog — /s/[slug]
// ─────────────────────────────────────────────────────────────────────
// PUBLIC page (no auth check, no middleware gate — middleware only
// matches /dashboard/:path*). Server component: fetches the showroom
// + vehicles + preorders directly from Supabase using the service role
// key, generates dynamic SEO metadata, and hands the data to the client
// `<CatalogPage />` for rendering.
//
// 404s when the slug doesn't exist, the showroom is inactive, or
// `catalog_enabled = false` — same gate as `/api/catalog/[slug]`.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type {
  ShowroomPublicInfo,
  PreorderVehicle,
  Vehicle,
} from '@/lib/types'
import CatalogPage from '@/components/catalog/CatalogPage'

export const runtime = 'nodejs'
// Always render fresh — owners flip `catalog_enabled` and edit hours
// from the dashboard, and visitors should see those changes immediately.
export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ slug: string }> }

type CatalogData = {
  showroom: ShowroomPublicInfo
  vehicles: Vehicle[]
  preorders: PreorderVehicle[]
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function getCatalogData(slug: string): Promise<CatalogData | null> {
  if (!slug) return null
  const admin = adminClient()

  const { data: showroom } = await admin
    .from('showrooms')
    .select(
      'id, name, slug, city, phone, whatsapp, address, google_maps_url, logo_url, opening_hours, catalog_enabled',
    )
    .eq('slug', slug)
    .eq('active', true)
    .eq('catalog_enabled', true)
    .maybeSingle()

  if (!showroom) return null

  const [{ data: vehicles }, { data: preorders }] = await Promise.all([
    admin
      .from('vehicles')
      .select('*')
      .eq('showroom_id', showroom.id)
      .eq('status', 'available')
      .eq('is_public', true)
      .order('created_at', { ascending: false }),
    admin
      .from('preorder_vehicles')
      .select('*')
      .eq('showroom_id', showroom.id)
      .eq('disponible', true)
      .order('created_at', { ascending: false }),
  ])

  return {
    showroom: showroom as unknown as ShowroomPublicInfo,
    vehicles: (vehicles ?? []) as Vehicle[],
    preorders: (preorders ?? []) as PreorderVehicle[],
  }
}

export async function generateMetadata({ params }: RouteCtx): Promise<Metadata> {
  const { slug } = await params
  const data = await getCatalogData(slug).catch(() => null)
  if (!data) {
    return {
      title: 'Catalogue introuvable',
      description: 'Ce catalogue n\'est pas disponible.',
    }
  }
  const { showroom, vehicles, preorders } = data
  const title = `${showroom.name} — Catalogue`
  const description =
    `Découvrez ${vehicles.length} véhicule${vehicles.length > 1 ? 's' : ''} ` +
    `disponible${vehicles.length > 1 ? 's' : ''} et ${preorders.length} ` +
    `pré-commande${preorders.length > 1 ? 's' : ''} chez ${showroom.name}` +
    `${showroom.city ? ` à ${showroom.city}` : ''}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: showroom.logo_url ? [{ url: showroom.logo_url }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: showroom.logo_url ? [showroom.logo_url] : [],
    },
    robots: { index: true, follow: true },
  }
}

export default async function PublicCatalogRoute({ params }: RouteCtx) {
  const { slug } = await params
  const data = await getCatalogData(slug)
  if (!data) notFound()
  return <CatalogPage data={data} />
}
