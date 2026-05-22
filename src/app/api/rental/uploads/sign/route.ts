// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/uploads/sign
// ─────────────────────────────────────────────────────────────────────
// Returns a short-lived signed upload URL for the `rental-documents`
// bucket. The path is always rooted at the caller's showroom_id so
// the storage RLS policies (migration 40) enforce tenant isolation
// even if the client tampers with it.
//
// Body union:
//   { kind: 'cin' | 'permis',     customer_id?: string, file_ext?: string }
//   { kind: 'vehicle_photo',      vehicle_id?:  string, slot?: number,
//                                  file_ext?: string }
//
// `customer_id` / `vehicle_id` are optional during create — the
// uploader passes `temp-{uuid}` so the file is namespaced; the row
// is created later with the resulting `path` persisted on its
// *_url column. Orphaned uploads are GC'd by a future cron.
//
// File extension whitelists (per kind):
//   cin/permis      → jpg / jpeg / png / webp / pdf
//   vehicle_photo   → jpg / jpeg / png / webp     (no pdf)
// Max size is enforced client-side (5 MB).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const KINDS = new Set(['cin', 'permis', 'vehicle_photo', 'rental_signature'])
const DOC_EXT     = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf'])
const PHOTO_EXT   = new Set(['jpg', 'jpeg', 'png', 'webp'])
const SIG_EXT     = new Set(['png', 'jpg', 'jpeg', 'webp'])
const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const kind = String(body.kind ?? '')
    if (!KINDS.has(kind)) {
      throw new ApiError(400, "kind doit être 'cin', 'permis', 'vehicle_photo' ou 'rental_signature'.")
    }

    const fileExt = String(body.file_ext ?? 'jpg').toLowerCase().replace(/^\./, '')
    const allowedExt =
      kind === 'vehicle_photo'    ? PHOTO_EXT :
      kind === 'rental_signature' ? SIG_EXT   : DOC_EXT
    if (!allowedExt.has(fileExt)) {
      throw new ApiError(
        400,
        kind === 'vehicle_photo' || kind === 'rental_signature'
          ? 'Format de fichier non autorisé (jpg/png/webp).'
          : 'Format de fichier non autorisé (jpg/png/webp/pdf).',
      )
    }

    // ── Path construction (per kind) ──────────────────────────
    let path: string
    if (kind === 'rental_signature') {
      // No rental id yet at create time → temp folder. RLS only checks
      // the showroom_id prefix (migration 40).
      const rentalId = body.rental_id ? String(body.rental_id) : null
      if (rentalId && !UUID_RX.test(rentalId)) {
        throw new ApiError(400, 'rental_id invalide.')
      }
      const folder = rentalId ?? `temp-${crypto.randomUUID()}`
      path = `${ctx.showroomId}/rentals/${folder}/signature-${Date.now()}.${fileExt}`
    } else if (kind === 'vehicle_photo') {
      const vehicleId = body.vehicle_id ? String(body.vehicle_id) : null
      if (vehicleId && !UUID_RX.test(vehicleId)) {
        throw new ApiError(400, 'vehicle_id invalide.')
      }
      // Slot index is purely cosmetic in the filename — RLS only
      // checks the showroom_id prefix. Clamp to [1, 99].
      const slotRaw = Number(body.slot ?? 1)
      const slot = Number.isFinite(slotRaw)
        ? Math.max(1, Math.min(99, Math.floor(slotRaw)))
        : 1
      const folder = vehicleId ?? `temp-${crypto.randomUUID()}`
      const filename = `photo-${slot}-${Date.now()}.${fileExt}`
      path = `${ctx.showroomId}/vehicles/${folder}/${filename}`
    } else {
      // cin / permis
      const customerId = body.customer_id ? String(body.customer_id) : null
      if (customerId && !UUID_RX.test(customerId)) {
        throw new ApiError(400, 'customer_id invalide.')
      }
      const folder = customerId ?? `temp-${crypto.randomUUID()}`
      const filename = `${kind}-${Date.now()}.${fileExt}`
      path = `${ctx.showroomId}/customers/${folder}/${filename}`
    }

    const { data, error } = await ctx.authSb.storage
      .from('rental-documents')
      .createSignedUploadUrl(path)
    if (error) throw new ApiError(500, error.message)
    if (!data) throw new ApiError(500, 'Signed URL indisponible.')

    return NextResponse.json({
      upload_url: data.signedUrl,
      token:      data.token,
      path:       data.path,
      expires_in: 5 * 60,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
