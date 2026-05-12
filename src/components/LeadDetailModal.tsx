'use client'
// ─────────────────────────────────────────────────────────────────────
// LeadDetailModal — read-only "Fiche Lead" view.
// ─────────────────────────────────────────────────────────────────────
// Large modal (max-w-4xl on desktop, full-screen bottom-sheet on mobile)
// that consolidates everything the owner / closer wants to see about a
// lead in one place:
//
//   • Header — avatar, name, contact lines, source badge, created-on,
//     temperature pill (score), suivi pill, best-call-hour hint
//   • Action bar — Appeler / WhatsApp / SMS / Modifier
//   • Section: linked vehicle (thumbnail + price + status)
//   • Section: temperature evolution sparkline
//   • Section: suggested vehicles + pre-orders (lazy)
//   • Section: activity timeline (last 10 entries)
//   • Section: notes (only when filled)
//   • Footer — last temperature-recompute timestamp
//
// No editing happens here — every "edit" path lifts the EditLeadModal
// via the onEdit callback.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  X, Phone, Mail, MessageCircle, MessageSquare, Pencil, Calendar,
  Car, ClipboardList, ArrowRight, Activity as ActivityIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  type Lead,
  type Activity,
  type Vehicle,
  LEAD_SOURCE_LABELS,
  LEAD_SUIVI_LABELS,
  LEAD_SUIVI_BADGE_CLASSES,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_BADGE_CLASSES,
  ACTIVITY_TYPE_LABELS,
} from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import LeadTemperatureSparkline from '@/components/LeadTemperatureSparkline'
import LeadSuggestions from '@/components/LeadSuggestions'

// ─── helpers ──────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((s) => s.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

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

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

function activityIconFor(t: Activity['type']) {
  switch (t) {
    case 'call':          return Phone
    case 'email':         return Mail
    case 'meeting':       return Calendar
    case 'note':          return ClipboardList
    case 'status_change': return ArrowRight
    default:              return ActivityIcon
  }
}

// ─── component ────────────────────────────────────────────────────

