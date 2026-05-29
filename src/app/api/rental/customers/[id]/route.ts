// ─────────────────────────────────────────────────────────────────────
// /api/rental/customers/:id
//   GET    — customer + rental history (Owner / Manager / Closer)
//   PATCH  — Owner / Manager only
//   DELETE — Owner only; blocked when the customer has any rental
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }
const READ_ROLES   = new Set(['owner', 'manager', 'closer', 'super_admin'])
const WRITE_ROLES  = new Set(['owner', 'manager', 'super_admin'])
const DELETE_ROLES = new Set(['owner', 'super_admin'])

function asTrimString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')
    if (!READ_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    let cq = ctx.authSb.from('rental_customers').select('*').eq('id', id)
    if (ctx.showroomId) cq = cq.eq('showroom_id', ctx.showroomId)
    const { data: customer, error: cErr } = await cq.maybeSingle()
    if (cErr) throw new ApiError(500, cErr.message)
    if (!customer) throw new ApiError(404, 'Client introuvable.')

    // Rental history — joined with the vehicle so the UI can render
    // "Renault Clio · 2024" without an extra fetch round-trip.
    const { data: rentals, error: rErr } = await ctx.authSb
      .from('rentals')
      .select(`
        id, contract_number, status, start_date, end_date,
        duration_days, total_rental_amount, created_at,
        rental_vehicle:rental_vehicles ( marque, modele, annee, immatriculation )
      `)
      .eq('customer_id', id)
      // Soft-delete (corbeille, migration 51): hide trashed contracts.
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
    if (rErr) throw new ApiError(500, rErr.message)

    return NextResponse.json({ customer, rentals: rentals ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─── PATCH ─────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!WRITE_ROLES.has(ctx.role)) throw new ApiError(403, 'Seul un Owner ou un Manager peut modifier un client.')
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const updates: Record<string, unknown> = {}

    // Blocked fields: showroom_id, created_by, total_rentals,
    // total_spent (denormalised counters), blacklisted (use the
    // dedicated /blacklist endpoint).
    if (body.full_name !== undefined) {
      const v = asTrimString(body.full_name)
      if (!v || v.length < 2) throw new ApiError(400, 'Nom complet requis (≥ 2 caractères).')
      updates.full_name = v
    }
    if (body.phone !== undefined) {
      const raw = asTrimString(body.phone)
      if (!raw) throw new ApiError(400, 'Téléphone requis.')
      try { updates.phone = normalizePhone(raw) }
      catch (e) {
        throw new ApiError(400, e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.')
      }
    }
    if (body.email !== undefined) {
      const v = asTrimString(body.email)
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ApiError(400, 'Email invalide.')
      updates.email = v
    }
    for (const k of [
      'cin_number','cin_photo_url','permis_number','permis_photo_url',
      'permis_expiry','address','wilaya','date_naissance','notes',
    ] as const) {
      if (body[k] !== undefined) updates[k] = asTrimString(body[k])
    }
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.')
    }

    const { data, error } = await ctx.authSb
      .from('rental_customers')
      .update(updates)
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('*')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'phone_already_exists' },
          { status: 409 },
        )
      }
      throw new ApiError(400, error.message)
    }
    if (!data) throw new ApiError(404, 'Client introuvable.')
    return NextResponse.json({ customer: data })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─── DELETE ────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!DELETE_ROLES.has(ctx.role)) {
      throw new ApiError(403, 'Seul un Owner peut supprimer un client.')
    }
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    // Block delete when the customer has any rental — denying via
    // FK ON DELETE RESTRICT works too but a 409 with a typed error
    // lets the UI render a clear message.
    const { count, error: cErr } = await ctx.authSb
      .from('rentals')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id)
    if (cErr) throw new ApiError(500, cErr.message)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'customer_has_rentals', rentals_count: count },
        { status: 409 },
      )
    }

    const { error: dErr } = await ctx.authSb
      .from('rental_customers')
      .delete()
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
    if (dErr) throw new ApiError(400, dErr.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
