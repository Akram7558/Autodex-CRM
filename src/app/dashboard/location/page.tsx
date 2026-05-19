'use client'
// ─────────────────────────────────────────────────────────────────────
// /dashboard/location — Phase 1 dashboard hub.
// ─────────────────────────────────────────────────────────────────────
// Placeholder stats + Phase-2 CTAs. The fleet + pricing pages already
// work end-to-end (chunk 1 ships full CRUD); contract creation and
// the calendar arrive in Phase 2.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { Calendar, FileText, KeyRound, Car, BadgeDollarSign, ArrowRight } from 'lucide-react'

type Stat = { label: string; value: string; sub: string; icon: typeof Calendar }

const STATS: Stat[] = [
  { label: 'Contrats actifs',               value: '—', sub: 'Phase 4', icon: FileText },
  { label: 'Véhicules disponibles',         value: '—', sub: 'Phase 4', icon: Car },
  { label: 'Revenus du mois',               value: '—', sub: 'Phase 4', icon: BadgeDollarSign },
  { label: "Pickups / retours aujourd'hui", value: '—', sub: 'Phase 4', icon: Calendar },
]

export default function RentalDashboardPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          <KeyRound className="w-3.5 h-3.5" />
          Module Location · Phase 1
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Tableau de bord — Location
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          La gestion de votre flotte est active. Le module complet (contrats, calendrier,
          inspections, paiements) arrive en Phase 2.
        </p>
      </div>

      {/* Stats placeholders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {STATS.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="kpi-card lift-on-hover p-5 flex flex-col gap-4 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-500 dark:text-zinc-400">
                  {s.label}
                </p>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {s.value}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{s.sub}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          title="Disponible en Phase 2"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white opacity-60 cursor-not-allowed"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 8px 22px -10px var(--accent-glow)',
          }}
        >
          ➕ Nouveau contrat
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 ms-1">Phase 2</span>
        </button>
        <Link
          href="/dashboard/location/vehicules"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium glass-card hover:-translate-y-0.5 transition-transform"
        >
          📅 Voir la flotte
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>

      {/* What's live */}
      <div
        className="glass-card p-6 rounded-2xl"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          Disponible dès maintenant
        </h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Gestion de la flotte (créer / modifier / supprimer)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Tarifs et règles de location par showroom
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Limite Classique (5 véhicules) — upgrade La Totale
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Permissions par rôle (Owner / Manager / Closer)
          </li>
        </ul>
      </div>
    </div>
  )
}