export default function LeadDetailModal({
  open, lead, onClose, onEdit, showroomSlug,
}: {
  open: boolean
  lead: Lead | null
  onClose: () => void
  onEdit: () => void
  showroomSlug?: string | null
}) {
  const [linkedVehicle, setLinkedVehicle] = useState<Vehicle | null>(null)
  const [activities,    setActivities]    = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [showAllActivities, setShowAllActivities] = useState(false)
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(showroomSlug ?? null)

  // Esc-to-close + body scroll lock while open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  // Reset transient state whenever a different lead is opened.
  useEffect(() => {
    setShowAllActivities(false)
    setLinkedVehicle(null)
    setActivities([])
  }, [lead?.id])

  // Linked vehicle (lazy when modal opens for this lead).
  useEffect(() => {
    if (!open || !lead?.vehicle_id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('vehicles').select('*').eq('id', lead.vehicle_id).maybeSingle()
      if (!cancelled) setLinkedVehicle((data as Vehicle | null) ?? null)
    })()
    return () => { cancelled = true }
  }, [open, lead?.vehicle_id])

  // Showroom slug (only fetch when not handed in).
  useEffect(() => {
    if (showroomSlug !== undefined) { setResolvedSlug(showroomSlug); return }
    if (!open || !lead?.showroom_id) { setResolvedSlug(null); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('showrooms').select('slug').eq('id', lead.showroom_id).maybeSingle()
      if (!cancelled) setResolvedSlug((data?.slug as string | null) ?? null)
    })()
    return () => { cancelled = true }
  }, [open, lead?.showroom_id, showroomSlug])

  // Activities (lazy when modal opens for this lead).
  useEffect(() => {
    if (!open || !lead?.id) return
    let cancelled = false
    ;(async () => {
      setActivitiesLoading(true)
      const { data } = await supabase
        .from('activities')
        .select('id, lead_id, user_id, type, title, body, scheduled_at, done, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled) {
        setActivities((data ?? []) as Activity[])
        setActivitiesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, lead?.id])

  const phoneFmt = useMemo(() => formatPhoneIntl(lead?.phone), [lead?.phone])

  if (!open || !lead) return null

  const tempCls = lead.temperature ? LEAD_TEMPERATURE_BADGE_CLASSES[lead.temperature] : ''
  const visibleActivities = showAllActivities ? activities : activities.slice(0, 10)

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="w-full sm:max-w-4xl bg-card text-foreground rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Fiche de ${lead.full_name}`}
        >
          {/* Drawer handle (mobile only) */}
          <div className="sm:hidden pt-2 flex justify-center shrink-0">
            <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          </div>

          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="px-5 sm:px-6 pt-4 pb-4 border-b border-border flex items-start gap-4 shrink-0">
            <div className="size-14 sm:size-16 shrink-0 rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center text-lg font-black">
              {initialsOf(lead.full_name)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                    {lead.full_name}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {phoneFmt && (
                      <a href={`tel:${phoneFmt.tel}`}
                         className="inline-flex items-center gap-1 hover:text-foreground">
                        <Phone className="w-3 h-3" /> {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`}
                         className="inline-flex items-center gap-1 hover:text-foreground truncate max-w-[200px]">
                        <Mail className="w-3 h-3 shrink-0" /> {lead.email}
                      </a>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md font-bold bg-zinc-100 dark:bg-zinc-800 text-foreground">
                      {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}
                    </span>
                    <span className="text-muted-foreground">
                      Créé le {format(new Date(lead.created_at), 'd MMM yyyy', { locale: fr })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted shrink-0"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
              {lead.temperature && (
                <span className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-black border',
                  tempCls,
                )}>
                  {LEAD_TEMPERATURE_LABELS[lead.temperature]}
                  {lead.temperature_score != null && (
                    <span className="ml-1.5 opacity-90">· {lead.temperature_score}/100</span>
                  )}
                </span>
              )}
              {lead.suivi && (
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border',
                  LEAD_SUIVI_BADGE_CLASSES[lead.suivi],
                )}>
                  {LEAD_SUIVI_LABELS[lead.suivi]}
                </span>
              )}
              {lead.best_call_hour != null && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  Meilleur moment : {lead.best_call_hour}h – {(lead.best_call_hour + 2) % 24}h
                </span>
              )}
            </div>
          </div>

          {/* Mobile-only badge row */}
          <div className="sm:hidden px-5 pt-3 flex flex-wrap items-center gap-2 shrink-0">
            {lead.temperature && (
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-black border',
                tempCls,
              )}>
                {LEAD_TEMPERATURE_LABELS[lead.temperature]}
                {lead.temperature_score != null && (
                  <span className="ml-1 opacity-90">· {lead.temperature_score}/100</span>
                )}
              </span>
            )}
            {lead.suivi && (
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border',
                LEAD_SUIVI_BADGE_CLASSES[lead.suivi],
              )}>
                {LEAD_SUIVI_LABELS[lead.suivi]}
              </span>
            )}
            {lead.best_call_hour != null && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Phone className="w-3 h-3" /> {lead.best_call_hour}h – {(lead.best_call_hour + 2) % 24}h
              </span>
            )}
          </div>

          {/* ── Action bar ─────────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={phoneFmt ? `tel:${phoneFmt.tel}` : undefined}
              aria-disabled={!phoneFmt}
              onClick={(e) => { if (!phoneFmt) e.preventDefault() }}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-bold border transition',
                phoneFmt
                  ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                  : 'border-border text-muted-foreground opacity-50 cursor-not-allowed',
              )}
            >
              <Phone className="w-4 h-4" /> Appeler
            </a>
            <a
              href={phoneFmt ? `https://wa.me/${phoneFmt.wa}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!phoneFmt}
              onClick={(e) => { if (!phoneFmt) e.preventDefault() }}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-bold transition text-white',
                phoneFmt ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed',
              )}
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            <a
              href={phoneFmt ? `sms:${phoneFmt.tel}` : undefined}
              aria-disabled={!phoneFmt}
              onClick={(e) => { if (!phoneFmt) e.preventDefault() }}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-bold border transition',
                phoneFmt
                  ? 'border-blue-300 text-blue-700 dark:text-blue-300 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                  : 'border-border text-muted-foreground opacity-50 cursor-not-allowed',
              )}
            >
              <MessageSquare className="w-4 h-4" /> SMS
            </a>
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition"
            >
              <Pencil className="w-4 h-4" /> Modifier
            </button>
          </div>

          {/* ── Scrollable body ────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
            {/* Linked vehicle */}
            <Section title="Véhicule lié" icon={<Car className="w-3.5 h-3.5" />}>
              {linkedVehicle ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col sm:flex-row gap-3 sm:gap-4 p-3">
                  <div className="w-full sm:w-36 aspect-[4/3] sm:aspect-auto sm:h-24 rounded-lg overflow-hidden bg-gradient-to-br from-violet-100 to-fuchsia-50 dark:from-violet-500/15 dark:to-fuchsia-500/5 flex items-center justify-center shrink-0">
                    {linkedVehicle.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={linkedVehicle.image_url}
                           alt={`${linkedVehicle.brand} ${linkedVehicle.model}`}
                           className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Car className="w-8 h-8 text-violet-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <h4 className="text-sm font-semibold truncate">
                      {linkedVehicle.brand} {linkedVehicle.model}
                      {linkedVehicle.year ? ` · ${linkedVehicle.year}` : ''}
                    </h4>
                    {linkedVehicle.reference && (
                      <p className="text-[11px] font-mono text-muted-foreground">{linkedVehicle.reference}</p>
                    )}
                    <p className="text-sm font-bold mt-auto">
                      {linkedVehicle.price_dzd != null
                        ? <>{formatDzd(linkedVehicle.price_dzd)} <span className="text-[10px] text-muted-foreground">DZD</span></>
                        : <span className="text-muted-foreground font-normal">Prix non renseigné</span>}
                    </p>
                  </div>
                  <span className={cn(
                    'self-start inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border',
                    linkedVehicle.status === 'available'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : linkedVehicle.status === 'reserved'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
                  )}>
                    {linkedVehicle.status === 'available' ? 'Disponible'
                      : linkedVehicle.status === 'reserved' ? 'Réservé' : 'Vendu'}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Aucun véhicule associé.</p>
              )}
            </Section>

            {/* Sparkline */}
            <Section title="Évolution de la température">
              <LeadTemperatureSparkline leadId={lead.id} />
            </Section>

            {/* Suggestions */}
            <Section title="Véhicules suggérés">
              <LeadSuggestions
                leadId={lead.id}
                leadName={lead.full_name}
                leadPhone={lead.phone}
                showroomSlug={resolvedSlug}
              />
            </Section>

            {/* Activities */}
            <Section title="Historique des activités">
              {activitiesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucune activité enregistrée.</p>
              ) : (
                <ol className="relative pl-5">
                  <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" aria-hidden="true" />
                  {visibleActivities.map((a) => {
                    const Icon = activityIconFor(a.type)
                    return (
                      <li key={a.id} className="relative py-2 pl-3">
                        <span className="absolute -left-[7px] top-3.5 size-2.5 rounded-full bg-violet-500 ring-4 ring-card" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-foreground inline-flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{a.title || ACTIVITY_TYPE_LABELS[a.type]}</span>
                            </div>
                            {a.body && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>
                            )}
                          </div>
                          <time className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                            {format(new Date(a.created_at), "d MMM, HH:mm", { locale: fr })}
                          </time>
                        </div>
                      </li>
                    )
                  })}
                  {!showAllActivities && activities.length > 10 && (
                    <li className="pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAllActivities(true)}
                        className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                      >
                        Voir plus ({activities.length - 10} de plus)
                      </button>
                    </li>
                  )}
                </ol>
              )}
            </Section>

            {/* Notes */}
            {lead.notes && lead.notes.trim().length > 0 && (
              <Section title="Notes">
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs text-foreground whitespace-pre-line">{lead.notes}</p>
                </div>
              </Section>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-3 border-t border-border bg-muted/30 shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {lead.temperature_updated_at
                ? <>Dernière mise à jour de la température : <span className="font-medium">
                    {format(new Date(lead.temperature_updated_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </span></>
                : 'Aucun calcul de température enregistré.'}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Section({
  title, icon, children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground inline-flex items-center gap-1.5 mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}
