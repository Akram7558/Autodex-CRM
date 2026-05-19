// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/uploads/sign
// ─────────────────────────────────────────────────────────────────────
// Returns a short-lived signed upload URL for the `rental-documents`
// bucket. The path is rooted at the caller's showroom_id so the
// storage RLS policies enforce tenant isolation even if the client
// tampers with it.
//
// Body:
//   { kind: 'cin' | 'permis', customer_id?: string, file_ext?: string }
//
// customer_id is optional — during the wizard the client passes a
// crypto.randomUUID() and persists the resulting path; the customer
// row is created later with the path stored on the appropriate
// *_photo_url column. Orphaned uploads can be GC'd later.
//
// File extensions whitelisted: jpg/jpeg/png/webp/pdf.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf'])
const ALLOWED_KINDS = new Set(['cin', 'permis'])
const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const kind = String(body.kind ?? '')
    if (!ALLOWED_KINDS.has(kind)) {
      throw new ApiError(400, "kind doit être 'cin' ou 'permis'.")
    }
    const fileExt = String(body.file_ext ?? 'jpg').toLowerCase().replace(/^\./, '')
    if (!ALLOWED_EXT.has(fileExt)) {
      throw new ApiError(400, 'Format de fichier non autorisé (jpg/png/webp/pdf).')
    }
    const customerId = body.customer_id ? String(body.customer_id) : null
    if (customerId && !UUID_RX.test(customerId)) {
      throw new ApiError(400, 'customer_id invalide.')
    }

    // Compose the path. Either a real customer_id (edit flow) or a
    // temp UUID (create flow — orphans cleaned later).
    const folder = customerId ?? `temp-${crypto.randomUUID()}`
    const filename = `${kind}-${Date.now()}.${fileExt}`
    const path = `${ctx.showroomId}/customers/${folder}/${filename}`

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
