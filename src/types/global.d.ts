// ─────────────────────────────────────────────────────────────────────
// Ambient declarations for the marketing pixels injected in
// src/app/layout.tsx (Meta + TikTok). Both are loaded via next/script
// so they only exist on the window after their <Script> resolves; the
// landing page guards each call with a typeof check before invoking.
// ─────────────────────────────────────────────────────────────────────

export {}

declare global {
  interface Window {
    /** Meta (Facebook) Pixel queue / function. */
    fbq: (...args: unknown[]) => void
    _fbq?: unknown
    /** TikTok Pixel queue / function. */
    ttq: {
      track: (event: string, params?: Record<string, unknown>) => void
      page?: () => void
      [k: string]: unknown
    }
    TiktokAnalyticsObject?: string
  }
}
