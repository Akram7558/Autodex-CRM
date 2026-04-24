'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, AlertTriangle, Clock, PackageX, UserX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Notification, NotificationType } from '@/lib/types'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

function iconFor(type: NotificationType) {
  switch (type) {
    case 'lead_ignored':    return AlertTriangle
    case 'lead_stagnant':   return Clock
    case 'stock_rupture':   return PackageX
    case 'vendor_inactive': return UserX
  }
}

function colorFor(type: NotificationType) {
  switch (type) {
    case 'lead_ignored':    return 'text-red-500 bg-red-500/10'
    case 'lead_stagnant':   return 'text-amber-500 bg-amber-500/10'
    case 'stock_rupture':   return 'text-orange-500 bg-orange-500/10'
    case 'vendor_inactive': return 'text-indigo-500 bg-indigo-500/10'
  }
}

function hrefFor(n: Notification) {
  if (n.lead_id) return `/dashboard/prospects?lead=${n.lead_id}`
  if (n.vehicle_id) return `/dashboard/vehicules`
  return '/dashboard/alerts'
}

export function NotificationBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
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
            {items.length === 0 && (
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
