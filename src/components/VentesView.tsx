'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BadgeDollarSign, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Vente } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export function VentesView() {
  const [ventes, setVentes] = useState<Vente[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

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

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return ventes
    return ventes.filter((v) =>
      (v.client_name ?? '').toLowerCase().includes(term) ||
      (v.vehicle_name ?? '').toLowerCase().includes(term) ||
      (v.vehicle_reference ?? '').toLowerCase().includes(term)
    )
  }, [ventes, search])

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
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
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
