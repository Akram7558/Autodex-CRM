// ─────────────────────────────────────────────────────────────────────
// Instant skeleton for /dashboard/location/prospects (rental demand pipeline).
// ─────────────────────────────────────────────────────────────────────
// Overrides the parent location/loading.tsx for this segment. Shape mirrors
// RentalProspectsList EXACTLY — max-w-6xl wrapper, header (badge + title +
// subtitle, NO action button), the 5 status filter pill tabs, and the
// bordered list — so the real pipeline drops in with zero reflow.
//
// Presentational only: no data, no hooks, no imports.
export default function ProspectsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header: badge + title + subtitle (no right-hand button here) */}
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-7 w-64 max-w-full rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded-md bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* 5 status filter pill tabs */}
      <div className="flex flex-wrap gap-1.5">
        <div className="h-10 w-32 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-10 w-28 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-10 w-28 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-10 w-24 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-10 w-24 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* Bordered list — header strip + ~5 row bars */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-2.5 flex items-center gap-3">
          <div className="h-3 flex-1 min-w-0 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70" />
          <div className="hidden sm:block h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70 shrink-0" />
          <div className="h-3 w-16 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70 shrink-0" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="px-4 py-4 flex items-center gap-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="h-4 flex-1 min-w-0 rounded bg-[var(--bg-elevated)] animate-pulse" />
            <div className="hidden sm:block h-4 w-28 rounded bg-[var(--bg-elevated)] animate-pulse shrink-0" />
            <div className="h-6 w-20 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
