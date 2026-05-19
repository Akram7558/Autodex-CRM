// ─────────────────────────────────────────────────────────────────────
// GET /api/rental/uploads/read?path=<storage path>
// ─────────────────────────────────────────────────────────────────────
// Resolves a private `rental-documents` storage path into a short-
// lived signed read URL. Clients usually generate these on their own
// via `supabase.storage…createSignedUrl()` (the bucket RLS allows
// it for the caller's showroom), but this route exists for:
//   • server components / server actions that need a URL synchronously
//   • any future server-side use case (PDF generation, email previews…)
//
// Defense in depth: the path MUST start with `{user_showroom_id}/`
// before we hand it to supabase storage, so even a compromised RLS
// can't be exploited via this route.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const EXPIRY_SECONDS = 60 * 60  // 1 hour

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const path = req.nextUrl.searchParams.get('path')?.trim() ?? ''
    if (!path) throw new ApiError(400, 'path requis.')

    // Super admins can read across tenants; everyone else is locked
    // to their showroom_id folder.
    if (!ctx.isSuperAdmin) {
      const expectedPrefix = `${ctx.showroomId}/`
      if (!path.startsWith(expectedPrefix)) {
        throw new ApiError(403, 'Chemin hors de votre showroom.')
      }
    }

    const { data, error } = await ctx.authSb.storage
      .from('rental-documents')
      .createSignedUrl(path, EXPIRY_SECONDS)
    if (error) throw new ApiError(500, error.message)
    if (!data?.signedUrl) throw new ApiError(404, 'Fichier introuvable.')

    return NextResponse.json({
      url:        data.signedUrl,
      expires_in: EXPIRY_SECONDS,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
