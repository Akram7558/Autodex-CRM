// ─────────────────────────────────────────────────────────────────────
// Instant skeleton for the /dashboard/location HUB.
// ─────────────────────────────────────────────────────────────────────
// Next.js renders this via the segment's Suspense boundary while the hub
// server component resolves auth + KPIs + agenda, so navigation feels
// immediate instead of landing on a blank/stale screen during the fetch.
//
// Shape mirrors page.tsx EXACTLY (header → KPI stat row → CTA row → agenda
// block → "disponible" block) so real content drops in with zero reflow.
//
// This is also the SHARED fallback for child segments that have no loading.tsx
// of their own (vehicules / clients / tarifs). Those self-fetch in the
// browser and carry their own internal grid skeletons, so this hub-shaped
// fallback only flashes briefly during their (cached) server-auth phase.
// The routes with a distinct layout — contrats, prospects, contrats/[id] —
// each ship their own loading.tsx, which overrides this one for that segment.
//
// Presentational only: no data, no hooks, no imports.
export default function LocationLoading() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header (badge + title + subtitle) */}
      <div className="flex flex-col gap-2">
        <div className="h-3.5 w-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-8 w-72 max-w-full rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded-md bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* KPI stat row — mirrors the real kpi-card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="kpi-card p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-8 w-24 rounded bg-[var(--bg-elevated)] animate-pulse" />
              <div className="h-3 w-28 rounded bg-[var(--bg-elevated)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* CTA row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-44 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-11 w-52 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-11 w-40 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-11 w-36 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* Agenda block — glass-card with heading + rows */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="h-5 w-44 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
          ))}
        </div>
      </div>

      {/* "Disponible dès maintenant" block */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="h-5 w-52 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-4 rounded bg-[var(--bg-elevated)] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
