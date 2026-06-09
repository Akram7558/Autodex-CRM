// ─────────────────────────────────────────────────────────────────────
// Notifications — shared types + duration helpers.
// ─────────────────────────────────────────────────────────────────────
// `ComputedAlert` is a DERIVED alert computed on the fly (never stored):
// the 4 rules (lead_ignored / lead_stagnant / stock_rupture /
// vendor_inactive) used to be INSERTed by /api/check-alerts with
// time-bucketed dedupe_keys, which accumulated thousands of rows. They are
// now computed by GET /api/check-alerts and rendered ephemerally — they
// auto-resolve the moment the underlying lead/stock is acted on.
//
// `formatDuration` / `formatAgo` produce compact, human-friendly French
// durations (days/weeks/months) — never raw hours like "822 h".
// ─────────────────────────────────────────────────────────────────────

import type { NotificationType } from '@/lib/types'

export type ComputedAlert = {
  /** Stable React key, e.g. `lead_ignored:${lead_id}`. */
  key: string
  type: NotificationType
  title: string
  message: string
  lead_id: string | null
  vehicle_id: string | null
  /** ISO source timestamp for a LIVE duration (null = no duration shown). */
  since: string | null
  /** Deep-link target for click. */
  href: string | null
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * Compact French duration between `fromISO` and now. Rolls up so it never
 * shows raw hours for old items:
 *   < 1h → "à l'instant" / "12 min"
 *   < 1d → "5 h"
 *   < 7d → "2 j 6 h" / "3 j"
 *   < 8 weeks → "3 sem"
 *   else → "2 mois"
 */
export function formatDuration(fromISO: string | null | undefined, nowMs: number = Date.now()): string {
  if (!fromISO) return ''
  const then = new Date(fromISO).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Math.max(0, nowMs - then)

  if (diff < HOUR) {
    const m = Math.floor(diff / MIN)
    return m <= 1 ? "à l'instant" : `${m} min`
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} h`
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY)
    const h = Math.floor((diff % DAY) / HOUR)
    return h > 0 ? `${d} j ${h} h` : `${d} j`
  }
  if (diff < 8 * WEEK) {
    return `${Math.floor(diff / WEEK)} sem`
  }
  return `${Math.floor(diff / (30 * DAY))} mois`
}

/** Prefixed form for timestamp lines, e.g. "il y a 2 j 6 h". */
export function formatAgo(fromISO: string | null | undefined, nowMs: number = Date.now()): string {
  const d = formatDuration(fromISO, nowMs)
  if (!d) return ''
  if (d === "à l'instant") return d
  return `il y a ${d}`
}

export type RecencyGroup<T> = { label: string; items: T[] }

/**
 * Bucket items into recency groups, newest-first within each, empty groups
 * dropped. Boundaries (local time):
 *   Aujourd'hui   = today (>= local midnight)
 *   Cette semaine = the 7 days before today
 *   Plus ancien   = older
 * `getTs` returns the item's source timestamp (stored → created_at, computed
 * → since). A missing/invalid timestamp is treated as "now" (a live alert),
 * so it sorts into Aujourd'hui at the top.
 */
export function bucketByRecency<T>(
  items: T[],
  getTs: (item: T) => string | null | undefined,
  nowMs: number = Date.now(),
): RecencyGroup<T>[] {
  const todayStart = new Date(nowMs)
  todayStart.setHours(0, 0, 0, 0)
  const today0 = todayStart.getTime()
  const week0 = today0 - 7 * DAY

  const tsOf = (it: T): number => {
    const s = getTs(it)
    if (!s) return nowMs
    const t = new Date(s).getTime()
    return Number.isFinite(t) ? t : nowMs
  }

  const today: T[] = [], week: T[] = [], older: T[] = []
  for (const it of items) {
    const t = tsOf(it)
    if (t >= today0) today.push(it)
    else if (t >= week0) week.push(it)
    else older.push(it)
  }
  const byNewest = (a: T, b: T) => tsOf(b) - tsOf(a)
  today.sort(byNewest); week.sort(byNewest); older.sort(byNewest)

  return [
    { label: "Aujourd'hui", items: today },
    { label: 'Cette semaine', items: week },
    { label: 'Plus ancien', items: older },
  ].filter((g) => g.items.length > 0)
}
