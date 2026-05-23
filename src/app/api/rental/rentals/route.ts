// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/rentals
// ─────────────────────────────────────────────────────────────────────
// Creates a rental contract as 'draft' (booking wizard step 4).
//
// Everything is RE-VALIDATED server-side (the client total is never
// trusted): vehicle + customer belong to the showroom, dates valid and
// duration within rental_settings min/max, pricing re-derived from the
// vehicle's current daily_rate, and the availability check
// (check_rental_overlap RPC) is RE-RUN immediately before insert to avoid
// a race with a concurrent booking → 409 if it just became unavailable.
//
// contract_number: LOC-YYYY-NNNN, NNNN = per-showroom count this year + 1.
// The column has a GLOBAL UNIQUE constraint and no DB sequence exists, so
// on a 23505 collision we bump NNNN and retry.
//
// Signature: the client uploads the PNG via the signed-upload flow and
// passes the resulting storage PATH as `signature_path`. We store it in
// rentals.signature_url (migration 43) and set signed_at. If that column
// is absent we degrade gracefully — strip signature_url, keep signed_at.
//
// assigned_to = creator (self): satisfies the closer RLS branch
// (assigned_to = auth.uid()); owner/manager default to the creator too.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/
const TIME_RX = /^\d{2}:\d{2}$/
const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

