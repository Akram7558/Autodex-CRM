// ─────────────────────────────────────────────────────────────────────
// Shared rate limiting for public (unauthenticated) write routes
// ─────────────────────────────────────────────────────────────────────
// Replaces the four duplicated in-memory limiters that used to live in
// register / prospects-capture / public-rental-prospects / catalog-order.
// Those were bypassable twice over: the bucket key was the LEFTMOST
// x-forwarded-for token (attacker-controlled) and the Map lived in a
// single lambda's memory (so it reset on cold start and was not shared
// between concurrent instances).
//
// Design:
//   • Key on a platform-trusted client IP (never xff[0]).
//   • Durable sliding window in Upstash Redis, shared across instances.
//   • FAIL-OPEN: if Upstash is unconfigured or erroring, we never block
//     and never throw — the request proceeds, protected only by the
//     in-memory net. Rate-limit infrastructure must not take the site
//     down or 500 a customer's form submission.
//   • The in-memory net ALWAYS runs, so a single hot instance is still
//     capped when Upstash is unavailable.
// ─────────────────────────────────────────────────────────────────────

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * Platform-trusted client IP.
 *
 * Order matters: `x-vercel-forwarded-for` is written by Vercel's edge and
 * overwrites anything the client sent, so it cannot be spoofed.
 * `x-real-ip` is likewise platform-set. Only as a last resort do we read
 * `x-forwarded-for`, and then the LAST token — the hop appended by the
 * proxy — never `[0]`, which is whatever the caller chose to send.
 */
export function getClientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')?.trim()
  if (vercel) return vercel

  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real

  const xff = req.headers.get('x-forwarded-for') ?? ''
  const last = xff.split(',').at(-1)?.trim()
  if (last) return last

  return 'unknown'
}

export type RateRule = { limit: number; windowSeconds: number }

// Hard ceiling on how long a rate-limit check may add to a request. If
// Upstash is slow or unreachable we abandon it and use the in-memory
// verdict: a public form must never hang behind rate-limit infra.
const UPSTASH_TIMEOUT_MS = 1000

// ── In-memory net (per lambda instance) ──────────────────────────────
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function memoryAllows(key: string, rule: RateRule): boolean {
  const now = Date.now()
  const cur = buckets.get(key)
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 })
    // Opportunistic cleanup so the map can't grow unbounded on a
    // long-lived instance.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
    }
    return true
  }
  if (cur.count >= rule.limit) return false
  cur.count += 1
  return true
}

// ── Upstash (lazy, optional) ─────────────────────────────────────────
let redis: Redis | null = null
let redisResolved = false
let warnedMissing = false

function getRedis(): Redis | null {
  if (redisResolved) return redis
  redisResolved = true
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — ' +
        'falling back to the in-memory limiter only (not shared across instances).',
      )
    }
    redis = null
    return null
  }
  try {
    // Keep retries minimal — a dead Upstash should cost milliseconds, not
    // seconds, since we fail open anyway.
    redis = new Redis({ url, token, retry: { retries: 1, backoff: () => 0 } })
  } catch (err) {
    console.warn('[rate-limit] Upstash client init failed:', err instanceof Error ? err.message : err)
    redis = null
  }
  return redis
}

// One Ratelimit instance per distinct rule, built lazily.
const limiters = new Map<string, Ratelimit>()

function getLimiter(rule: RateRule): Ratelimit | null {
  const client = getRedis()
  if (!client) return null
  const id = `${rule.limit}:${rule.windowSeconds}`
  let limiter = limiters.get(id)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
      prefix: 'autodex-rl',
      analytics: false,
    })
    limiters.set(id, limiter)
  }
  return limiter
}

/**
 * Check one namespaced key against a rule.
 *
 * The in-memory net always runs first (and always counts), so a hot
 * instance stays capped even when Upstash is down. When Upstash IS
 * configured it is authoritative for the shared verdict; any error there
 * is swallowed and we fall back to the in-memory answer.
 *
 * Never throws.
 */
export async function checkRateLimit(key: string, rule: RateRule): Promise<{ ok: boolean }> {
  const memOk = memoryAllows(key, rule)

  const limiter = getLimiter(rule)
  if (!limiter) return { ok: memOk }

  try {
    // Race the shared check against the timeout; `null` means "gave up".
    const verdict = await Promise.race([
      limiter.limit(key).then((r) => r.success),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), UPSTASH_TIMEOUT_MS)),
    ])
    if (verdict === null) {
      console.warn('[rate-limit] Upstash check timed out, failing open')
      return { ok: memOk }
    }
    // Either layer may reject: memory catches a single-instance burst,
    // Upstash catches the distributed case.
    return { ok: verdict && memOk }
  } catch (err) {
    console.warn('[rate-limit] Upstash check failed, failing open:', err instanceof Error ? err.message : err)
    return { ok: memOk }
  }
}

/** Standard 429 body — deliberately generic (no enumeration signal). */
export const RATE_LIMIT_MESSAGE = 'Trop de tentatives. Veuillez réessayer plus tard.'
