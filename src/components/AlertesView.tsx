'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import {
  CheckCircle,
  BellRing,
  Trash2,
  Calendar,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole, canSeeAllNotifications } from '@/lib/auth'
import type { Notification, NotificationType } from '@/lib/types'
import { type ComputedAlert, formatAgo, bucketByRecency } from '@/lib/notifications'
import { notifMeta, toneClasses } from '@/lib/notif-style'

// ── Map a real Notification → display config used by the design ──
type DisplayLevel = 'critical' | 'warning' | 'info'

type DisplayAlert = {
  id: string
  level: DisplayLevel
  title: string
  description: string
  date: string
  ts: string | null
  icon: LucideIcon
  iconColor: string
  primaryBtn: string
  actions: string[]
  read: boolean
  href: string | null
  dismissible: boolean
}

function configFor(type: NotificationType): {
  level: DisplayLevel
  icon: LucideIcon
  iconColor: string
  primaryBtn: string
} {
  // Severity, icon + tones come from the shared notif-style source so the
  // page and the bell stay identical. level === severity here.
  const { Icon, severity } = notifMeta(type)
  const tone = toneClasses(severity)
  return { level: severity, icon: Icon, iconColor: tone.tile, primaryBtn: tone.primaryBtn }
}

function relativeDate(d: string): string {
  return formatAgo(d)
}

function hrefFor(n: Notification): string | null {
  if (n.lead_id) return `/dashboard/prospects?lead=${n.lead_id}`
  if (n.vehicle_id) return `/dashboard/vehicules`
  return null
}

function primaryActionLabel(type: NotificationType): string {
  switch (type) {
    case 'lead_ignored':    return 'Rappeler maintenant'
    case 'lead_stagnant':   return 'Mettre à jour'
    case 'stock_rupture':   return 'Voir le stock'
    case 'vendor_inactive': return 'Voir le vendeur'
    default:                return 'Voir'
  }
}

export function AlertesView() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [computed, setComputed] = useState<ComputedAlert[]>([])
  const [canSeeAll, setCanSeeAll] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Per-user scoping: owner/manager/super_admin see the whole showroom;
      // everyone else only their own (leads assigned to them).
      const me = await getCurrentUserRole()
      const seeAll = canSeeAllNotifications(me?.role ?? null)
      if (!cancelled) { setCanSeeAll(seeAll); setMyId(me?.userId ?? null) }

      // Derived alerts — COMPUTED on the fly (scoped server-side, no rows).
      try {
        const res = await fetch('/api/check-alerts')
        if (res.ok && !cancelled) setComputed(((await res.json()).alerts ?? []) as ComputedAlert[])
      } catch {
        /* ignore */
      }

      // Stored EVENT notifs (reminder / escalation / temp_cold), scoped.
      let q = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!seeAll && me?.userId) q = q.eq('user_id', me.userId)
      const { data } = await q
      if (!cancelled) setNotifications((data ?? []) as Notification[])
    })()
    return () => { cancelled = true }
  }, [])

  const alertsData = useMemo<DisplayAlert[]>(() => {
    // A lead can have a stored temp_cold event AND a live lead_stagnant
    // compute — keep the stored one, drop the duplicate computed alert.
    const storedLeadIds = new Set(notifications.map((n) => n.lead_id).filter(Boolean) as string[])

    const computedAlerts: DisplayAlert[] = computed
      .filter((a) => !(a.lead_id && storedLeadIds.has(a.lead_id)))
      .map((a) => {
        const cfg = configFor(a.type)
        return {
          id: `computed:${a.key}`,
          level: cfg.level,
          title: a.title,
          description: a.message,
          date: a.since ? relativeDate(a.since) : '',
          ts: a.since,
          icon: cfg.icon,
          iconColor: cfg.iconColor,
          primaryBtn: cfg.primaryBtn,
          actions: a.href ? [primaryActionLabel(a.type)] : [],
          read: true,
          href: a.href,
          dismissible: false,
        }
      })

    const storedAlerts: DisplayAlert[] = notifications.map((n) => {
      const cfg = configFor(n.type)
      const actions: string[] = []
      if (hrefFor(n)) actions.push(primaryActionLabel(n.type))
      if (!n.read) actions.push('Marquer lu')
      return {
        id: n.id,
        level: cfg.level,
        title: n.title,
        description: n.message,
        date: relativeDate(n.created_at),
        ts: n.created_at,
        icon: cfg.icon,
        iconColor: cfg.iconColor,
        primaryBtn: cfg.primaryBtn,
        actions: actions.length > 0 ? actions : ['Marquer lu'],
        read: n.read,
        href: hrefFor(n),
        dismissible: true,
      }
    })

    return [...computedAlerts, ...storedAlerts]
  }, [computed, notifications])

  async function markAllRead() {
    let q = supabase.from('notifications').update({ read: true }).eq('read', false)
    if (!canSeeAll && myId) q = q.eq('user_id', myId)
    await q
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function markRead(id: string) {
    if (id.startsWith('computed:')) return
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  async function deleteAlert(id: string) {
    if (id.startsWith('computed:')) return
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }

  function handleAction(alert: DisplayAlert, label: string) {
    if (label === 'Marquer lu' || label === 'Marquer fait') {
      void markRead(alert.id)
      return
    }
    if (alert.href) router.push(alert.href)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-black tracking-tight text-[var(--text-primary)] flex items-center gap-3"
          >
            <BellRing className="w-8 h-8 text-[var(--accent)]" />
            Alertes & Tâches
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[var(--text-secondary)] mt-1"
          >
            Ne manquez aucune opportunité ni aucun rappel important.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Tout marquer comme lu
          </button>
        </motion.div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6 pt-4">
        {bucketByRecency(alertsData, (a) => a.ts).map((group) => (
          <div key={group.label} className="space-y-4">
            <p className="px-1 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {group.label}
            </p>
            {group.items.map((alert, idx) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              "p-5 rounded-[2rem] border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm flex flex-col sm:flex-row gap-5 items-start transition-all relative overflow-hidden group",
            )}
          >
            {/* Glossy overlay effect for critical/warning */}
            {(alert.level === 'critical' || alert.level === 'warning') && (
               <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 dark:bg-white/5 rounded-full blur-3xl pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
            )}

            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", alert.iconColor)}>
              <alert.icon className="w-6 h-6 stroke-[2.5px]" />
            </div>

            <div className="flex-1 min-w-0 z-10 relative">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 mb-2">
                <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                  {alert.title}
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] shrink-0">
                  {alert.date}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] font-medium mb-4 leading-relaxed">
                {alert.description}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {alert.actions.map((action, actionIdx) => (
                  <button
                    key={actionIdx}
                    onClick={() => handleAction(alert, action)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm",
                      actionIdx === 0
                        ? alert.primaryBtn
                        : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
                    )}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {alert.dismissible && (
              <button
                onClick={() => deleteAlert(alert.id)}
                className="absolute top-5 right-5 p-2 text-[var(--text-muted)] hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-surface)]/60 backdrop-blur border border-[var(--border)] rounded-xl z-20"
                aria-label="Supprimer l'alerte"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </motion.div>
            ))}
          </div>
        ))}
        {alertsData.length === 0 && (
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-12 text-center">
            <Calendar className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">
              Aucune alerte pour l&apos;instant.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
