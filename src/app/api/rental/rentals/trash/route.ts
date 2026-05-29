// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/rentals/trash
// ─────────────────────────────────────────────────────────────────────
// Soft-delete ("corbeille", migration 51) a batch of CANCELLED contracts.
// Body: { ids: string[] }.
//
// Server-authoritative:
//   • requireShowroomMember + role guard owner/manager/super_admin only
//     (closer / prospecteur → 403).
//   • Each id is trashed only if it belongs to the caller's showroom AND
//     has status='cancelled'. Ids not matching (wrong status, other
//     showroom, unknown) are silently skipped — never an error.
//   • Sets deleted_at = now(); already-trashed rows are skipped via the
//     deleted_at IS NULL guard so the count reflects rows actually moved.
//   • No rental_activities entry is written for a trash.
//
// Recovery is DB-only (set deleted_at back to NULL) — there is no restore
// UI and no permanent-delete path.
//
// Returns { trashed: number }.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['owner', 'manager', 'super_admin'])
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const rawIds = Array.isArray(body.ids) ? body.ids : []
    const ids = Array.from(
      new Set(
        rawIds
          .map((v) => String(v))
          .filter((v) => UUID_RX.test(v)),
      ),
    )
    if (ids.length === 0) throw new ApiError(400, 'Aucun identifiant valide fourni.')

    // RLS-aware update via authSb. Only cancelled, not-already-trashed rows
    // are moved; for tenants RLS already scopes to their showroom, and we
    // also scope explicitly when a showroom is resolved (belt + braces).
    let upd = ctx.authSb
      .from('rentals')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'cancelled')
      .is('deleted_at', null)
    if (ctx.showroomId) upd = upd.eq('showroom_id', ctx.showroomId)

    const { data, error } = await upd.select('id')
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ trashed: (data ?? []).length })
  } catch (err) {
    return errorResponse(err)
  }
}
