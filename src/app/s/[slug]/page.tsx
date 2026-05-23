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
import type { RentalFleetCard } from '@/components/catalog/RentalFleetSection'

export const runtime = 'nodejs'
// Always render fresh — owners flip `catalog_enabled` and edit hours
// from the dashboard, and visitors should see those changes immediately.
export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ slug: string }> }

type CatalogData = {
  showroom: ShowroomPublicInfo
  vehicles: Vehicle[]
  preorders: PreorderVehicle[]
  rentalVehicles: RentalFleetCard[]
}

// Raw rental_vehicles row (numeric columns arrive as strings from Supabase).
type RawRentalVehicle = {
  id: string
  marque: string
  modele: string
  annee: number | null
  daily_rate: string | number | null
  weekly_rate: string | number | null
  monthly_rate: string | number | null
  deposit_amount: string | number | null
  photos_urls: string[] | null
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

  // "Currently rented" window — a vehicle is unavailable today if a
  // confirmed/active/overdue rental covers today. Server-computed so the
  // client never calls check_rental_overlap.
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: vehicles }, { data: preorders }, { data: rentalRows }, { data: busyRentals }] = await Promise.all([
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
    admin
      .from('rental_vehicles')
      .select('id, marque, modele, annee, daily_rate, weekly_rate, monthly_rate, deposit_amount, photos_urls')
      .eq('showroom_id', showroom.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    admin
      .from('rentals')
      .select('rental_vehicle_id')
      .eq('showroom_id', showroom.id)
      .in('status', ['confirmed', 'active', 'overdue'])
      .lte('start_date', today)
      .gte('end_date', today),
  ])

  // ── Build the public rental fleet ────────────────────────────────
  const rented = new Set(
    (busyRentals ?? []).map((r) => (r as { rental_vehicle_id: string }).rental_vehicle_id),
  )
  const rvRows = (rentalRows ?? []) as RawRentalVehicle[]

  // Rental photos live in the PRIVATE rental-documents bucket — anon can't
  // sign them. Batch-sign server-side (service role) so cards/lightbox get
  // working time-limited URLs. force-dynamic keeps them fresh per request.
  const allPaths = rvRows.flatMap((v) => v.photos_urls ?? [])
  const signedMap = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from('rental-documents')
      .createSignedUrls(allPaths, 3600)
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl)
    }
  }

  const num = (v: string | number | null): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const rentalVehicles: RentalFleetCard[] = rvRows.map((v) => ({
    id:             v.id,
    marque:         v.marque,
    modele:         v.modele,
    annee:          v.annee ?? null,
    daily_rate:     num(v.daily_rate),
    weekly_rate:    v.weekly_rate == null ? null : num(v.weekly_rate),
    monthly_rate:   v.monthly_rate == null ? null : num(v.monthly_rate),
    deposit_amount: num(v.deposit_amount),
    photos:         (v.photos_urls ?? []).map((p) => signedMap.get(p)).filter((u): u is string => !!u),
    isAvailable:    !rented.has(v.id),
  }))

  return {
    showroom: showroom as unknown as ShowroomPublicInfo,
    vehicles: (vehicles ?? []) as Vehicle[],
    preorders: (preorders ?? []) as PreorderVehicle[],
    rentalVehicles,
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
