'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Phone,
  Mail,
  FileText,
  UserPlus,
  Calendar,
  CheckCircle2,
  Filter,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Activity } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Map real Activity.type → display config used by the design ──
type DisplayType = 'call' | 'email' | 'meeting' | 'note' | 'lead' | 'won'

function toDisplayType(a: Activity): DisplayType {
  // status_change to 'won' if the activity title hints at a win, otherwise 'note'
  if (a.type === 'status_change') {
    const t = a.title.toLowerCase()
    if (t.includes('vendu') || t.includes('won')) return 'won'
    if (t.includes('réservé') || t.includes('proposal') || t.includes('offre')) return 'lead'
    return 'note'
  }
  return a.type
}

const TYPE_CONFIG: Record<DisplayType, { icon: typeof Phone; color: string; action: string }> = {
  call: {
    icon: Phone,
    color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
    action: 'a appelé',
  },
  email: {
    icon: Mail,
    color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
    action: 'a envoyé un email à',
  },
  meeting: {
    icon: Calendar,
    color: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
    action: 'a planifié une réunion avec',
  },
  note: {
    icon: FileText,
    color: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    action: 'a ajouté une note sur',
  },
  lead: {
    icon: UserPlus,
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
    action: 'a mis à jour',
  },
  won: {
    icon: CheckCircle2,
    color: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400',
    action: 'a conclu la vente avec',
  },
}

function relativeDate(d: string): string {
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: fr })
  } catch {
    return ''
  }
}

export function ActivitesView() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('activities')
      .select('*, users(full_name), leads(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setActivities((data ?? []) as Activity[]))
  }, [])

  // Real backend rows shaped for the design template — UI structure unchanged.
  const activitiesData = useMemo(() => {
    const term = search.trim().toLowerCase()
    return activities
      .filter((a) => {
        if (!term) return true
        return (
          a.title.toLowerCase().includes(term) ||
          (a.body ?? '').toLowerCase().includes(term) ||
          (a.leads?.full_name ?? '').toLowerCase().includes(term) ||
          (a.users?.full_name ?? '').toLowerCase().includes(term)
        )
      })
      .map((a) => {
        const dtype = toDisplayType(a)
        const cfg = TYPE_CONFIG[dtype]
        return {
          id: a.id,
          type: dtype,
          user: a.users?.full_name ?? 'Système',
          target: a.leads?.full_name ?? '—',
          action: cfg.action,
          details: a.body ?? a.title,
          date: relativeDate(a.created_at),
          icon: cfg.icon,
          color: cfg.color,
        }
      })
  }, [activities, search])

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50"
          >
            Historique des Activités
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 dark:text-slate-400 mt-1"
          >
            Retrouvez toutes les actions et événements liés à votre CRM.
          </motion.p>
        </div>
      </div>

      {/* Main Content Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-sm overflow-hidden"
      >
        {/* Toolbar (Search & Filters) */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une activité..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-100 placeholder:text-slate-400 shadow-sm transition-all"
            />
            <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 pointer-events-none" />
          </div>

          <button className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full sm:w-auto justify-center shadow-sm">
            <Filter className="w-4 h-4" />
            Filtrer par type
          </button>
        </div>

        {/* Timeline */}
        <div className="p-6">
          <div className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-4 space-y-8 py-2">
            {activitiesData.map((activity, idx) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + (idx * 0.1) }}
                className="relative pl-8 group"
              >
                {/* Timeline dot/icon */}
                <span className={cn(
                  "absolute -left-[21px] top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-900",
                  activity.color
                )}>
                  <activity.icon className="w-4 h-4 stroke-[2.5px]" />
                </span>

                {/* Content Card */}
                <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                    <div className="text-sm">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{activity.user}</span>
                      <span className="text-slate-500 dark:text-slate-400 mx-1">{activity.action}</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{activity.target}</span>
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">
                      {activity.date}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {activity.details}
                  </p>
                </div>
              </motion.div>
            ))}
            {activitiesData.length === 0 && (
              <div className="pl-8 text-sm text-slate-500 dark:text-slate-400">
                Aucune activité enregistrée pour l&apos;instant.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
