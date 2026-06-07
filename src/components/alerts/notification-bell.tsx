'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, KeyRound, CornerDownLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole, canSeeAllNotifications } from '@/lib/auth'
import type { Notification } from '@/lib/types'
import { type ComputedAlert, formatAgo } from '@/lib/notifications'
import { notifMeta, toneClasses } from '@/lib/notif-style'
import { relativeDayLabel, type AgendaItem } from '@/lib/rental/agenda'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

// Live rental reminder line (no stored rows).
function agendaVerb(kind: AgendaItem['kind']): string {
  return kind === 'pickup' ? 'récupère' : kind === 'return' ? 'retour de' : 'retour en retard'
}

function hrefFor(n: Pick<Notification, 'type' | 'lead_id' | 'vehicle_id'>) {
  // Deep-link to the source entity. lead_id wins (every lead-bound type —
  // including reminder/escalation, which carry it) so the row opens directly.
  if (n.lead_id)               return `/dashboard/prospects?lead=${n.lead_id}`
  if (n.type === 'reminder')   return '/dashboard/leads?filter=pending'
  if (n.type === 'escalation') return '/dashboard/leads?filter=escalated'
  if (n.vehicle_id)            return `/dashboard/vehicules`
  return '/dashboard/alerts'
}

export function NotificationBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [computed, setComputed] = useState<ComputedAlert[]>([])
  const [unread, setUnread] = useState(0)
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [agendaDays, setAgendaDays] = useState<{ today: string; tomorrow: string }>({ today: '', tomorrow: '' })
  const [myId, setMyId] = useState<string | null>(userId)
  const [canSeeAll, setCanSeeAll] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  async function load() {
    // Resolve the viewer's role/id for per-user scoping. owner/manager/
    // super_admin see the whole showroom; everyone else only their own.
    const me = await getCurrentUserRole()
    const mineId = me?.userId ?? userId ?? null
    const seeAll = canSeeAllNotifications(me?.role ?? null)
    setMyId(mineId)
    setCanSeeAll(seeAll)

    // 1) Derived alerts — COMPUTED on the fly (no rows), scoped server-side.
    try {
      const res = await fetch('/api/check-alerts')
      setComputed(res.ok ? (((await res.json()).alerts ?? []) as ComputedAlert[]) : [])
    } catch {
      setComputed([])
    }

    // 2) Stored EVENT notifs (reminder / escalation / temp_cold), scoped.
    let q = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    if (!seeAll && mineId) q = q.eq('user_id', mineId)
    const { data } = await q
    setItems((data ?? []) as Notification[])

    // 3) Unread count of the viewer's OWN stored notifs (scoped).
    let cq = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
    if (!seeAll && mineId) cq = cq.eq('user_id', mineId)
    const { count } = await cq
    setUnread(count ?? 0)

    // 4) Live rental reminders (pickups/returns/overdue) — not stored.
    try {
      const res = await fetch('/api/rental/agenda')
      if (res.ok) {
        const j = await res.json()
        setAgenda((j.items ?? []) as AgendaItem[])
        setAgendaDays({ today: j.today ?? '', tomorrow: j.tomorrow ?? '' })
      } else {
        setAgenda([])
      }
    } catch {
      setAgenda([])
    }
  }

  // Initial load + poll every 5 minutes. The bell no longer GENERATES rows —
  // it only READS computed alerts + stored events + the rental agenda.
  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // "Tout marquer lu" only affects the viewer's OWN stored notifs. Computed
  // alerts auto-resolve when the lead/stock is acted on — they can't be read.
  async function markAllRead() {
    let q = supabase.from('notifications').update({ read: true }).eq('read', false)
    if (!canSeeAll && myId) q = q.eq('user_id', myId)
    await q
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  // A lead can have BOTH a stored temp_cold event and a live lead_stagnant
  // compute — show the stored one and drop the duplicate computed alert.
  const storedLeadIds = new Set(items.map((n) => n.lead_id).filter(Boolean) as string[])
  const computedToShow = computed.filter((a) => !(a.lead_id && storedLeadIds.has(a.lead_id)))

  // Badge: computed alerts + unread stored notifs + live agenda items.
  const totalCount = computedToShow.length + unread + agenda.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 text-zinc-400 hover:text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-500 dark:hover:text-white dark:hover:border-zinc-700 transition-all duration-300"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
        {totalCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-zinc-950">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-card rounded-xl shadow-lg border border-border overflow-hidden">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">{unread} non lue{unread > 1 ? 's' : ''}</p>
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* list */}
          <div className="max-h-96 overflow-y-auto">
            {/* Live rental reminders — pickups / returns / overdue (not stored) */}
            {agenda.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Location · à venir
                </p>
                {agenda.map((it) => {
                  const overdue = it.kind === 'overdue'
                  const Icon = overdue ? AlertTriangle : it.kind === 'pickup' ? KeyRound : CornerDownLeft
                  const day = relativeDayLabel(it.date, agendaDays.today, agendaDays.tomorrow)
                  return (
                    <Link
                      key={`agenda-${it.id}-${it.kind}`}
                      href={`/dashboard/location/contrats/${it.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b border-border"
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${overdue ? 'text-red-500 bg-red-500/10' : 'text-emerald-600 bg-emerald-500/10'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {it.customer_name} · <bdi>{it.vehicle_label}</bdi>
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          <span className={overdue ? 'font-semibold text-red-500' : ''}>{day}</span>
                          {it.time ? ` ${it.time}` : ''} · {agendaVerb(it.kind)}
                          {it.contract_number ? ` · ${it.contract_number}` : ''}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {items.length === 0 && computedToShow.length === 0 && agenda.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune alerte pour l’instant.
              </div>
            )}

            {/* Derived alerts — computed live, deep-linked, not dismissible */}
            {computedToShow.map((a) => {
              const { Icon, severity } = notifMeta(a.type)
              return (
                <Link
                  key={a.key}
                  href={a.href ?? '/dashboard/alerts'}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b border-border bg-[var(--accent-subtle)]"
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${toneClasses(severity).tile}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.message}</p>
                    {a.since && (
                      <p className="text-[11px] text-muted-foreground mt-1">{formatAgo(a.since)}</p>
                    )}
                  </div>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2" />
                </Link>
              )
            })}

            {items.map((n) => {
              const { Icon, severity } = notifMeta(n.type)
              return (
                <Link
                  key={n.id}
                  href={hrefFor(n)}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-0 ${
                    n.read ? '' : 'bg-[var(--accent-subtle)]'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${toneClasses(severity).tile}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2" />}
                </Link>
              )
            })}
          </div>

          {/* footer */}
          <Link
            href="/dashboard/alerts"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] py-3 border-t border-border"
          >
            Voir toutes les alertes →
          </Link>
        </div>
      )}
    </div>
  )
}
