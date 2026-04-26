'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BadgeDollarSign, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Vente } from '@/lib/types'
import { format, startOfWeek, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

type DateRange = 'all' | 'week' | 'month' | '3months' | 'year' | 'custom'

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export function VentesView() {
  const [ventes, setVentes] = useState<Vente[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  // Pending custom range (the inputs); applied range (used in filtering).
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo]     = useState<string>('')
  const [appliedFrom, setAppliedFrom] = useState<string>('')
  const [appliedTo, setAppliedTo]     = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('ventes')
        .select('*')
        .order('date_vente', { ascending: false })
      if (cancelled) return
      if (error) {
        if (/ventes/i.test(error.message)) setMissing(true)
        else console.warn('[VentesView] failed to load:', error.message)
        setVentes([])
      } else {
        setVentes((data ?? []) as Vente[])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Resolve the active [from, to] window from the dropdown.
  const activeWindow = useMemo<{ from: Date | null; to: Date | null }>(() => {
    const now = new Date()
    switch (dateRange) {
      case 'all':
        return { from: null, to: null }
      case 'week':
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: null }
      case 'month':
        return { from: startOfMonth(now), to: null }
      case '3months':
        return { from: subMonths(now, 3), to: null }
      case 'year':
        return { from: startOfYear(now), to: null }
      case 'custom': {
        const from = appliedFrom ? new Date(appliedFrom + 'T00:00:00') : null
        const to   = appliedTo   ? new Date(appliedTo   + 'T23:59:59.999') : null
        return { from, to }
      }
    }
  }, [dateRange, appliedFrom, appliedTo])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return ventes.filter((v) => {
      // Date window
      const d = new Date(v.date_vente)
      if (activeWindow.from && d < activeWindow.from) return false
      if (activeWindow.to && d > activeWindow.to) return false
      if (!term) return true
      return (
        (v.client_name ?? '').toLowerCase().includes(term) ||
        (v.vehicle_name ?? '').toLowerCase().includes(term) ||
        (v.vehicle_reference ?? '').toLowerCase().includes(term)
      )
    })
  }, [ventes, search, activeWindow])

  const total = useMemo(
    () => rows.reduce((acc, v) => acc + (v.prix_vente ?? 0), 0),
    [rows]
  )

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50"
          >
            Nos Véhicules Vendus
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 dark:text-slate-400 mt-1"
          >
            Historique de toutes les ventes conclues, classées par date.
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
        >
          <BadgeDollarSign className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Total</div>
            <div className="text-lg font-black">{formatDzd(total)} DZD</div>
          </div>
        </motion.div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-sm overflow-hidden"
      >
        {/* Toolbar */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative w-full sm:w-96">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un client, un véhicule, une référence…"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-100 placeholder:text-slate-400 shadow-sm"
              />
              <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">
                Période
              </span>
              <select
                value={dateRange}
                onChange={(e) => {
                  const v = e.target.value as DateRange
                  setDateRange(v)
                  if (v === 'custom' && !customFrom && !customTo) {
                    const today = toDateInput(new Date())
                    setCustomFrom(today)
                    setCustomTo(today)
                  }
                  if (v !== 'custom') {
                    setAppliedFrom('')
                    setAppliedTo('')
                  }
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              >
                <option value="all">Tout</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="3months">3 derniers mois</option>
                <option value="year">Cette année</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
          </div>

          {dateRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Du</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">au</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setAppliedFrom(customFrom)
                  setAppliedTo(customTo)
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-colors"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>

        {missing && (
          <div className="px-6 py-4 text-sm font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-500/30">
            Exécutez la migration <code>migration_10_ventes.sql</code> dans Supabase pour activer cette page.
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Date vente</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Client</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Véhicule</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Prix (DZD)</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Référence véhicule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.map((v, idx) => (
                <motion.tr
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + idx * 0.03 }}
                  key={v.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                >
                  <td className="py-4 px-6 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {format(new Date(v.date_vente), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {v.client_name ?? '—'}
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {v.vehicle_name ?? '—'}
                  </td>
                  <td className="py-4 px-6 text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {formatDzd(v.prix_vente)}
                  </td>
                  <td className="py-4 px-6 text-xs font-mono text-slate-500 dark:text-slate-400">
                    {v.vehicle_reference ?? '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {!loading && rows.length === 0 && !missing && (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucune vente enregistrée pour le moment.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