function durationDays(start: string, end: string): number | null {
  const a = new Date(start + 'T00:00:00')
  const b = new Date(end + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (diff < 0) return null
  return Math.max(1, diff)
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const vehicleId  = String(body.rental_vehicle_id ?? '')
    const customerId = String(body.customer_id ?? '')
    const startDate  = String(body.start_date ?? '')
    const endDate    = String(body.end_date ?? '')
    const startTime  = TIME_RX.test(String(body.start_time ?? '')) ? String(body.start_time) : '09:00'
    const endTime    = TIME_RX.test(String(body.end_time ?? '')) ? String(body.end_time) : '18:00'
    const discountType = body.discount_type === 'percent' ? 'percent' : 'amount'
    const discountValueRaw = Number(body.discount_value ?? 0)
    const discountValue = Number.isFinite(discountValueRaw) && discountValueRaw > 0 ? discountValueRaw : 0
    const depositRaw = Number(body.deposit_amount ?? 0)
    const notes = body.notes ? String(body.notes).slice(0, 2000) : null
    const signaturePath = body.signature_path ? String(body.signature_path) : null
    const fromProspectId = body.from_prospect_id ? String(body.from_prospect_id) : null

    if (!vehicleId)  throw new ApiError(400, 'Véhicule requis.')
    if (!customerId) throw new ApiError(400, 'Client requis.')
    if (!DATE_RX.test(startDate) || !DATE_RX.test(endDate)) {
      throw new ApiError(400, 'Dates invalides (format AAAA-MM-JJ).')
    }
    if (endDate < startDate) throw new ApiError(400, 'La date de fin doit être postérieure ou égale au début.')
    const dur = durationDays(startDate, endDate)
    if (dur == null) throw new ApiError(400, 'Durée invalide.')

    // ── Vehicle (RLS) ──────────────────────────────────────────
    const { data: veh, error: vErr } = await ctx.authSb
      .from('rental_vehicles')
      .select('id, showroom_id, daily_rate, deposit_amount, is_active')
      .eq('id', vehicleId)
      .maybeSingle()
    if (vErr) throw new ApiError(500, vErr.message)
    if (!veh) throw new ApiError(404, 'Véhicule introuvable.')
    if (!ctx.isSuperAdmin && veh.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Véhicule hors de votre showroom.')
    }

    // ── Customer (RLS) ─────────────────────────────────────────
    const { data: cust, error: cErr } = await ctx.authSb
      .from('rental_customers')
      .select('id, showroom_id')
      .eq('id', customerId)
      .maybeSingle()
    if (cErr) throw new ApiError(500, cErr.message)
    if (!cust) throw new ApiError(404, 'Client introuvable.')
    if (!ctx.isSuperAdmin && cust.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Client hors de votre showroom.')
    }

    // ── Duration vs settings ───────────────────────────────────
    const { data: settings } = await ctx.authSb
      .from('rental_settings')
      .select('min_rental_days, max_rental_days')
      .eq('showroom_id', ctx.showroomId)
      .maybeSingle()
    const minDays = Number(settings?.min_rental_days ?? 1) || 1
    const maxDays = Number(settings?.max_rental_days ?? 365) || 365
    if (dur < minDays) throw new ApiError(400, `Durée minimale : ${minDays} jour(s).`)
    if (dur > maxDays) throw new ApiError(400, `Durée maximale : ${maxDays} jours.`)

    // ── Pricing (server-derived) ───────────────────────────────
    const dailyRate = Number(veh.daily_rate) || 0
    const basePrice = Math.max(0, Math.round(dailyRate * dur))
    const rawDiscount = discountType === 'percent' ? basePrice * (discountValue / 100) : discountValue
    const discountAmount = Math.max(0, Math.min(basePrice, Math.round(rawDiscount)))
    const total = Math.max(0, basePrice - discountAmount)
    const deposit = Number.isFinite(depositRaw) && depositRaw >= 0
      ? Math.round(depositRaw)
      : Math.round(Number(veh.deposit_amount) || 0)

    // ── Availability re-check right before insert (race guard) ──
    const { data: overlap, error: rpcErr } = await ctx.authSb.rpc('check_rental_overlap', {
      p_vehicle_id: vehicleId, p_start: startDate, p_end: endDate,
    })
    if (rpcErr) throw new ApiError(500, rpcErr.message)
    if (overlap === true) {
      return NextResponse.json(
        { error: 'unavailable', message: 'Ce véhicule vient d\'être réservé pour ces dates. Choisissez d\'autres dates.' },
        { status: 409 },
      )
    }

    const assignedTo = ctx.user.id
    const signedAt = signaturePath ? new Date().toISOString() : null

    const baseRow = {
      showroom_id:         ctx.showroomId,
      rental_vehicle_id:   vehicleId,
      customer_id:         customerId,
      assigned_to:         assignedTo,
      created_by:          ctx.user.id,
      start_date:          startDate,
      start_time:          startTime,
      end_date:            endDate,
      end_time:            endTime,
      duration_days:       dur,
      daily_rate_snapshot: dailyRate,
      total_rental_amount: total,
      deposit_amount:      deposit,
      status:              'draft' as const,
      notes,
    }

    // ── contract_number generation + resilient insert ──────────
    const year = new Date().getFullYear()
    const { count } = await ctx.authSb
      .from('rentals')
      .select('id', { count: 'exact', head: true })
      .eq('showroom_id', ctx.showroomId)
      .gte('created_at', `${year}-01-01`)
    let seq = (count ?? 0) + 1
    let includeSignature = !!signaturePath
    let lastErr: { code?: string; message?: string } | null = null

    for (let attempt = 0; attempt < 12; attempt++) {
      const contractNumber = `LOC-${year}-${String(seq).padStart(4, '0')}`
      const row: Record<string, unknown> = { ...baseRow, contract_number: contractNumber }
      if (signaturePath) row.signed_at = signedAt
      if (includeSignature) row.signature_url = signaturePath

      const { data, error } = await ctx.authSb
        .from('rentals')
        .insert([row])
        .select('id, contract_number')
        .single()

      if (!error) {
        // Link the originating prospect, if any. Best-effort: the contract
        // is the source of truth — a failed/no-match link must NOT fail the
        // rental creation. Scoped to the caller's showroom and only when the
        // prospect isn't already converted.
        let prospectLinked = false
        if (fromProspectId) {
          const { data: linked, error: linkErr } = await ctx.authSb
            .from('rental_prospects')
            .update({ status: 'convertie', converted_rental_id: data.id })
            .eq('id', fromProspectId)
            .eq('showroom_id', ctx.showroomId)
            .neq('status', 'convertie')
            .select('id')
            .maybeSingle()
          prospectLinked = !linkErr && !!linked
        }
        return NextResponse.json({ rental: data, prospect_linked: prospectLinked }, { status: 201 })
      }
      lastErr = error

      // contract_number already taken (global UNIQUE) → bump and retry.
      if (error.code === '23505') { seq += 1; continue }

      // signature_url column absent (migration 43 not run) → drop it,
      // keep signed_at, retry the same number.
      const msg = (error.message ?? '').toLowerCase()
      if (includeSignature && (error.code === '42703' || error.code === 'PGRST204' || msg.includes('signature_url'))) {
        includeSignature = false
        continue
      }
      break
    }

    throw new ApiError(400, lastErr?.message ?? 'Création du contrat échouée.')
  } catch (err) {
    return errorResponse(err)
  }
}
