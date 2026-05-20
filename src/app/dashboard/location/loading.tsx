// Instant skeleton for the rental (location) route segment and its
// children (vehicules / clients / tarifs). Next.js renders this via the
// segment's Suspense boundary while the server component resolves auth +
// plan + initial data, so navigation feels immediate instead of landing
// on a blank or stale screen during the fetch.
export default function LocationLoading() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded-md bg-[var(--bg-elevated)] animate-pulse" />
      </div>

      {/* Content cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="glass-card h-[280px] animate-pulse rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
