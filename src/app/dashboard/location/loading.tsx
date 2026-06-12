// ─────────────────────────────────────────────────────────────────────
// Minimal route shell for the /dashboard/location HUB.
// ─────────────────────────────────────────────────────────────────────
// The hub is now a thin client-fetch shell (pattern 0435d4b), so this
// route-level skeleton barely ever shows — RentalHubView renders its own
// internal skeletons (KPI cards + agenda) while fetching. Kept as a light
// header-only shell to avoid a double-skeleton flash.
//
// This is also the SHARED fallback for child segments without their own
// loading.tsx (vehicules / clients / tarifs) — those self-fetch in the
// browser with internal skeletons too, so a header-only flash is fine.
// contrats, prospects and contrats/[id] ship their own loading.tsx.
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
    </div>
  )
}
