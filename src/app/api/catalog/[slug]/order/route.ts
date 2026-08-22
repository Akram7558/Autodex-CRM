// ─────────────────────────────────────────────────────────────────────
// POST /api/catalog/[slug]/order
// ─────────────────────────────────────────────────────────────────────
// PUBLIC. Creates a `leads` row for the target showroom (or updates
// the existing lead if the same phone has already submitted), and
// auto-reserves the linked in-stock vehicle when applicable.
//
// Sends a best-effort notification to the showroom owner with a
// 1-click WhatsApp link to the lead.
//
// Rate limit: 5 submissions per IP per hour (in-memory bucket).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import { getClientIp, checkRateLimit, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/resend'

export const runtime = 'nodejs'

const IP_RULE     = { limit: 10, windowSeconds: 3600 }
const PHONE_RULE  = { limit: 3,  windowSeconds: 3600 }
// M3: independent cap on owner notification emails (not on lead creation).
const NOTIFY_RULE = { limit: 3,  windowSeconds: 3600 }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type RouteCtx = { params: Promise<{ slug: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ip = getClientIp(req)
    if (!(await checkRateLimit(`order:ip:${ip}`, IP_RULE)).ok) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 })
    }

    const { slug } = await params
    if (!slug) return NextResponse.json({ error: 'slug requis.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const full_name = String(body.full_name ?? '').trim()
    const phoneRaw  = String(body.phone     ?? '').trim()
    const message   = body.message ? String(body.message).trim() : ''
    const orderType = body.type === 'preorder' ? 'preorder' : 'vehicle'
    const vehicleId  = body.vehicle_id  ? String(body.vehicle_id)  : null
    const preorderId = body.preorder_id ? String(body.preorder_id) : null

    if (!full_name) return NextResponse.json({ error: 'Nom complet requis.' }, { status: 400 })

    let phone: string
    try { phone = normalizePhone(phoneRaw) }
    catch (e) {
      const msg = e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const admin = adminClient()

    // ── Resolve the showroom ────────────────────────────────────────
    const { data: showroom, error: shErr } = await admin
      .from('showrooms')
      .select('id, name, owner_email, catalog_enabled, active')
      .eq('slug', slug)
      .maybeSingle()
    if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 })
    if (!showroom || !showroom.active || !showroom.catalog_enabled) {
      return NextResponse.json({ error: 'Catalogue introuvable.' }, { status: 404 })
    }

    // Second dimension: rotating IPs must not allow one number to spam a
    // single showroom's catalogue.
    if (!(await checkRateLimit(`order:phone:${showroom.id}:${phone}`, PHONE_RULE)).ok) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 })
    }

    // ── Resolve the ordered item (for the lead's notes/title) ───────
    let vehicleLabel = 'Demande générale'
    let resolvedVehicleId: string | null = null  // only set for in-stock orders
    if (orderType === 'vehicle' && vehicleId) {
      const { data: v } = await admin
        .from('vehicles')
        .select('id, brand, model, year, price_dzd, status, showroom_id, is_public')
        .eq('id', vehicleId)
        .maybeSingle()
      if (v && v.showroom_id === showroom.id && v.is_public) {
        resolvedVehicleId = v.id
        vehicleLabel = [v.brand, v.model, v.year ? String(v.year) : '']
          .filter(Boolean).join(' ').trim() || 'Véhicule'
      }
    } else if (orderType === 'preorder' && preorderId) {
      const { data: p } = await admin
        .from('preorder_vehicles')
        .select('id, marque, modele, annee, showroom_id, disponible')
        .eq('id', preorderId)
        .maybeSingle()
      if (p && p.showroom_id === showroom.id && p.disponible) {
        vehicleLabel = `[Pré-commande] ${[p.marque, p.modele, p.annee ? String(p.annee) : '']
          .filter(Boolean).join(' ').trim() || 'Véhicule'}`
      }
    }

    const noteHeader = `Commande via catalogue : ${vehicleLabel}`
    const noteBody   = message ? `${noteHeader}\nMessage : ${message}` : noteHeader

    // ── Dedupe by phone within this showroom ────────────────────────
    const { data: existing } = await admin
      .from('leads')
      .select('id, notes, vehicle_id')
      .eq('showroom_id', showroom.id)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle()

    let leadId: string | null = existing?.id ?? null
    let createdNew = false

    // ── M3: is this a repeat order for the SAME item? ───────────────
    // `leads.vehicle_id` is only written on INSERT (the dedup branch below
    // never updates it), so it holds the FIRST vehicle, not the latest.
    // `leads.notes` is the field that actually accumulates every order —
    // set to `noteBody` on insert and appended on each dedup — so the last
    // "Commande via catalogue : <label>" line in it IS the last item of
    // interest, and it covers in-stock vehicles, pre-orders and general
    // requests uniformly. We compare that against the current header.
    let sameItemAsLast = false
    if (existing?.id) {
      const prev = String(existing.notes ?? '')
      const matches = prev.match(/Commande via catalogue : .*/g)
      const lastHeader = matches?.at(-1)?.trim()
      sameItemAsLast = !!lastHeader && lastHeader === noteHeader
    }

    if (existing?.id) {
      // Append the new request to the existing notes; keep history.
      const stamp = new Date().toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })
      const newNotes = `${existing.notes ?? ''}\n\n[${stamp}] ${noteBody}`.trim()
      await admin.from('leads').update({ notes: newNotes }).eq('id', existing.id)
      // Also log a system activity so the dedupe is visible in the
      // lead timeline.
      await admin.from('activities').insert([{
        showroom_id: showroom.id,
        lead_id:     existing.id,
        type:        'note',
        title:       'Nouvelle commande catalogue',
        body:        noteBody,
        done:        false,
      }]).then(() => {}, () => {})
    } else {
      const { data: ins, error: insErr } = await admin
        .from('leads')
        .insert([{
          showroom_id: showroom.id,
          full_name,
          phone,
          source:      'website',  // Lead.source enum doesn't have 'catalogue_public'
          notes:       noteBody,
          vehicle_id:  resolvedVehicleId,
          suivi:       'nouveau',  // catalog leads start as "Nouveau" — owner triages from there
          status:      'new',
          // migration_27: discriminator so /dashboard/leads can split
          // these into "Commandes véhicules" vs "Pré-commandes" tabs.
          order_type:  orderType,
        }])
        .select('id')
        .single()
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 })
      }
      leadId = ins.id
      createdNew = true
    }

    // ── Vehicle status intentionally NOT touched here ───────────────
    // The vehicle stays "disponible" until the owner manually moves
    // the lead's suivi to a state that triggers reservation (e.g. the
    // deposit flow on /dashboard/leads). Catalog orders are
    // expressions of interest, not confirmed holds.

    // ── Notify the showroom owner (best-effort) ─────────────────────
    // M3 — two independent guards against inbox flooding:
    //   (a) a repeat order for the SAME item on an existing lead adds no
    //       information the owner doesn't already have (the timeline
    //       activity above records it), so we skip the email;
    //   (b) a per showroom+phone cap on notifications, so varying the
    //       vehicle can't be used to bomb the owner either.
    // Both only suppress the EMAIL — the lead and its activity are always
    // written.
    let notify = !!showroom.owner_email && !sameItemAsLast
    if (notify) {
      notify = (await checkRateLimit(`order-notify:${showroom.id}:${phone}`, NOTIFY_RULE)).ok
    }

    if (notify) {
      const waLink = `https://wa.me/${phone.replace(/^\+/, '')}`
      const subject = `🔔 Nouvelle commande catalogue — ${vehicleLabel}`
      const text =
`Nouvelle commande reçue via votre catalogue public :

Client    : ${full_name}
Téléphone : ${phone}
Article   : ${vehicleLabel}
${message ? `Message   : ${message}\n` : ''}
Contacter sur WhatsApp : ${waLink}

— AutoDex`
      void sendEmail({
        to:      String(showroom.owner_email),
        subject,
        text,
      }).catch(() => {})
    }

    return NextResponse.json({
      success:    true,
      created:    createdNew,
      lead_id:    leadId,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
