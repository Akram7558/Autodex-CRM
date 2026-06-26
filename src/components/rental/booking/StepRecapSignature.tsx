'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Step 4: récap.
// ─────────────────────────────────────────────────────────────────────
// Read-only recap of the whole booking (vehicle, customer, dates, pricing).
// Signature capture was removed from the new-contract flow; historical
// signatures still render on the contract detail page.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Car as CarIcon, User, CalendarDays } from 'lucide-react'
import { getSignedReadUrl } from '@/lib/rental/storage'
import {
  type BookingState,
  computeDurationDays, computePricing, formatDateFr, formatDZD,
} from '@/components/rental/booking/types'

export default function StepRecapSignature({
  state, onValidity,
}: {
  state:      BookingState
  onValidity: (valid: boolean) => void
}) {
  const durationDays = computeDurationDays(state.startDate, state.endDate)
  const { basePrice, discountAmount, total } = computePricing(
    state.vehicle?.daily_rate, durationDays, state.discountType, state.discountValue,
  )

  // Signature is optional at draft stage — step is always submittable.
  useEffect(() => { onValidity(true) }, [onValidity])

  const v = state.vehicle
  const c = state.customer

  return (
    <div className="space-y-6">
      {/* ── Recap ───────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Vehicle */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 p-3">
            <Thumb path={v?.photos_urls?.[0] ?? null} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Véhicule</p>
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {v ? `${v.marque} ${v.modele}` : '—'} {v?.annee ? <span className="font-normal text-[var(--text-secondary)]">· {v.annee}</span> : null}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{v?.immatriculation ?? ''}</p>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c?.full_name ?? '—'}</p>
            <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c?.phone ?? ''}</p>
          </div>
        </div>
      </section>

      {/* Dates + pricing */}
      <section className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <Row icon={<CalendarDays className="w-4 h-4" />} label="Période">
          {formatDateFr(state.startDate)} {state.startTime} → {formatDateFr(state.endDate)} {state.endTime}
          <span className="text-[var(--text-muted)]"> · {durationDays ?? 0} jour{(durationDays ?? 0) > 1 ? 's' : ''}</span>
        </Row>
        <hr style={{ borderColor: 'var(--border)' }} />
        <Line label="Prix de base">{formatDZD(basePrice)}</Line>
        {discountAmount > 0 && <Line label="Remise" muted>− {formatDZD(discountAmount)}</Line>}
        <Line label="Total" strong>{formatDZD(total)}</Line>
        <Line label="Caution" muted>{formatDZD(state.depositAmount)}</Line>
      </section>
    </div>
  )
}

// ─── Recap atoms ────────────────────────────────────────────────────
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5" style={{ color: 'var(--accent)' }}>{icon}</span>
      <span><span className="text-[var(--text-muted)]">{label} : </span><span className="text-[var(--text-primary)]">{children}</span></span>
    </div>
  )
}
function Line({ label, children, strong, muted }: { label: string; children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className={strong ? 'text-base font-bold tabular-nums' : 'tabular-nums'}
        style={{ color: muted ? 'var(--text-secondary)' : 'var(--text-primary)' }}
      >
        <bdi>{children}</bdi>
      </span>
    </div>
  )
}

function Thumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); return }
    ;(async () => { const u = await getSignedReadUrl(path); if (!cancelled) setUrl(u) })()
    return () => { cancelled = true }
  }, [path])
  return (
    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <CarIcon className="w-6 h-6" style={{ color: 'var(--accent)', opacity: 0.5 }} />
      )}
    </div>
  )
}
