'use client'
// ─────────────────────────────────────────────────────────────────────
// LeadTemperatureSparkline
// ─────────────────────────────────────────────────────────────────────
// Pure-SVG sparkline of a lead's temperature_score over time. Lazy-
// fetches /api/leads/:id/temperature-history on mount (skip if the
// caller passed `history` directly).
//
// Trend is computed from the slope of the last 3 data points:
//   • ↗ En hausse — emerald
//   • ↘ En baisse — rose
//   • → Stable    — zinc
//
// Width 200 / height 40, line color follows the trend. Empty states
// render a small "Pas encore de données" stub.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { LeadTemperatureHistoryEntry } from '@/lib/types'

const W = 200
const H = 40
const PAD = 4

type Trend = 'up' | 'down' | 'flat'

function computeTrend(points: LeadTemperatureHistoryEntry[]): Trend {
  if (points.length < 2) return 'flat'
  const tail = points.slice(-3)
  const first = tail[0].score
  const last  = tail[tail.length - 1].score
  const diff  = last - first
  if (diff >= 5)  return 'up'
  if (diff <= -5) return 'down'
  return 'flat'
}

function trendStyle(t: Trend) {
  switch (t) {
    case 'up':   return { stroke: '#10b981', label: '↗ En hausse', text: 'text-emerald-600 dark:text-emerald-400' }
    case 'down': return { stroke: '#f43f5e', label: '↘ En baisse', text: 'text-rose-600 dark:text-rose-400' }
    case 'flat': return { stroke: '#71717a', label: '→ Stable',    text: 'text-zinc-500 dark:text-zinc-400' }
  }
}

export default function LeadTemperatureSparkline({
  leadId, history: pre,
}: {
  leadId: string
  history?: LeadTemperatureHistoryEntry[]
}) {
  const [history, setHistory] = useState<LeadTemperatureHistoryEntry[] | null>(pre ?? null)
  const [loading, setLoading] = useState(!pre)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (pre) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/temperature-history`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? 'Erreur de chargement.')
        if (!cancelled) setHistory((json.history ?? []) as LeadTemperatureHistoryEntry[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leadId, pre])

  const { polyline, area, trend, first, last } = useMemo(() => {
    const pts = history ?? []
    if (pts.length < 2) {
      return { polyline: '', area: '', trend: 'flat' as Trend, first: null as string | null, last: null as string | null }
    }
    const min = 0
    const max = 100
    const stepX = (W - PAD * 2) / (pts.length - 1)
    const coords = pts.map((p, i) => {
      const x = PAD + i * stepX
      const y = PAD + (H - PAD * 2) * (1 - (p.score - min) / (max - min))
      return [x, y] as const
    })
    const polyStr = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    const areaStr =
      `M ${coords[0][0].toFixed(2)},${(H - PAD).toFixed(2)} ` +
      `L ${coords[0][0].toFixed(2)},${coords[0][1].toFixed(2)} ` +
      coords.slice(1).map(([x, y]) => `L ${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
      ` L ${coords[coords.length - 1][0].toFixed(2)},${(H - PAD).toFixed(2)} Z`
    return {
      polyline: polyStr,
      area: areaStr,
      trend: computeTrend(pts),
      first: pts[0].recorded_at,
      last:  pts[pts.length - 1].recorded_at,
    }
  }, [history])

  const style = trendStyle(trend)

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          🌡️ Évolution
        </span>
        {history && history.length >= 2 && (
          <span className={'text-[10px] font-bold ' + style.text}>{style.label}</span>
        )}
      </div>

      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2">
        {loading ? (
          <div className="h-[40px] flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 px-1">{error}</p>
        ) : !history || history.length < 2 ? (
          <p className="text-[11px] text-muted-foreground italic px-1">
            Pas encore assez de données pour tracer l&apos;évolution.
          </p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
            {/* Reference grid: 50% line */}
            <line
              x1={PAD} x2={W - PAD}
              y1={PAD + (H - PAD * 2) * 0.5}
              y2={PAD + (H - PAD * 2) * 0.5}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeDasharray="2 3"
            />
            <path d={area} fill={style.stroke} fillOpacity="0.12" />
            <polyline
              points={polyline}
              fill="none"
              stroke={style.stroke}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Final dot */}
            <circle
              cx={(polyline.split(' ').pop() ?? '0,0').split(',')[0]}
              cy={(polyline.split(' ').pop() ?? '0,0').split(',')[1]}
              r="2.5"
              fill={style.stroke}
            />
          </svg>
        )}
      </div>

      {history && history.length >= 2 && first && last && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>il y a {formatDistanceToNow(parseISO(first), { locale: fr })}</span>
          <span>{formatDistanceToNow(parseISO(last), { locale: fr, addSuffix: true })}</span>
        </div>
      )}
    </div>
  )
}
