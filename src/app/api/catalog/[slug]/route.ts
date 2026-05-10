// ─────────────────────────────────────────────────────────────────────
// GET /api/catalog/[slug]
// ─────────────────────────────────────────────────────────────────────
// PUBLIC. Returns the showroom's public profile + their available
// vehicles (status='available' AND is_public) + their available
// preorder vehicles. 404 when the slug is unknown / the showroom is
// inactive / `catalog_enabled = false`.
//
// Uses the service-role client because the request is anonymous and
// RLS on `vehicles` doesn't allow public SELECT. We pre-filter by
// `showroom_id` so the response stays scoped to the right tenant.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ slug: string }> }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  try {
    const { slug } = await params
    if (!slug) return NextResponse.json({ error: 'slug requis.' }, { status: 400 })

    const admin = adminClient()

    const { data: showroom, error: shErr } = await admin
      .from('showrooms')
      .select('id, name, slug, city, phone, whatsapp, address, google_maps_url, logo_url, opening_hours, catalog_enabled, active')
      .eq('slug', slug)
      .eq('active', true)
      .eq('catalog_enabled', true)
      .maybeSingle()
    if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 })
    if (!showroom) return NextResponse.json({ error: 'Catalogue introuvable.' }, { status: 404 })

    // Vehicles in stock — public ones only, only `available` status.
    const { data: vehicles, error: vErr } = await admin
      .from('vehicles')
      .select('*')
      .eq('showroom_id', showroom.id)
      .eq('status', 'available')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

    const { data: preorders, error: pErr } = await admin
      .from('preorder_vehicles')
      .select('*')
      .eq('showroom_id', showroom.id)
      .eq('disponible', true)
      .order('created_at', { ascending: false })
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

    // Strip internal-only fields from the showroom payload so the
    // public surface stays minimal.
    const publicShowroom = {
      id:              showroom.id,
      name:            showroom.name,
      slug:            showroom.slug,
      city:            showroom.city,
      phone:           showroom.phone,
      whatsapp:        showroom.whatsapp,
      address:         showroom.address,
      google_maps_url: showroom.google_maps_url,
      logo_url:        showroom.logo_url,
      opening_hours:   showroom.opening_hours,
    }

    return NextResponse.json({
      showroom:  publicShowroom,
      vehicles:  vehicles ?? [],
      preorders: preorders ?? [],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
