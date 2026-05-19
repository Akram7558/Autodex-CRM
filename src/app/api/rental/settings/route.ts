// ─────────────────────────────────────────────────────────────────────
// /api/rental/settings
//   GET   — rental_settings for the caller's showroom (auto-init on
//           insert-into-showrooms via migration_39 trigger)
//   PATCH — owner only
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

function asNumber(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function asInt(v: unknown): number | null {
  const n = asNumber(v)
  return n != null && Number.isInteger(n) ? n : null
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')

    const { data, error } = await ctx.authSb
      .from('rental_settings')
      .select('*')
      .eq('showroom_id', ctx.showroomId)
      .maybeSingle()
    if (error) throw new ApiError(500, error.message)

    // Defensive: if the migration-39 trigger backfill missed this
    // showroom, return defaults so the UI never sees a 404. The
    // owner can still PATCH and the row will be created.
    if (!data) {
      return NextResponse.json({
        settings: {
          id:                       null,
          showroom_id:              ctx.showroomId,
          late_return_hourly_fee:   1000,
          min_rental_days:          1,
          max_rental_days:          90,
          fuel_charge_per_quarter:  500,
          default_contract_terms:   null,
        },
      })
    }
    return NextResponse.json({ settings: data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner peut modifier les tarifs.')
    }

    const body = await req.json().catch(() => ({}))
    const b = (body ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}

    if (b.late_return_hourly_fee !== undefined) {
      const n = asNumber(b.late_return_hourly_fee)
      if (n == null || n < 0) throw new ApiError(400, 'Frais horaire invalide.')
      updates.late_return_hourly_fee = n
    }
    if (b.min_rental_days !== undefined) {
      const n = asInt(b.min_rental_days)
      if (n == null || n < 1) throw new ApiError(400, 'Durée min. invalide.')
      updates.min_rental_days = n
    }
    if (b.max_rental_days !== undefined) {
      const n = asInt(b.max_rental_days)
      if (n == null || n < 1 || n > 365) throw new ApiError(400, 'Durée max. invalide.')
      updates.max_rental_days = n
    }
    if (b.fuel_charge_per_quarter !== undefined) {
      const n = asNumber(b.fuel_charge_per_quarter)
      if (n == null || n < 0) throw new ApiError(400, 'Frais carburant invalide.')
      updates.fuel_charge_per_quarter = n
    }
    if (b.default_contract_terms !== undefined) {
      updates.default_contract_terms = b.default_contract_terms
        ? String(b.default_contract_terms)
        : null
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.')
    }

    // Upsert: create the row if the backfill missed this showroom.
    const { data, error } = await ctx.authSb
      .from('rental_settings')
      .upsert(
        { showroom_id: ctx.showroomId, ...updates },
        { onConflict: 'showroom_id' },
      )
      .select('*')
      .single()
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ settings: data })
  } catch (err) {
    return errorResponse(err)
  }
}
