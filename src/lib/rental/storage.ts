// ─────────────────────────────────────────────────────────────────────
// Rental module — shared Supabase Storage helpers (client-side).
// ─────────────────────────────────────────────────────────────────────
// The `rental-documents` bucket is private. Both reads and writes go
// through short-lived signed URLs:
//
//   uploadViaSignedUrl(file, kind, opts)  — POST /uploads/sign, then
//                                            uploadToSignedUrl. Returns
//                                            the storage path stored
//                                            on the row.
//
//   getSignedReadUrl(path)                — supabase-js client-side
//                                            createSignedUrl(1h). The
//                                            bucket RLS allows it.
//
// Used by:
//   • DocumentUploader (cin / permis)            — uses uploadViaSignedUrl
//   • VehiclePhotoUploader (vehicle photos)      — uses uploadViaSignedUrl
//   • RentalCustomerDetail (cin / permis preview)— uses getSignedReadUrl
//   • RentalVehiclesPage (first photo on card)   — uses getSignedReadUrl
// ─────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'

export const RENTAL_BUCKET = 'rental-documents'
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB

export type UploadKind = 'cin' | 'permis' | 'vehicle_photo'

type SignResponse = {
  upload_url: string
  token:      string
  path:       string
  expires_in: number
}

export type UploadOpts =
  | { kind: 'cin' | 'permis';   customer_id?: string | null; file_ext: string }
  | { kind: 'vehicle_photo';    vehicle_id?:  string | null; slot?: number; file_ext: string }

/**
 * Asks the server for a signed upload URL and pushes the file to it.
 * Returns the storage path the caller should persist on the row.
 */
export async function uploadViaSignedUrl(file: File, opts: UploadOpts): Promise<string> {
  // 1. Ask server for a signed upload URL.
  const signRes = await fetch('/api/rental/uploads/sign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(opts),
  })
  const sign = (await signRes.json().catch(() => ({}))) as SignResponse | { error: string }
  if (!signRes.ok || !('upload_url' in sign)) {
    const msg = (sign as { error?: string })?.error ?? 'sign_failed'
    throw new Error(msg)
  }

  // 2. Push the file to the signed URL via supabase-js (no manual
  //    Authorization-header juggling).
  const upload = await supabase.storage
    .from(RENTAL_BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, file, {
      contentType: file.type || undefined,
      upsert: true,
    })
  if (upload.error) throw new Error(upload.error.message)
  return sign.path
}

/**
 * Returns a 1-hour signed read URL for a private storage path.
 * The bucket RLS allows authenticated tenants to do this directly —
 * no server round-trip required.
 */
export async function getSignedReadUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(RENTAL_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/** Cheap file extension extractor (lowercased, no dot). */
export function extOf(fileOrName: File | string): string {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** Validate a file is within the rental upload constraints. Returns the
 *  message key on failure, null on success. */
export function validatePhotoFile(file: File): null | 'rental.upload.error_size' | 'rental.upload.error_format' {
  if (file.size > MAX_UPLOAD_BYTES) return 'rental.upload.error_size'
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extOf(file))) {
    return 'rental.upload.error_format'
  }
  return null
}
