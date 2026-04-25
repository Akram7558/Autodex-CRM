'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  MessageSquare,
  Star,
  Download,
  Pencil,
  Trash2,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadSuivi,
  type Vehicle,
  LEAD_SUIVI_LABELS,
  LEAD_SUIVI_VALUES,
  LEAD_SUIVI_BADGE_CLASSES,
} from '@/lib/types'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AddLeadModal } from '@/components/AddLeadModal'
import { EditLeadModal } from '@/components/EditLeadModal'

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

function formatDate(d: string): string {
  const date = new Date(d)
  if (isToday(date))     return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  return format(date, 'd MMM', { locale: fr })
}

// VIP heuristic: high budget signals priority lead.
const VIP_BUDGET_THRESHOLD = 5_000_000

// ── Phone formatting (Algeria default) ──────────────────────────────
// Returns the phone in international format suitable for tel:/sms: links
// (with leading +) and for wa.me URLs (digits only, no +).
// Returns null when no usable number is provided.
function formatPhoneIntl(raw: string | null | undefined): { tel: string; wa: string } | null {
  if (!raw) return null
  // Keep only digits and a possible leading "+"
  let s = raw.trim().replace(/[^\d+]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1)
    if (!digits) return null
    return { tel: `+${digits}`, wa: digits }
  }
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  // If the user already typed "213…", don't double-prefix.
  const digits = s.startsWith('213') ? s : `213${s}`
  if (!digits) return null
  return { tel: `+${digits}`, wa: digits }
}

const statusStyles = {
  'Chaud': 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200/50 dark:border-rose-500/20',
  'En cours': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20',
  'Nouveau': 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20',
  'Froid': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/50 dark:border-slate-700/50',
  'Contacté': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20',
}

const PAGE_SIZE = 6

