'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  MessageSquare,
  Star,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { LEAD_SOURCE_LABELS, type Lead } from '@/lib/types'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Map real Lead.status (DB enum) → display label used by the design ──
type DisplayStatus = 'Chaud' | 'En cours' | 'Nouveau' | 'Froid' | 'Contacté'

function toDisplayStatus(s: Lead['status']): DisplayStatus {
  switch (s) {
    case 'new':       return 'Nouveau'
    case 'contacted': return 'Contacté'
    case 'qualified': return 'En cours'
    case 'proposal':  return 'Chaud'
    case 'won':       return 'Contacté'
    case 'lost':      return 'Froid'
  }
}

// ── Pretty-format created_at the way the design shows it ──
function formatDate(d: string): string {
  const date = new Date(d)
  if (isToday(date))     return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  return format(date, 'd MMM', { locale: fr })
}

// VIP heuristic: high budget signals priority lead.
const VIP_BUDGET_THRESHOLD = 5_000_000

const statusStyles = {
  'Chaud': 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200/50 dark:border-rose-500/20',
  'En cours': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20',
  'Nouveau': 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20',
  'Froid': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/50 dark:border-slate-700/50',
  'Contacté': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20',
}

const PAGE_SIZE = 6

export default function ProspectsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setLeads((data ?? []) as Lead[])
        setLoading(false)
      })
  }, [])

  // Real leads → shape the design template expects.
  const prospectsData = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads
      .filter((l) => {
        if (!term) return true
        return (
          l.full_name.toLowerCase().includes(term) ||
          (l.email ?? '').toLowerCase().includes(term) ||
          (l.model_wanted ?? '').toLowerCase().includes(term)
        )
      })
      .map((l) => ({
        id: l.id,
        name: l.full_name,
        email: l.email ?? '—',
        phone: l.phone ?? '—',
        car: l.model_wanted ?? '—',
        status: toDisplayStatus(l.status),
        source: LEAD_SOURCE_LABELS[l.source] ?? l.source,
        date: formatDate(l.created_at),
        isVip: !!(l.budget_dzd && l.budget_dzd >= VIP_BUDGET_THRESHOLD),
      }))
  }, [leads, search])

  const total = prospectsData.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * PAGE_SIZE
  const pageRows = prospectsData.slice(startIdx, startIdx + PAGE_SIZE)
  const fromLabel = total === 0 ? 0 : startIdx + 1
  const toLabel   = Math.min(startIdx + PAGE_SIZE, total)

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
            Prospects
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 dark:text-slate-400 mt-1"
          >
            Gérez votre base de contacts et identifiez les meilleures opportunités.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3"
        >
          <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-colors">
            <Plus className="w-4 h-4" />
            Nouveau prospect
          </button>
        </motion.div>
      </div>

      {/* Main Content Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-sm flex flex-col overflow-hidden"
      >
        {/* Toolbar (Search & Filters) */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Rechercher un nom, email, véhicule..."
              className="w-full bg-slate-50 dark:bg-slate-950 border-none rounded-2xl pl-12 pr-6 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-100 placeholder:text-slate-400"
            />
            <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 pointer-events-none" />
          </div>

          <button className="flex items-center gap-2 px-6 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" />
            Filtres
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Contact</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Véhicule & Source</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Statut</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Date</th>
                <th className="pb-4 pt-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {pageRows.map((prospect, idx) => (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (idx * 0.05) }}
                  key={prospect.id}
                  className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-600 dark:text-slate-300">
                          {prospect.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        {prospect.isVip && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                            <Star className="w-2.5 h-2.5 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{prospect.name}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-slate-500" title={prospect.email}>
                            <Mail className="w-3 h-3" />
                            <span className="text-xs truncate max-w-[120px]">{prospect.email}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-500">
                            <Phone className="w-3 h-3" />
                            <span className="text-xs">{prospect.phone}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{prospect.car}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{prospect.source}</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border",
                      statusStyles[prospect.status as keyof typeof statusStyles]
                    )}>
                      {prospect.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-500 dark:text-slate-400">
                    {prospect.date}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl transition-colors shadow-sm" title="Appeler">
                        <Phone className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors shadow-sm" title="Message">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 px-6 text-center text-sm font-bold text-slate-500">
                    Aucun prospect trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination placeholder */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <span className="text-xs font-bold text-slate-500">
            Affichage de {fromLabel} à {toLabel} sur {total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Précédent
            </button>
            {Array.from({ length: totalPages }).slice(0, 3).map((_, i) => {
              const n = i + 1
              const isActive = n === safePage
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  )}
                >
                  {n}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
