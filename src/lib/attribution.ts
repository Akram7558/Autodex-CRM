// ─────────────────────────────────────────────────────────────────────
// First-touch acquisition attribution.
// ─────────────────────────────────────────────────────────────────────
// Capture UTM params + ad click-ids (fbclid / ttclid / gclid) on the first
// landing, persist them in a first-party cookie (90 days), and forward them
// at /register so the trial signup's super_admin_prospects.source can be
// derived (Meta / TikTok / other / organic).
//
// deriveSource / formatAttributionNote / parseAttributionFromSearch are PURE
// (no browser globals) so the register API route can import them server-side.
// The cookie helpers are client-only and guarded by `typeof document`.
//
// HARD CONSTRAINT: super_admin_prospects.source has a CHECK constraint —
// deriveSource MUST only ever return one of the 6 allowed values; a raw
// utm_source would fail the CHECK and lose the (best-effort) prospect insert.
// Campaign detail therefore goes into the `notes` text field, not `source`.
// ─────────────────────────────────────────────────────────────────────

export const ATTRIBUTION_COOKIE = 'adx_attr'
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60 // 90 days, in seconds
const VALUE_CAP = 200                    // clamp each captured value

export type Attribution = {
  utm_source?:   string
  utm_medium?:   string
  utm_campaign?: string
  utm_content?:  string
  utm_term?:     string
  fbclid?:       string
  ttclid?:       string
  gclid?:        string
  landed_at?:    string // ISO, set when first captured
}

// The 6 values allowed by the super_admin_prospects.source CHECK constraint.
export type ProspectSource =
  | 'facebook_ads' | 'tiktok_ads' | 'landing_page' | 'manuel' | 'reference' | 'autre'

const CAPTURE_KEYS: (keyof Attribution)[] = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'ttclid', 'gclid',
]

/** Extract only the known attribution keys from a URL query string. Pure. */
export function parseAttributionFromSearch(search: string): Attribution {
  const out: Attribution = {}
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  } catch {
    return out
  }
  for (const k of CAPTURE_KEYS) {
    const v = params.get(k)
    if (v && v.trim()) out[k] = v.trim().slice(0, VALUE_CAP)
  }
  return out
}

function hasAnyValue(attr: Attribution): boolean {
  return CAPTURE_KEYS.some((k) => !!attr[k])
}

/**
 * Coerce arbitrary/untrusted input (forged POST body, hand-edited cookie) into
 * a clean Attribution: only the known keys, only NON-EMPTY STRING values,
 * trimmed + length-capped. Drops everything else. Pure — safe to call on the
 * server ingest path so downstream deriveSource/formatAttributionNote never
 * see a non-string field.
 */
export function sanitizeAttribution(raw: unknown): Attribution {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: Attribution = {}
  for (const k of CAPTURE_KEYS) {
    const v = src[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, VALUE_CAP)
  }
  return out
}

// ── Client-only cookie helpers (guarded) ────────────────────────────────
function readCookieRaw(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + ATTRIBUTION_COOKIE + '=([^;]*)'))
  return m ? m[1] : null
}

/**
 * FIRST-TOUCH capture: if the URL carries attribution AND no cookie exists yet,
 * write it. Never overwrites an existing cookie (so the original ad click wins
 * over later organic visits). Client-only; no-op on the server.
 */
export function captureFirstTouch(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (readCookieRaw()) return // first-touch — keep the original
  const attr = parseAttributionFromSearch(window.location.search)
  if (!hasAnyValue(attr)) return
  attr.landed_at = new Date().toISOString()
  try {
    const value = encodeURIComponent(JSON.stringify(attr))
    document.cookie = `${ATTRIBUTION_COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
  } catch { /* ignore */ }
}

/** Read the persisted attribution cookie. Client-only; {} if absent/invalid. */
export function readAttribution(): Attribution {
  const raw = readCookieRaw()
  if (!raw) return {}
  try {
    return sanitizeAttribution(JSON.parse(decodeURIComponent(raw)))
  } catch { /* ignore */ }
  return {}
}

// ── Pure derivation (server + client) ───────────────────────────────────
/**
 * Map attribution → a CHECK-valid `source`. TikTok wins over Meta when both
 * signals are present. Defaults to 'landing_page'. NEVER returns a raw utm or
 * 'manuel'/'reference' (those are reserved for manual back-office entry).
 */
export function deriveSource(attr: Attribution): ProspectSource {
  // Defensive: callers should sanitize, but never assume string-typed fields
  // (a forged body / edited cookie could carry non-strings → .toLowerCase()
  // would throw and, being upstream of the best-effort insert, abort signup).
  const has = (v: unknown): boolean => typeof v === 'string' && v.length > 0
  const us = (typeof attr.utm_source === 'string' ? attr.utm_source : '').toLowerCase()
  if (has(attr.ttclid) || /tiktok/i.test(us)) return 'tiktok_ads'
  if (has(attr.fbclid) || /facebook|fb|meta|instagram|ig/i.test(us)) return 'facebook_ads'
  if (has(attr.utm_source) || has(attr.utm_medium) || has(attr.utm_campaign) || has(attr.gclid)) return 'autre'
  return 'landing_page'
}

/** Human-readable one-liner for the `notes` field. '' when nothing to show. */
export function formatAttributionNote(attr: Attribution): string {
  const parts: string[] = []
  if (attr.utm_source)   parts.push(`source: ${attr.utm_source}`)
  if (attr.utm_campaign) parts.push(`campagne: ${attr.utm_campaign}`)
  if (attr.utm_medium)   parts.push(`medium: ${attr.utm_medium}`)
  if (attr.utm_content)  parts.push(`contenu: ${attr.utm_content}`)
  if (attr.utm_term)     parts.push(`terme: ${attr.utm_term}`)
  if (attr.fbclid)       parts.push(`fbclid: ${attr.fbclid}`)
  if (attr.ttclid)       parts.push(`ttclid: ${attr.ttclid}`)
  if (attr.gclid)        parts.push(`gclid: ${attr.gclid}`)
  return parts.length ? `Attribution — ${parts.join(' | ')}` : ''
}
