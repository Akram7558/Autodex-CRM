'use client'
// ─────────────────────────────────────────────────────────────────────
// AttributionCapture — records first-touch acquisition attribution.
// ─────────────────────────────────────────────────────────────────────
// Mounted app-wide in the root layout. On first load it reads the URL's
// UTM / fbclid / ttclid / gclid params and persists them in a first-party
// cookie (first-touch — never overwritten). No network, renders nothing.
// App-wide mount means a direct landing on /register?utm=... is also caught.
// ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { captureFirstTouch } from '@/lib/attribution'

export default function AttributionCapture() {
  useEffect(() => { captureFirstTouch() }, [])
  return null
}
