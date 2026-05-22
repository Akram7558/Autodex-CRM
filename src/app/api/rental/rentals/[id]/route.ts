// ─────────────────────────────────────────────────────────────────────
// PATCH /api/rental/rentals/[id]
// ─────────────────────────────────────────────────────────────────────
// Status transitions for a rental contract. Body: { status, cancellation_reason? }
//
// Allowed transitions (server-validated; anything else → 400/409):
//   draft     → confirmed | cancelled
//   confirmed → completed | cancelled
//   active    → completed | cancelled
//   overdue   → completed | cancelled
//   completed / cancelled → terminal (no transitions)
//
// CRITICAL: draft → confirmed re-runs check_rental_overlap for this
// vehicle + dates EXCLUDING this rental. If a confirmed/active/overdue
// rental now overlaps → 409 (do NOT confirm).
//
// Permissions: requireShowroomMember; rental must be in the caller's
// showroom; a closer may only act on their OWN rental (assigned_to=self).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const TRANSITIONS: Record<string, Set<string>> = {
  draft:     new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  active:    new Set(['completed', 'cancelled']),
  overdue:   new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const target = String(body.status ?? '')
    if (!['confirmed', 'completed', 'cancelled'].includes(target)) {
      throw new ApiError(400, "status doit être 'confirmed', 'completed' ou 'cancelled'.")
    }

    // Load the current rental (RLS-scoped) — need status + vehicle/dates
    // for the overlap re-check + ownership for closers.
    const { data: rental, error: loadErr } = await ctx.authSb
      .from('rentals')
      .select('id, showroom_id, status, rental_vehicle_id, start_date, end_date, assigned_to')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Contrat hors de votre showroom.')
    }
    // Closer may only act on their own contract.
    if (ctx.role === 'closer' && rental.assigned_to !== ctx.user.id) {
      throw new ApiError(403, 'Vous ne pouvez modifier que vos propres contrats.')
    }

    const current = String(rental.status)
    if (current === target) {
      throw new ApiError(409, 'Le contrat est déjà dans ce statut.')
    }
    const allowed = TRANSITIONS[current] ?? new Set<string>()
    if (!allowed.has(target)) {
      throw new ApiError(409, `Transition non autorisée (${current} → ${target}).`)
    }

    // Availability re-check on confirmation (race guard).
    if (target === 'confirmed') {
      const { data: overlap, error: rpcErr } = await ctx.authSb.rpc('check_rental_overlap', {
        p_vehicle_id: rental.rental_vehicle_id,
        p_start: rental.start_date,
        p_end: rental.end_date,
        p_exclude_rental_id: id,
      })
      if (rpcErr) throw new ApiError(500, rpcErr.message)
      if (overlap === true) {
        return NextResponse.json(
          { error: 'unavailable', message: 'Véhicule déjà réservé sur ces dates.' },
          { status: 409 },
        )
      }
    }

    const updates: Record<string, unknown> = { status: target }
    if (target === 'cancelled') {
      const reason = body.cancellation_reason ? String(body.cancellation_reason).slice(0, 500) : null
      if (reason) updates.cancellation_reason = reason
    }

    const { data, error } = await ctx.authSb
      .from('rentals')
      .update(updates)
      .eq('id', id)
      .select('id, contract_number, status, cancellation_reason')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Contrat introuvable.')

    return NextResponse.json({ rental: data })
  } catch (err) {
    return errorResponse(err)
  }
}
