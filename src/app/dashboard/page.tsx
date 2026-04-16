'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Users, Car, TrendingUp, Trophy, ArrowUpRight, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import {
  LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS,
  type Lead, type Vehicle,
} from '@/lib/types'
import { format, subDays, isAfter } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Helpers ─────────────────────────────────────────────────

function statusVariant(status: Lead['status']) {
  const map: Record<Lead['status'], 'success' | 'warning' | 'info' | 'purple' | 'danger' | 'default'> = {
    new: 'info', contacted: 'warning', qualified: 'purple',
    proposal: 'orange' as never, won: 'success', lost: 'danger',
  }
  return (map[status] ?? 'default') as 'success' | 'warning' | 'info' | 'purple' | 'danger' | 'default'
}

function sourceVariant(source: Lead['source']) {
  const map: Record<Lead['source'], 'default' | 'info' | 'purple' | 'indigo' | 'warning'> = {
    'walk-in': 'default', phone: 'info', website: 'purple',
    referral: 'indigo', social: 'warning',
  }
  return map[source] ?? 'default'
}

const PIPELINE_ORDER: Lead['status'][] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

// ── Component ───────────────────────────────────────────────

export default function DashboardPage() {
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: l }, { data: v }]) => {
      setLeads(   (l ?? []) as Lead[])
      setVehicles((v ?? []) as Vehicle[])
      setLoading(false)
    })
  }, [])

  // ── KPIs ──────────────────────────────────────────────────
  const now        = new Date()
  const monthStart = subDays(now, 30)
  const leadsThisMonth  = leads.filter(l => isAfter(new Date(l.created_at), monthStart))
  const wonLeads        = leads.filter(l => l.status === 'won')
  const availableVehicles = vehicles.filter(v => v.status === 'available')

  // ── Pipeline bar data ─────────────────────────────────────
  const pipelineData = PIPELINE_ORDER.map(status => ({
    name: LEAD_STATUS_LABELS[status],
    total: leads.filter(l => l.status === status).length,
  }))

  // ── Weekly area chart (last 7 days) ───────────────────────
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const day   = subDays(now, 6 - i)
    const label = format(day, 'EEE', { locale: fr })
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
    return {
      name: label.charAt(0).toUpperCase() + label.slice(1),
      leads: leads.filter(l => {
        const d = new Date(l.created_at)
        return d >= dayStart && d < dayEnd
      }).length,
    }
  })

  const kpis = [
    {
      label: 'Total prospects',
      value: leads.length,
      sub: `+${leadsThisMonth.length} ce mois`,
      icon: Users,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Prospects ce mois',
      value: leadsThisMonth.length,
      sub: `sur 30 jours glissants`,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Véhicules disponibles',
      value: availableVehicles.length,
      sub: `sur ${vehicles.length} en stock`,
      icon: Car,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Ventes conclues',
      value: wonLeads.length,
      sub: `taux : ${leads.length ? Math.round((wonLeads.length / leads.length) * 100) : 0}%`,
      icon: Trophy,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-gray-400 text-sm">Chargement du tableau de bord…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {format(now, "EEEE d MMMM yyyy", { locale: fr })} · Vue d&apos;ensemble commerciale
        </p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4"
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-none">{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Leads by status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Pipeline commercial</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pipelineData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={24}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                cursor={{ fill: '#f9fafb' }}
              />
              <Bar dataKey="total" name="Prospects" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly leads trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Nouveaux prospects — 7 derniers jours</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={24}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="leads"
                name="Prospects"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#colorLeads)"
                dot={{ r: 3, fill: '#6366f1' }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Recent leads table ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Derniers prospects</h2>
          <a
            href="/dashboard/leads"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Voir tout <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Nom</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Wilaya</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Statut</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 6).map((lead) => (
                <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    <span dir="auto">{lead.full_name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{lead.wilaya ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={sourceVariant(lead.source)}>
                      {LEAD_SOURCE_LABELS[lead.source]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusVariant(lead.status)}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(lead.created_at), 'd MMM yyyy', { locale: fr })}
                    </span>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">
                    Aucun prospect pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
