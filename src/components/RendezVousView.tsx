'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  CalendarClock,
  Phone,
  MessageCircle,
  Search,
  Car as CarIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Lead, Vehicle } from '@/lib/types'
import { format, isPast, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'

// Phone → +213 / wa.me digits.
function formatPhoneIntl(raw: string | null | undefined): { tel: string; wa: string } | null {
  if (!raw) return null
  let s = raw.trim().replace(/[^\d+]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1)
    if (!digits) return null
    return { tel: `+${digits}`, wa: digits }
  }
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('0'))  s = s.slice(1)
  const digits = s.startsWith('213') ? s : `213${s}`
  return { tel: `+${digits}`, wa: digits }
}

type RowState = 'today' | 'future' | 'overdue'

function classifyRdv(iso: string): RowState {
  const d = new Date(iso)
  if (isToday(d)) return 'today'
  if (isPast(d))  return 'overdue'
  return 'future'
}

const ROW_STYLES: Record<RowState, string> = {
  today:   'bg-indigo-50/70 dark:bg-indigo-500/10 border-l-4 border-l-indigo-500',
  future:  'bg-emerald-50/50 dark:bg-emerald-500/5 border-l-4 border-l-emerald-500',
  overdue: 'bg-amber-50/60 dark:bg-amber-500/5 border-l-4 border-l-amber-500',
}

const BADGE_STYLES: Record<RowState, string> = {
  today:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-500/30',
  future:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  overdue: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30',
}

const BADGE_LABEL: Record<RowState, string> = {
  today:   "Aujourd'hui",
  future:  'À venir',
  overdue: 'En retard',
}

// Per-row action selector. "Réservé" is the default no-op.
type RdvAction = 'reserve' | 'vendu' | 'annule' | 'reporter'

