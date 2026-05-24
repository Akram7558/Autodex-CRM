'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, Clock, PackageX, UserX, AlertOctagon, KeyRound, CornerDownLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Notification, NotificationType } from '@/lib/types'
import { relativeDayLabel, type AgendaItem } from '@/lib/rental/agenda'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

// Live rental reminder line (no stored rows).
function agendaVerb(kind: AgendaItem['kind']): string {
  return kind === 'pickup' ? 'récupère' : kind === 'return' ? 'retour de' : 'retour en retard'
}

function iconFor(type: NotificationType) {
  switch (type) {
    case 'lead_ignored':    return AlertTriangle
    case 'lead_stagnant':   return Clock
    case 'stock_rupture':   return PackageX
    case 'vendor_inactive': return UserX
    case 'reminder':        return Clock
    case 'escalation':      return AlertOctagon
  }
}

function colorFor(type: NotificationType) {
  switch (type) {
    case 'lead_ignored':    return 'text-red-500 bg-red-500/10'
    case 'lead_stagnant':   return 'text-amber-500 bg-amber-500/10'
    case 'stock_rupture':   return 'text-orange-500 bg-orange-500/10'
    case 'vendor_inactive': return 'text-indigo-500 bg-indigo-500/10'
    case 'reminder':        return 'text-orange-500 bg-orange-500/10'
    case 'escalation':      return 'text-red-600 bg-red-500/10'
  }
}

function hrefFor(n: Notification) {
  // migration_34 — reminder + escalation notifications target the
  // leads table (accessible to every showroom role) with the matching
  // URL filter so the row pops to the top.
  if (n.type === 'reminder')   return '/dashboard/leads?filter=pending'
  if (n.type === 'escalation') return '/dashboard/leads?filter=escalated'
  if (n.lead_id)    return `/dashboard/leads`
  if (n.vehicle_id) return `/dashboard/vehicules`
  return '/dashboard/alerts'
}

export function NotificationBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [agendaDays, setAgendaDays] = useState<{ today: string; tomorrow: string }>({ today: '', tomorrow: '' })
  const ref = useRef<HTMLDivElement | null>(null)

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    const list = (data ?? []) as Notification[]
    setItems(list)

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
    setUnread(count ?? 0)

    // Live rental reminders (pickups/returns/overdue) — not stored.
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

  async function runChecks() {
    try {
      await fetch('/api/check-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
    } catch {
      /* ignore */
    }
    await load()
  }

  // Initial load + poll every 5 minutes
  useEffect(() => {
    runChecks()
    const id = setInterval(runChecks, POLL_MS)
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

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  // Badge merges stored notifications + live rental reminders. "Tout marquer
  // lu" only affects notifications; live reminders persist until the rental
  // moves on (they're real upcoming events, not dismissible alerts).
  const totalCount = unread + agenda.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 text-zinc-400 hover:text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-500 dark:hover:text-white dark:hover:border-zinc-700 transition-all duration-300"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
        {totalCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-zinc-950">
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
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
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

            {items.length === 0 && agenda.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune alerte pour l’instant.
              </div>
            )}
            {items.map((n) => {
              const Icon = iconFor(n.type)
              return (
                <Link
                  key={n.id}
                  href={hrefFor(n)}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-0 ${
                    n.read ? '' : 'bg-indigo-50/30 dark:bg-indigo-500/10'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${colorFor(n.type)}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })}
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2" />}
                </Link>
              )
            })}
          </div>

          {/* footer */}
          <Link
            href="/dashboard/alerts"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 py-3 border-t border-border"
          >
            Voir toutes les alertes →
          </Link>
        </div>
      )}
    </div>
  )
}
