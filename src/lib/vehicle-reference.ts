// Auto-generated vehicle reference code: "[MARQUE 3 letters]-[ANNEE]-[4 random digits]"
// e.g. REN-2023-4821, TOY-2022-9134, GEE-2024-0371.

import { supabase } from '@/lib/supabase'

function brandPrefix(brand: string): string {
  // Strip diacritics + non-letters, uppercase, take first 3 chars.
  const cleaned = brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
  if (cleaned.length >= 3) return cleaned.slice(0, 3)
  return (cleaned + 'XXX').slice(0, 3)
}

function rand4(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

/**
 * Build one candidate reference. Caller is responsible for uniqueness.
 */
export function buildVehicleReference(brand: string, year: number | null): string {
  const yyyy = year ?? new Date().getFullYear()
  return `${brandPrefix(brand)}-${yyyy}-${rand4()}`
}

/**
 * Generate a reference that doesn't collide with any existing vehicle.
 * Tries up to 8 random suffixes before giving up.
 */
export async function generateUniqueVehicleReference(
  brand: string,
  year: number | null
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = buildVehicleReference(brand, year)
    const { data, error } = await supabase
      .from('vehicles')
      .select('id')
      .eq('reference', candidate)
      .limit(1)
    // If the column doesn't exist yet, just return the candidate — the caller
    // will get a clear error from the insert/update.
    if (error) return candidate
    if (!data || data.length === 0) return candidate
  }
  // Last-resort fallback: timestamp-based suffix.
  const yyyy = year ?? new Date().getFullYear()
  return `${brandPrefix(brand)}-${yyyy}-${String(Date.now()).slice(-4)}`
}
