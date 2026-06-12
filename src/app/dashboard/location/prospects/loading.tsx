// ─────────────────────────────────────────────────────────────────────
// Minimal route shell for /dashboard/location/prospects.
// ─────────────────────────────────────────────────────────────────────
// The page is now a thin client-fetch shell (commit pattern 0435d4b), so
// this route-level skeleton barely ever shows — RentalProspectsList renders
// its own internal skeleton while fetching. Kept as a light header-only
// shell (no pills, no list) to avoid a double-skeleton flash.
//
// Presentational only: no data, no hooks, no imports.
export default function ProspectsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header: badge + title + subtitle (matches the live header position) */}
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-7 w-64 max-w-full rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded-md bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    </div>
  )
}
