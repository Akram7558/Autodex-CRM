'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Building2, Users, Megaphone, BadgeDollarSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { canSeeFinancials, getCurrentUserRole } from '@/lib/auth'
import type { AppRole } from '@/lib/types'

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export function StatsCards() {
  const [stats, setStats] = useState({
    showrooms: 0,
    users: 0,
    leads: 0,
    revenue: 0,
  })
  const [role, setRole] = useState<AppRole | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cur = await getCurrentUserRole()
      if (!cancelled) setRole(cur?.role ?? null)
      const showFinancials = canSeeFinancials(cur?.role ?? null)

      // Skip the ventes fetch entirely for non-financial roles — keeps
      // a money-shaped payload off the wire even though RLS would let it
      // through.
      const [{ count: srCount }, { count: urCount }, { count: ldCount }] = await Promise.all([
        supabase.from('showrooms').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('user_roles').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }),
      ])
      let revenue = 0
      if (showFinancials) {
        const { data: ventes } = await supabase.from('ventes').select('prix_vente')
        revenue = (ventes ?? []).reduce(
          (acc: number, v: { prix_vente: number | null }) => acc + (v.prix_vente ?? 0),
          0,
        )
      }
      if (cancelled) return
      setStats({
        showrooms: srCount ?? 0,
        users:     urCount ?? 0,
        leads:     ldCount ?? 0,
        revenue,
      })
    })()
    return () => { cancelled = true }
  }, [])

  const baseCards = [
    { label: 'Showrooms actifs',    value: String(stats.showrooms), icon: Building2 },
    { label: 'Utilisateurs',        value: String(stats.users),     icon: Users },
    { label: 'Total prospects',     value: String(stats.leads),     icon: Megaphone },
  ]
  // Financial card is super_admin-only. Commercial / prospecteur_saas
  // see counts but never money.
  const financialCard = canSeeFinancials(role)
    ? { label: 'Chiffre d’affaires', value: `${formatDzd(stats.revenue)} DZD`, icon: BadgeDollarSign }
    : null
  const cards = financialCard ? [...baseCards, financialCard] : baseCards

  // Use a 3-up grid when the financial card is hidden so cards don't
  // grow to fill the freed slot.
  const gridCols = cards.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-6`}>
      {cards.map((kpi, i) => {
        const Icon = kpi.icon
        return (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="rounded-[2.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-6 flex items-start justify-between gap-4 shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">{kpi.label}</p>
              <p className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mt-3 leading-none tracking-tighter break-all">
                {kpi.value}
              </p>
            </div>
            <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
