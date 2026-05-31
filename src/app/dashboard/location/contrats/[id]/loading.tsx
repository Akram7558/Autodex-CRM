// ─────────────────────────────────────────────────────────────────────
// Instant skeleton for /dashboard/location/contrats/[id] (contract detail).
// ─────────────────────────────────────────────────────────────────────
// Overrides the parent location/loading.tsx for this segment. Shape mirrors
// ContractDetail EXACTLY — max-w-5xl wrapper, header (back button + title +
// status badge), the status-actions row, and the 2-column card grid
// (Client / Véhicule / Période / Financier) — so the real detail drops in
// with zero reflow.
//
// Presentational only: no data, no hooks, no imports.
export default function ContractDetailLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      {/* Header: back button + title block + status badge */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] animate-pulse shrink-0" />
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-[var(--bg-elevated)] animate-pulse" />
          <div className="h-7 w-32 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        </div>
        <div className="ms-auto h-7 w-24 rounded-full bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* Status actions + edit row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 w-28 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-9 w-24 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-9 w-24 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="ms-auto h-9 w-36 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* 2-column card grid (Client / Véhicule / Période / Financier) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-2xl p-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
              <div className="h-3 w-2/5 rounded bg-[var(--bg-elevated)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
