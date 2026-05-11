'use client'
// ─────────────────────────────────────────────────────────────────────
// LeadTemperatureWidget
// ─────────────────────────────────────────────────────────────────────
// Owner-dashboard card showing the hot/warm/cold distribution of leads
// in the current showroom, with a manual "Actualiser" button that POSTs
// to /api/leads/refresh-temperatures.
//
// Stats come from GET /api/leads/temperature-stats — refreshed once on
// mount, after a successful manual refresh, and after the cron run.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Thermometer, RefreshCw, Flame, Snowflake } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

type Stats = {
  chaud: number
  tiede: number
  froid: number
  total: number
  last_refreshed: string | null
}

export default function LeadTemperatureWidget() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [toast, setToast]       = useState<string | null>(null)

  async function load() {
    setError(null)
    const res = await fetch('/api/leads/temperature-stats')
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur de chargement.')
      return
    }
    setStats(json as Stats)
  }

  useEffect(() => { load() }, [])

  async function refresh() {
    setRefreshing(true)
    setError(null)
    const res = await fetch('/api/leads/refresh-temperatures', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setRefreshing(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur lors du rafraîchissement.')
      return
    }
    setToast('Températures mises à jour')
    setTimeout(() => setToast(null), 2500)
    load()
  }

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-rose-500" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">
            Température des Leads
          </span>
        </div>
        <div className="mt-6 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    )
  }

  if (!stats || error) {
    return (
      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-rose-500" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">
            Température des Leads
          </span>
        </div>
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {error ?? 'Données indisponibles.'}
        </p>
      </div>
    )
  }

  const total = stats.total || 0
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const hotPct  = pct(stats.chaud)
  const warmPct = pct(stats.tiede)
  const coldPct = pct(stats.froid)

  const lastRel = stats.last_refreshed
    ? formatDistanceToNow(new Date(stats.last_refreshed), { addSuffix: true, locale: fr })
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-rose-500" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">
            Température des Leads
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[11px] font-bold text-zinc-700 dark:text-zinc-200 disabled:opacity-60 disabled:cursor-wait transition-colors"
        >
          <RefreshCw className={'w-3 h-3 ' + (refreshing ? 'animate-spin' : '')} />
          Actualiser
        </button>
      </div>

      {/* Chip row */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Chip
          icon={<Flame className="w-3.5 h-3.5" />}
          count={stats.chaud}
          label="Chauds"
          cls="bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
        />
        <Chip
          icon={<span className="text-[13px] leading-none">🟡</span>}
          count={stats.tiede}
          label="Tièdes"
          cls="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30"
        />
        <Chip
          icon={<Snowflake className="w-3.5 h-3.5" />}
          count={stats.froid}
          label="Froids"
          cls="bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30"
        />
        <span className="ml-auto text-[11px] text-zinc-500 dark:text-zinc-400">
          {total} actifs
        </span>
      </div>

      {/* Distribution bar */}
      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {total === 0 ? (
            <div className="flex-1" />
          ) : (
            <>
              {hotPct  > 0 && <div className="bg-rose-500"  style={{ width: `${hotPct}%`  }} title={`Chauds: ${hotPct}%`} />}
              {warmPct > 0 && <div className="bg-amber-500" style={{ width: `${warmPct}%` }} title={`Tièdes: ${warmPct}%`} />}
              {coldPct > 0 && <div className="bg-blue-500"  style={{ width: `${coldPct}%` }} title={`Froids: ${coldPct}%`} />}
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>🔥 {hotPct}%</span>
          <span>🟡 {warmPct}%</span>
          <span>🧊 {coldPct}%</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
        {lastRel
          ? <>Dernière mise à jour : <span className="font-medium text-zinc-700 dark:text-zinc-300">{lastRel}</span></>
          : 'Aucun calcul enregistré pour le moment.'}
      </p>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </motion.div>
  )
}

function Chip({
  icon, count, label, cls,
}: { icon: React.ReactNode; count: number; label: string; cls: string }) {
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 text-xs font-bold ' + cls}>
      {icon}
      <span className="tabular-nums text-sm">{count}</span>
      <span className="text-[11px] font-medium opacity-80">{label}</span>
    </span>
  )
}
