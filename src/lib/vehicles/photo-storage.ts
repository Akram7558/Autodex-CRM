// ─────────────────────────────────────────────────────────────────────
// Sales-vehicle photo storage adapter.
// ─────────────────────────────────────────────────────────────────────
// Unlike the rental module (private `rental-documents` bucket + signed
// URLs), the sales `vehicules` bucket is PUBLIC (migration_04) and the
// public catalog (/s/[slug]) reads these URLs directly for anonymous
// visitors. So we upload straight from the client and persist the PUBLIC
// URL — exactly the model the legacy single `image_url` already used.
//
// Plugs into the shared <VehiclePhotoUploader> via its `adapter` prop.
// ─────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import type { PhotoStorageAdapter } from '@/components/rental/VehiclePhotoUploader'

export const SALES_VEHICLE_BUCKET = 'vehicules'

/**
 * Build a storage adapter for SALES vehicle photos. `vehicleId` namespaces
 * the upload path; on create (no id yet) a `temp-*` folder is used — the
 * resulting public URL works regardless of folder.
 */
export function salesPhotoAdapter(vehicleId?: string | null): PhotoStorageAdapter {
  const folder = vehicleId && vehicleId.length > 0 ? vehicleId : `temp-${crypto.randomUUID()}`
  return {
    async upload(file, { index, ext }) {
      const path = `${folder}/${Date.now()}-${index}.${ext}`
      const { error } = await supabase.storage
        .from(SALES_VEHICLE_BUCKET)
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from(SALES_VEHICLE_BUCKET).getPublicUrl(path)
      return data.publicUrl
    },
    // The stored value is already a public URL — render it as-is.
    resolveUrl: (stored) => stored,
  }
}
