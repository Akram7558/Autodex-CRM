// ─────────────────────────────────────────────────────────────────────
// PATCH /api/rental/rentals/[id]
// ─────────────────────────────────────────────────────────────────────
// Two payloads on the same route (branch on `status`):
//
// A) STATUS TRANSITION — body { status, cancellation_reason? }
//    draft→confirmed|cancelled, confirmed→completed|cancelled,
//    active→completed|cancelled, overdue→completed|cancelled.
//    draft→confirmed re-runs check_rental_overlap (exclude self) → 409.
//
// B) EDIT — body WITHOUT `status` (notes / dates+times / rental_vehicle_id /
//    money). Date OR vehicle changes re-run check_rental_overlap (exclude
//    self) → 409 and recompute duration_days. Money fields
//    (deposit_amount, total_rental_amount, daily_rate_snapshot) are applied
//    ONLY for owner/manager/super_admin. contract_number, showroom_id,
//    created_by, status and signature are never editable here.
//
// Permissions: requireShowroomMember; rental in caller's showroom; a closer
// may only act on their OWN rental (assigned_to = self).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, formatDateFr, rentalStatusLabel } from '@/components/rental/booking/types'
import { logRentalActivity } from '@/lib/rental/activity'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const FIN_ROLES = new Set(['owner', 'manager', 'super_admin'])
const TRANSITIONS: Record<string, Set<string>> = {
  // À-confirmer sub-statuses (Chantier 1) — free movement between the four
  // unpaid relance buckets via the per-row SuiviControl. → confirmed only via
  // POST /reserve (deposit required). → reporter only via POST /report (new
  // dates + total recompute).
  draft:        new Set(['tentative_1', 'tentative_2', 'tentative_3', 'cancelled']),
  tentative_1:  new Set(['draft', 'tentative_2', 'tentative_3', 'cancelled']),
  tentative_2:  new Set(['draft', 'tentative_1', 'tentative_3', 'cancelled']),
  tentative_3:  new Set(['draft', 'tentative_1', 'tentative_2', 'cancelled']),
  // 'reporter' contracts can be moved back to À-confirmer (loueur reached the
  // client and wants to track relance attempts again). Reprogrammer was
  // removed — to go reporter → confirmed, use /reserve (deposit required).
  reporter:     new Set(['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'cancelled']),
  // confirmed → active ONLY via POST /pickup (full settlement required).
  confirmed:    new Set(['cancelled']),
  active:       new Set(['completed', 'cancelled']),     // can't postpone an active rental
  overdue:      new Set(['completed', 'cancelled']),     // overdue can only be completed/cancelled
  completed:    new Set(),
  cancelled:    new Set(),
}

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/
const TIME_RX = /^\d{2}:\d{2}$/

function durationDays(start: string, end: string): number | null {
  const a = new Date(start + 'T00:00:00')
  const b = new Date(end + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (diff < 0) return null
  return Math.max(1, diff)
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

    // Shared load + ownership check.
    const { data: rental, error: loadErr } = await ctx.authSb
      .from('rentals')
      .select('id, showroom_id, status, rental_vehicle_id, start_date, end_date, assigned_to, daily_rate_snapshot')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Contrat hors de votre showroom.')
    }
    if (ctx.role === 'closer' && rental.assigned_to !== ctx.user.id) {
      throw new ApiError(403, 'Vous ne pouvez modifier que vos propres contrats.')
    }

    // ── A) STATUS TRANSITION ────────────────────────────────────
    if (typeof body.status === 'string' && body.status.length > 0) {
      const target = body.status
      // 'overdue' is system-driven (NOT a user target). 'reporter' stays in
      // the whitelist for symmetry with 'confirmed' and 'active', though the
      // matrix has no edge to it (only POST /report sets it).
      if (!['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter', 'confirmed', 'active', 'completed', 'cancelled'].includes(target)) {
        throw new ApiError(400, "status doit être 'draft', 'tentative_1/2/3', 'reporter', 'confirmed', 'active', 'completed' ou 'cancelled'.")
      }
      const current = String(rental.status)
      if (current === target) throw new ApiError(409, 'Le contrat est déjà dans ce statut.')
      const allowed = TRANSITIONS[current] ?? new Set<string>()
      if (!allowed.has(target)) {
        throw new ApiError(409, `Transition non autorisée (${current} → ${target}).`)
      }
      // Overlap re-check is now a defensive no-op here: every path that
      // (re-)books a vehicle lives in a dedicated route — draft/tentative_X/
      // reporter→confirmed via POST /reserve (deposit required), confirmed
      // →active via POST /pickup (full settlement), and {draft,tentative_X,
      // reporter}→reporter via POST /report (new dates). The matrix has no
      // PATCH path to 'confirmed', so the block below is unreachable; it's
      // kept for belt-and-suspenders in case a future state is added.
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
        .from('rentals').update(updates).eq('id', id)
        .select('id, contract_number, status, cancellation_reason').maybeSingle()
      if (error) throw new ApiError(400, error.message)
      if (!data) throw new ApiError(404, 'Contrat introuvable.')

      // Chantier 4: cancelling a contract that originated from a prospect
      // "reopens" that prospect — clear converted_rental_id so it returns to
      // the pipeline, and reset its status to 'rdv_planifie'. Best-effort:
      // a failure here must NEVER fail the cancellation.
      if (target === 'cancelled') {
        try {
          await ctx.authSb
            .from('rental_prospects')
            .update({ converted_rental_id: null, status: 'rdv_planifie' })
            .eq('converted_rental_id', id)
            .eq('showroom_id', rental.showroom_id)
        } catch { /* ignore — the cancel already succeeded */ }
      }

      // Best-effort audit trail (Chantier 3) — never fails the transition.
      if (target === 'cancelled') {
        const reason = body.cancellation_reason ? String(body.cancellation_reason).slice(0, 500) : null
        await logRentalActivity(ctx.authSb, {
          showroomId: rental.showroom_id,
          rentalId:   id,
          actorId:    ctx.user.id,
          type:       'cancelled',
          title:      `Annulé${reason ? ' — ' + reason : ''}`,
        })
      } else {
        await logRentalActivity(ctx.authSb, {
          showroomId: rental.showroom_id,
          rentalId:   id,
          actorId:    ctx.user.id,
          type:       'status_change',
          title:      `Statut → ${rentalStatusLabel(target)}`,
        })
      }

      return NextResponse.json({ rental: data })
    }

    // ── B) EDIT ─────────────────────────────────────────────────
    const canFin = FIN_ROLES.has(ctx.role)
    const updates: Record<string, unknown> = {}

    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes).slice(0, 2000) : null
    }

    let newVehicleId = String(rental.rental_vehicle_id)
    let newStart = String(rental.start_date)
    let newEnd   = String(rental.end_date)
    let dateOrVehicleChanged = false
    // Chantier 2: when the vehicle changes, the server is authoritative on
    // daily_rate_snapshot + deposit_amount + total_rental_amount. We capture
    // the new vehicle's frozen rate/caution here and apply them after the
    // canFin manual-override loop, so client-sent financial fields cannot
    // override the vehicle-derived values.
    let vehicleChanged = false
    let newVehicleRate: number | null = null
    let newVehicleDeposit: number | null = null

    if (body.rental_vehicle_id !== undefined && String(body.rental_vehicle_id) !== newVehicleId) {
      // Status gate: the vehicle can only be changed BEFORE pickup, i.e. while
      // the contract is still in the À-confirmer group or just Réservé.
      if (!['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter', 'confirmed'].includes(String(rental.status))) {
        throw new ApiError(400, "Le véhicule ne peut être changé qu'avant la récupération (avant le passage en « En cours »).")
      }
      newVehicleId = String(body.rental_vehicle_id)
      const { data: veh, error: vErr } = await ctx.authSb
        .from('rental_vehicles')
        .select('id, showroom_id, is_active, daily_rate, deposit_amount')
        .eq('id', newVehicleId)
        .maybeSingle()
      if (vErr) throw new ApiError(500, vErr.message)
      if (!veh) throw new ApiError(404, 'Véhicule introuvable.')
      if (!ctx.isSuperAdmin && veh.showroom_id !== ctx.showroomId) throw new ApiError(403, 'Véhicule hors de votre showroom.')
      if (!veh.is_active) throw new ApiError(400, 'Ce véhicule est inactif.')
      updates.rental_vehicle_id = newVehicleId
      newVehicleRate = toNum(veh.daily_rate)
      newVehicleDeposit = toNum(veh.deposit_amount)
      vehicleChanged = true
      dateOrVehicleChanged = true
    }
    if (body.start_date !== undefined) {
      if (!DATE_RX.test(String(body.start_date))) throw new ApiError(400, 'Date de début invalide.')
      newStart = String(body.start_date); updates.start_date = newStart; dateOrVehicleChanged = true
    }
    if (body.end_date !== undefined) {
      if (!DATE_RX.test(String(body.end_date))) throw new ApiError(400, 'Date de fin invalide.')
      newEnd = String(body.end_date); updates.end_date = newEnd; dateOrVehicleChanged = true
    }
    if (body.start_time !== undefined && TIME_RX.test(String(body.start_time))) updates.start_time = String(body.start_time)
    if (body.end_time !== undefined && TIME_RX.test(String(body.end_time))) updates.end_time = String(body.end_time)

    // Manual financial overrides first — vehicle-derived snapshot writes
    // below will OVERRIDE these when the vehicle changed (server-authoritative).
    if (canFin) {
      for (const f of ['deposit_amount', 'total_rental_amount', 'daily_rate_snapshot'] as const) {
        if (body[f] !== undefined) {
          const n = toNum(body[f])
          if (n < 0) throw new ApiError(400, 'Montant invalide.')
          updates[f] = n
        }
      }
    }

    if (dateOrVehicleChanged) {
      if (newEnd < newStart) throw new ApiError(400, 'La date de fin doit être postérieure ou égale au début.')
      const dur = durationDays(newStart, newEnd)
      if (dur == null) throw new ApiError(400, 'Durée invalide.')
      updates.duration_days = dur

      // Server-authoritative snapshots when the vehicle changed.
      if (vehicleChanged && newVehicleRate !== null && newVehicleDeposit !== null) {
        updates.daily_rate_snapshot = newVehicleRate
        updates.deposit_amount      = newVehicleDeposit
      }
      // Total ALWAYS recomputed when dates OR vehicle change — overrides any
      // client value. Mirrors POST /api/rental/rentals + POST /report.
      const rateForRecompute = updates.daily_rate_snapshot !== undefined
        ? toNum(updates.daily_rate_snapshot)
        : toNum(rental.daily_rate_snapshot)
      updates.total_rental_amount = Math.max(0, Math.round(rateForRecompute * dur))

      const { data: overlap, error: rpcErr } = await ctx.authSb.rpc('check_rental_overlap', {
        p_vehicle_id: newVehicleId, p_start: newStart, p_end: newEnd, p_exclude_rental_id: id,
      })
      if (rpcErr) throw new ApiError(500, rpcErr.message)
      if (overlap === true) {
        return NextResponse.json(
          { error: 'unavailable', message: 'Véhicule déjà réservé sur ces dates.' },
          { status: 409 },
        )
      }
    }

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.')

    const { data, error } = await ctx.authSb
      .from('rentals').update(updates).eq('id', id)
      .select('id, contract_number, status, start_date, start_time, end_date, end_time, duration_days, daily_rate_snapshot, total_rental_amount, deposit_amount, notes, rental_vehicle_id, rental_vehicle:rental_vehicles(marque, modele, annee, immatriculation, daily_rate)')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Contrat introuvable.')

    // Best-effort audit trail (Chantier 3) — never fails the edit. One log
    // per edit: vehicle change wins, else a date change; notes-only and
    // financial-only edits are not logged in V1.
    if (vehicleChanged) {
      const rv = (data as Record<string, unknown>).rental_vehicle
      const ve = (Array.isArray(rv) ? rv[0] : rv) as { marque?: string; modele?: string } | null | undefined
      const label = ve ? `${ve.marque ?? ''} ${ve.modele ?? ''}`.trim() : ''
      await logRentalActivity(ctx.authSb, {
        showroomId: rental.showroom_id,
        rentalId:   id,
        actorId:    ctx.user.id,
        type:       'vehicle_changed',
        title:      `Véhicule changé → ${label}`,
      })
    } else if (newStart !== String(rental.start_date) || newEnd !== String(rental.end_date)) {
      await logRentalActivity(ctx.authSb, {
        showroomId: rental.showroom_id,
        rentalId:   id,
        actorId:    ctx.user.id,
        type:       'dates_changed',
        title:      `Dates modifiées → ${formatDateFr(newStart)} → ${formatDateFr(newEnd)}`,
      })
    }

    return NextResponse.json({ rental: data })
  } catch (err) {
    return errorResponse(err)
  }
}