export function ProspectsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [suiviFilter, setSuiviFilter] = useState<'all' | LeadSuivi>('all')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [contactPopover, setContactPopover] = useState<
    { id: string; kind: 'call' | 'msg' } | null
  >(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [vehiclesById, setVehiclesById] = useState<Record<string, Vehicle>>({})

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
  }

  async function fetchVehicles() {
    const { data } = await supabase.from('vehicles').select('*')
    const map: Record<string, Vehicle> = {}
    for (const v of (data ?? []) as Vehicle[]) map[v.id] = v
    setVehiclesById(map)
  }

  useEffect(() => { fetchLeads(); fetchVehicles() }, [])

  // Close kebab menu / contact popover on outside click / escape
  useEffect(() => {
    if (!menuOpenId && !contactPopover) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-lead-menu]')) return
      if (t && t.closest('[data-contact-popover]')) return
      setMenuOpenId(null)
      setContactPopover(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpenId(null); setContactPopover(null) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpenId, contactPopover])

  async function updateSuivi(id: string, suivi: LeadSuivi | null) {
    // Optimistic update so the badge color flips immediately.
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, suivi } : l)))
    const { error: err } = await supabase
      .from('leads')
      .update({ suivi })
      .eq('id', id)
    if (err) {
      console.warn('[ProspectsView] failed to update suivi:', err.message)
      // Rollback on failure.
      fetchLeads()
    }
  }

  async function deleteLead(id: string) {
    if (!confirm('Supprimer ce prospect ? Cette action est irréversible.')) return
    setLeads((prev) => prev.filter((l) => l.id !== id))
    await supabase.from('leads').delete().eq('id', id)
  }

  function exportCsv() {
    const header = ['Nom', 'Email', 'Téléphone', 'Wilaya', 'Modèle', 'Source', 'Statut', 'Créé le']
    const rows = leads.map((l) => [
      l.full_name,
      l.email ?? '',
      l.phone ?? '',
      l.wilaya ?? '',
      l.model_wanted ?? '',
      LEAD_SOURCE_LABELS[l.source] ?? l.source,
      LEAD_STATUS_LABELS[l.status],
      l.created_at,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Real backend rows shaped for the design template — UI structure unchanged.
  const prospectsData = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads
      .filter((l) => {
        if (suiviFilter !== 'all' && l.suivi !== suiviFilter) return false
        if (!term) return true
        return (
          l.full_name.toLowerCase().includes(term) ||
          (l.email ?? '').toLowerCase().includes(term) ||
          (l.phone ?? '').toLowerCase().includes(term) ||
          (l.model_wanted ?? '').toLowerCase().includes(term)
        )
      })
      .map((l) => {
        // Resolve the linked vehicle (if any) to a human label.
        const linked = l.vehicle_id ? vehiclesById[l.vehicle_id] : undefined
        const linkedLabel = linked
          ? [linked.brand, linked.model, linked.year ? String(linked.year) : '']
              .filter(Boolean)
              .join(' ')
          : null
        return {
          id: l.id,
          rawPhone: l.phone,
          rawEmail: l.email,
          name: l.full_name,
          email: l.email ?? '—',
          phone: l.phone ?? '—',
          car: linkedLabel ?? l.model_wanted ?? '—',
          isLinked: !!linkedLabel,
          status: toDisplayStatus(l.status),
          suivi: (l.suivi ?? null) as LeadSuivi | null,
          notes: l.notes ?? '',
          source: LEAD_SOURCE_LABELS[l.source] ?? l.source,
          date: formatDate(l.created_at),
          isVip: !!(l.budget_dzd && l.budget_dzd >= VIP_BUDGET_THRESHOLD),
        }
      })
  }, [leads, search, suiviFilter, vehiclesById])

  const total = prospectsData.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * PAGE_SIZE
  const pageRows = prospectsData.slice(startIdx, startIdx + PAGE_SIZE)
  const fromLabel = total === 0 ? 0 : startIdx + 1
  const toLabel = Math.min(startIdx + PAGE_SIZE, total)

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
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-colors"
          >
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">
              Suivi
            </span>
            <select
              value={suiviFilter}
              onChange={(e) => { setSuiviFilter(e.target.value as 'all' | LeadSuivi); setPage(1) }}
              className="flex-1 sm:flex-none bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tous</option>
              {LEAD_SUIVI_VALUES.map((s) => (
                <option key={s} value={s}>{LEAD_SUIVI_LABELS[s]}</option>
              ))}
            </select>
          </div>
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
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span className="truncate">{prospect.car}</span>
                      {prospect.isLinked && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20 shrink-0">
                          Lié
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{prospect.source}</div>
                  </td>
                  <td className="py-4 px-6 max-w-[220px]">
                    <div className="relative inline-block">
                      <select
                        value={prospect.suivi ?? ''}
                        onChange={(e) =>
                          updateSuivi(
                            prospect.id,
                            e.target.value ? (e.target.value as LeadSuivi) : null
                          )
                        }
                        className={cn(
                          "appearance-none cursor-pointer pl-3 pr-7 py-1 rounded-full text-xs font-black uppercase tracking-widest border focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
                          prospect.suivi
                            ? LEAD_SUIVI_BADGE_CLASSES[prospect.suivi]
                            : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
                        )}
                      >
                        <option value="">— Aucun —</option>
                        {LEAD_SUIVI_VALUES.map((s) => (
                          <option key={s} value={s}>{LEAD_SUIVI_LABELS[s]}</option>
                        ))}
                      </select>
                      <svg
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-70"
                        viewBox="0 0 20 20" fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {prospect.notes && (
                      <div
                        title={prospect.notes}
                        className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate"
                      >
                        {prospect.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-500 dark:text-slate-400">
                    {prospect.date}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(() => {
                        const intl = formatPhoneIntl(prospect.rawPhone)
                        const hasPhone = !!intl
                        const noPhoneTitle = 'Pas de numéro de téléphone'
                        return (
                          <>
                            {/* Call button + popover */}
                            <div className="relative" data-contact-popover>
                              <button
                                type="button"
                                disabled={!hasPhone}
                                onClick={() =>
                                  setContactPopover((cur) =>
                                    cur && cur.id === prospect.id && cur.kind === 'call'
                                      ? null
                                      : { id: prospect.id, kind: 'call' }
                                  )
                                }
                                aria-haspopup="menu"
                                aria-expanded={contactPopover?.id === prospect.id && contactPopover?.kind === 'call'}
                                className={cn(
                                  "p-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl transition-colors shadow-sm inline-flex items-center justify-center",
                                  !hasPhone && "opacity-40 cursor-not-allowed hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                )}
                                title={hasPhone ? `Appeler ${prospect.rawPhone}` : noPhoneTitle}
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                              {hasPhone && contactPopover?.id === prospect.id && contactPopover?.kind === 'call' && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 text-left"
                                >
                                  <a
                                    href={`tel:${intl!.tel}`}
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    Appel téléphonique
                                  </a>
                                  <a
                                    href={`https://wa.me/${intl!.wa}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    Appel WhatsApp
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Message button + popover */}
                            <div className="relative" data-contact-popover>
                              <button
                                type="button"
                                disabled={!hasPhone}
                                onClick={() =>
                                  setContactPopover((cur) =>
                                    cur && cur.id === prospect.id && cur.kind === 'msg'
                                      ? null
                                      : { id: prospect.id, kind: 'msg' }
                                  )
                                }
                                aria-haspopup="menu"
                                aria-expanded={contactPopover?.id === prospect.id && contactPopover?.kind === 'msg'}
                                className={cn(
                                  "p-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors shadow-sm inline-flex items-center justify-center",
                                  !hasPhone && "opacity-40 cursor-not-allowed hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                )}
                                title={hasPhone ? `Message à ${prospect.rawPhone}` : noPhoneTitle}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              {hasPhone && contactPopover?.id === prospect.id && contactPopover?.kind === 'msg' && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 text-left"
                                >
                                  <a
                                    href={`sms:${intl!.tel}`}
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    SMS
                                  </a>
                                  <a
                                    href={`https://wa.me/${intl!.wa}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    WhatsApp
                                  </a>
                                </div>
                              )}
                            </div>
                          </>
                        )
                      })()}
                      <div className="relative" data-lead-menu>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === prospect.id ? null : prospect.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label="Options"
                          aria-haspopup="menu"
                          aria-expanded={menuOpenId === prospect.id}
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {menuOpenId === prospect.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 text-left"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const full = leads.find((l) => l.id === prospect.id)
                                if (full) setEditingLead(full)
                                setMenuOpenId(null)
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Pencil className="w-4 h-4" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => { setMenuOpenId(null); deleteLead(prospect.id) }}
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <span className="text-xs font-bold text-slate-500">
            Affichage de {fromLabel} à {toLabel} sur {total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Précédent
            </button>
            <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700">
              {safePage}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Suivant
            </button>
          </div>
        </div>
      </motion.div>

      <AddLeadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={fetchLeads}
      />

      <EditLeadModal
        lead={editingLead}
        onClose={() => setEditingLead(null)}
        onSaved={() => { fetchLeads(); fetchVehicles() }}
      />
    </div>
  )
}
