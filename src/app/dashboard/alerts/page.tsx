'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Clock, PackageX, UserX, CheckCheck, Filter, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, isAfter, isToday, startOfDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  type Notification,
  type NotificationType,
  NOTIFICATION_TYPE_LABELS,
} from '@/lib/types'

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
    case 'lead_ignored':    return 'text-red-500 bg-red-500/10 border-red-100'
    case 'lead_stagnant':   return 'text-amber-500 bg-amber-500/10 border-amber-100'
    case 'stock_rupture':   return 'text-orange-500 bg-orange-500/10 border-orange-100'
    case 'vendor_inactive': return 'text-indigo-500 bg-indigo-500/10 border-indigo-100'
  }
}

function hrefFor(n: Notification) {
  if (n.lead_id) return `/dashboard/prospects?lead=${n.lead_id}`
  if (n.vehicle_id) return `/dashboard/vehicules`
  return '#'
}

type FilterKey = 'all' | NotificationType

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',              label: 'Toutes' },
  { key: 'lead_ignored',     label: 'Lead ignoré' },
  { key: 'lead_stagnant',    label: 'Lead stagnant' },
  { key: 'stock_rupture',    label: 'Stock' },
  { key: 'vendor_inactive',  label: 'Vendeur' },
]

export default function AlertsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setItems((data ?? []) as Notification[])
    setLoading(false)
  }

  async function runChecks() {
    setRefreshing(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      await fetch('/api/check-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.user?.id ?? null }),
      })
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const filtered = useMemo(
    () => items.filter((n) => filter === 'all' || n.type === filter),
    [items, filter]
  )

  const weekStart = subDays(startOfDay(new Date()), 7)
  const today    = filtered.filter((n) => isToday(new Date(n.created_at)))
  const thisWeek = filtered.filter((n) => {
    const d = new Date(n.created_at)
    return !isToday(d) && isAfter(d, weekStart)
  })
  const older    = filtered.filter((n) => !isAfter(new Date(n.created_at), weekStart))

  const unreadCount = items.filter((n) => !n.read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-muted-foreground text-sm">Chargement des alertes…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Alertes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} alerte{items.length > 1 ? 's' : ''} ·{' '}
            <span className={unreadCount > 0 ? 'text-red-600 font-medium' : ''}>
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runChecks}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-card text-foreground border border-border hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Groups */}
      <Group title="Aujourd'hui"   items={today}    />
      <Group title="Cette semaine" items={thisWeek} />
      <Group title="Plus ancien"   items={older}    />

      {filtered.length === 0 && (
        <div className="bg-card rounded-xl border border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Aucune alerte pour ce filtre.</p>
        </div>
      )}
    </div>
  )
}

function Group({ title, items }: { title: string; items: Notification[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
        {title} · {items.length}
      </h2>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {items.map((n, i) => {
          const Icon = iconFor(n.type)
          return (
            <Link
              key={n.id}
              href={hrefFor(n)}
              className={`flex items-start gap-4 px-5 py-4 hover:bg-muted transition-colors ${
                i < items.length - 1 ? 'border-b border-border' : ''
              } ${n.read ? '' : 'bg-indigo-50/20 dark:bg-indigo-500/10'}`}
            >
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${colorFor(n.type)}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {NOTIFICATION_TYPE_LABELS[n.type]}
                  </span>
                  {!n.read && (
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {format(new Date(n.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