export function RendezVousView() {
  const [leads, setLeads]       = useState<Lead[]>([])
  const [vehiclesById, setVbi]  = useState<Record<string, Vehicle>>({})
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [migrationMissing, setMigrationMissing] = useState(false)

  async function fetchAll() {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('suivi', 'rdv_planifie')
      .not('rdv_date', 'is', null)
      .order('rdv_date', { ascending: true })
    if (error) {
      if (/suivi|rdv_date/i.test(error.message)) {
        setMigrationMissing(true)
      } else {
        console.warn('[RendezVousView] failed to load:', error.message)
      }
      setLeads([])
    } else {
      setLeads((data ?? []) as Lead[])
    }
    setLoading(false)

    const { data: vdata } = await supabase.from('vehicles').select('*')
    const map: Record<string, Vehicle> = {}
    for (const v of (vdata ?? []) as Vehicle[]) map[v.id] = v
    setVbi(map)
  }

  useEffect(() => { fetchAll() }, [])

  // ── Action handlers ────────────────────────────────────────────────
  async function handleAction(lead: Lead, action: RdvAction) {
    const v = lead.vehicle_id ? vehiclesById[lead.vehicle_id] : null
    const vehicleName = v
      ? [v.brand, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' ')
      : '—'

    if (action === 'reserve') return // No-op default.

    if (action === 'annule') {
      if (!confirm('Êtes-vous sûr de vouloir annuler ce RDV ? Le prospect sera supprimé définitivement.')) return
      // Release vehicle if reserved by this lead.
      if (v && v.reserved_by_lead_id === lead.id &&
          (v.status === 'reserved' || v.status === 'sold')) {
        await supabase
          .from('vehicles')
          .update({ status: 'available', reserved_by_lead_id: null })
          .eq('id', v.id)
      }
      const { error } = await supabase.from('leads').delete().eq('id', lead.id)
      if (error) { alert(error.message); return }
      fetchAll()
      return
    }

    if (action === 'reporter') {
      if (!confirm('Reporter ce RDV ? Le prospect sera marqué comme Reporter dans Prospects.')) return
      // Release vehicle.
      if (v && v.reserved_by_lead_id === lead.id &&
          (v.status === 'reserved' || v.status === 'sold')) {
        await supabase
          .from('vehicles')
          .update({ status: 'available', reserved_by_lead_id: null })
          .eq('id', v.id)
      }
      const { error } = await supabase
        .from('leads')
        .update({ suivi: 'reporter', rdv_date: null })
        .eq('id', lead.id)
      if (error) { alert(error.message); return }
      fetchAll()
      return
    }

    if (action === 'vendu') {
      if (!confirm(`Confirmer la vente de ${vehicleName} à ${lead.full_name} ?`)) return
      // 1. Mark vehicle as sold.
      if (v) {
        await supabase
          .from('vehicles')
          .update({ status: 'sold', reserved_by_lead_id: lead.id })
          .eq('id', v.id)
      }
      // 2. Update lead suivi to vendu (so it leaves the RDV page).
      const { error: lErr } = await supabase
        .from('leads')
        .update({ suivi: 'vendu' })
        .eq('id', lead.id)
      if (lErr) { alert(lErr.message); return }
      // 3. Insert into ventes ledger.
      const { error: vErr } = await supabase.from('ventes').insert([{
        lead_id:           lead.id,
        vehicle_id:        v?.id ?? null,
        client_name:       lead.full_name,
        vehicle_name:      vehicleName,
        vehicle_reference: v?.reference ?? null,
        prix_vente:        v?.price_dzd ?? null,
      }])
      if (vErr) {
        if (/ventes/i.test(vErr.message)) {
          alert("La table 'ventes' n'existe pas. Exécutez supabase/migration_10_ventes.sql.")
        } else {
          alert(vErr.message)
        }
      }
      // 4. Audit trail.
      await supabase.from('activities').insert([{
        lead_id: lead.id,
        type:    'status_change',
        title:   `Vente conclue : ${vehicleName}`,
        body:    `${lead.full_name} · ${vehicleName}`,
        done:    true,
      }])
      fetchAll()
      return
    }
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads
      .filter((l) => l.rdv_date)
      .filter((l) => {
        if (!term) return true
        const v = l.vehicle_id ? vehiclesById[l.vehicle_id] : null
        const carText = v ? `${v.brand} ${v.model} ${v.year ?? ''}` : ''
        return (
          l.full_name.toLowerCase().includes(term) ||
          (l.phone ?? '').toLowerCase().includes(term) ||
          carText.toLowerCase().includes(term)
        )
      })
      .map((l) => {
        const v = l.vehicle_id ? vehiclesById[l.vehicle_id] : null
        const carLabel = v
          ? [v.brand, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' ')
          : '—'
        const state = classifyRdv(l.rdv_date!)
        const date  = new Date(l.rdv_date!)
        return {
          id:       l.id,
          lead:     l,
          name:     l.full_name,
          phone:    l.phone,
          carLabel,
          rdvDate:  date,
          state,
        }
      })
  }, [leads, vehiclesById, search])

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
            Rendez-vous
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 dark:text-slate-400 mt-1"
          >
            Tous les RDV planifiés avec vos prospects, classés par date.
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"
        >
          <CalendarClock className="w-4 h-4" />
          {rows.length} rendez-vous
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
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client, un véhicule…"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-100 placeholder:text-slate-400 shadow-sm"
            />
            <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 pointer-events-none" />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />À venir</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />Aujourd&apos;hui</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />En retard</span>
          </div>
        </div>

        {migrationMissing && (
          <div className="px-6 py-4 text-sm font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-500/30">
            Exécutez les migrations <code>migration_07_leads_suivi.sql</code> et{' '}
            <code>migration_08_leads_rdv_date.sql</code> dans Supabase pour activer cette page.
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Date &amp; heure</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Client</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Véhicule</th>
                <th className="pb-4 pt-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Statut</th>
                <th className="pb-4 pt-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.map((r, idx) => {
                const intl = formatPhoneIntl(r.phone)
                const hasPhone = !!intl
                return (
                  <motion.tr
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + idx * 0.04 }}
                    key={r.id}
                    className={cn('transition-colors', ROW_STYLES[r.state])}
                  >
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {format(r.rdvDate, "EEE d MMM yyyy", { locale: fr })}
                        </span>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {format(r.rdvDate, 'HH:mm', { locale: fr })}
                        </span>
                        <span className={cn(
                          'mt-1 inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border',
                          BADGE_STYLES[r.state]
                        )}>
                          {BADGE_LABEL[r.state]}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <Phone className="w-3 h-3" />
                        <span>{r.phone ?? '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                        <CarIcon className="w-4 h-4 text-slate-400" />
                        {r.carLabel}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <select
                        defaultValue="reserve"
                        onChange={(e) => {
                          const action = e.target.value as RdvAction
                          handleAction(r.lead, action)
                          // Reset back to default so the same option can be re-selected later.
                          e.target.value = 'reserve'
                        }}
                        className="appearance-none cursor-pointer pl-3 pr-7 py-1 rounded-full text-xs font-black uppercase tracking-widest border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      >
                        <option value="reserve">Réservé</option>
                        <option value="vendu">Vendu</option>
                        <option value="annule">Annulé</option>
                        <option value="reporter">Reporter</option>
                      </select>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={hasPhone ? `tel:${intl!.tel}` : undefined}
                          aria-disabled={!hasPhone}
                          onClick={(e) => { if (!hasPhone) e.preventDefault() }}
                          className={cn(
                            'p-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl transition-colors shadow-sm inline-flex items-center justify-center',
                            !hasPhone && 'opacity-40 cursor-not-allowed'
                          )}
                          title={hasPhone ? `Appeler ${r.phone}` : 'Pas de numéro'}
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <a
                          href={hasPhone ? `https://wa.me/${intl!.wa}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-disabled={!hasPhone}
                          onClick={(e) => { if (!hasPhone) e.preventDefault() }}
                          className={cn(
                            'p-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors shadow-sm inline-flex items-center justify-center',
                            !hasPhone && 'opacity-40 cursor-not-allowed'
                          )}
                          title={hasPhone ? `WhatsApp ${r.phone}` : 'Pas de numéro'}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>

          {!loading && rows.length === 0 && !migrationMissing && (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucun rendez-vous planifié pour le moment.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
