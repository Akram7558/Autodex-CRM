// ─────────────────────────────────────────────────────────────────────
// Algerian phone normalization.
// ─────────────────────────────────────────────────────────────────────
// Always produces +213XXXXXXXXX (12 digits after the plus) so that
// duplicate-detection and tel:/wa.me URL building work consistently.
// Throws when the input can't be coerced into a valid AR number.
// ─────────────────────────────────────────────────────────────────────

const VALID_RX = /^\+213[5-7]\d{8}$/

export class PhoneNormalizeError extends Error {}

/** Normalize an Algerian phone string to `+213XXXXXXXXX`. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) throw new PhoneNormalizeError('Téléphone requis.')
  // Strip whitespace, dashes, parens, dots.
  const trimmed = String(input).replace(/[\s(). -]/g, '')
  if (!trimmed) throw new PhoneNormalizeError('Téléphone requis.')

  let candidate = trimmed
  if (candidate.startsWith('00213'))      candidate = '+213' + candidate.slice(5)
  else if (candidate.startsWith('+213'))  candidate = candidate
  else if (candidate.startsWith('213'))   candidate = '+' + candidate
  else if (candidate.startsWith('0'))     candidate = '+213' + candidate.slice(1)
  else throw new PhoneNormalizeError('Téléphone invalide. Utilisez le format 0X XX XX XX XX.')

  if (!VALID_RX.test(candidate)) {
    throw new PhoneNormalizeError('Téléphone invalide. Utilisez le format 0X XX XX XX XX.')
  }
  return candidate
}

/** Convenience: normalize and return null instead of throwing. */
export function tryNormalizePhone(input: string | null | undefined): string | null {
  try { return normalizePhone(input) } catch { return null }
}
