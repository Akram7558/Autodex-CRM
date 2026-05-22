'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Step 3: tarif (pricing + discount + deposit + notes).
// ─────────────────────────────────────────────────────────────────────
// Read-only base price (daily_rate × durationDays), an editable discount
// (DZD amount or %), the resulting total, an editable deposit (caution,
// pre-seeded from the vehicle), and optional notes. Everything writes to
// wizard state; the server re-derives the total at insert (never trusted).
// ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { Percent, Banknote, ShieldCheck } from 'lucide-react'
import {
  type BookingAction, type BookingState,
  computeDurationDays, computePricing, formatDZD,
} from '@/components/rental/booking/types'

export default function StepPricing({
  state, dispatch, onValidity,
}: {
  state:      BookingState
  dispatch:   (a: BookingAction) => void
  onValidity: (valid: boolean) => void
}) {
  const durationDays = computeDurationDays(state.startDate, state.endDate)
  const dailyRate = state.vehicle?.daily_rate ?? 0
  const { basePrice, discountAmount, total } = computePricing(
    dailyRate, durationDays, state.discountType, state.discountValue,
  )

  const depositOk = Number.isFinite(state.depositAmount) && state.depositAmount >= 0
  const overAmount = state.discountType === 'amount' && state.discountValue > basePrice
  const overPercent = state.discountType === 'percent' && state.discountValue > 100

  useEffect(() => {
    onValidity(state.vehicle != null && durationDays != null && depositOk)
  }, [state.vehicle, durationDays, depositOk, onValidity])

  return (
    <div className="space-y-6">
      {/* ── Base price breakdown ────────────────────────────── */}
      <section
        className="rounded-2xl p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>
            {formatDZD(dailyRate)} <span className="text-[var(--text-muted)]">/ jour</span>
            {' × '}
            <bdi className="tabular-nums">{durationDays ?? 0}</bdi> jour{(durationDays ?? 0) > 1 ? 's' : ''}
          </span>
          <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatDZD(basePrice)}</span>
        </div>
      </section>

      {/* ── Discount ────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Remise (optionnel)</h3>
        <div className="flex flex-wrap items-center gap-3">
          {/* type toggle */}
          <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
            <ToggleBtn
              active={state.discountType === 'amount'}
              onClick={() => dispatch({ type: 'SET_PRICING', patch: { discountType: 'amount' } })}
              icon={<Banknote className="w-4 h-4" />} label="DZD"
            />
            <ToggleBtn
              active={state.discountType === 'percent'}
              onClick={() => dispatch({ type: 'SET_PRICING', patch: { discountType: 'percent' } })}
              icon={<Percent className="w-4 h-4" />} label="%"
            />
          </div>
          {/* value */}
          <div className="relative">
            <input
              type="number"
              min={0}
              max={state.discountType === 'percent' ? 100 : undefined}
              value={state.discountValue === 0 ? '' : state.discountValue}
              onChange={(e) => {
                const n = Number(e.target.value)
                dispatch({ type: 'SET_PRICING', patch: { discountValue: Number.isFinite(n) && n > 0 ? n : 0 } })
              }}
              placeholder="0"
              className="w-32 h-10 px-3 rounded-lg text-sm tabular-nums"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {state.discountType === 'percent' ? '%' : 'DZD'}
            </span>
          </div>
          {discountAmount > 0 && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              − <bdi className="tabular-nums font-semibold">{formatDZD(discountAmount)}</bdi>
            </span>
          )}
        </div>
        {overAmount && (
          <p className="mt-2 text-xs" style={{ color: '#fb7185' }}>Remise plafonnée au montant de base.</p>
        )}
        {overPercent && (
          <p className="mt-2 text-xs" style={{ color: '#fb7185' }}>Maximum 100 %.</p>
        )}
      </section>

      {/* ── Total ───────────────────────────────────────────── */}
      <section
        className="rounded-2xl p-5 flex items-center justify-between"
        style={{ background: 'var(--accent-subtle)', border: '1.5px solid var(--accent)' }}
      >
        <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Total location
        </span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          <bdi>{formatDZD(total)}</bdi>
        </span>
      </section>

      {/* ── Deposit ─────────────────────────────────────────── */}
      <section>
        <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Caution (DZD)
        </label>
        <input
          type="number"
          min={0}
          value={state.depositAmount === 0 ? '' : state.depositAmount}
          onChange={(e) => {
            const n = Number(e.target.value)
            dispatch({ type: 'SET_PRICING', patch: { depositAmount: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 } })
          }}
          placeholder="0"
          className="w-full sm:w-56 h-10 px-3 rounded-lg text-sm tabular-nums"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Pré-rempli depuis le véhicule — modifiable.
        </p>
      </section>

      {/* ── Notes ───────────────────────────────────────────── */}
      <section>
        <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Notes (optionnel)</label>
        <textarea
          value={state.notes}
          onChange={(e) => dispatch({ type: 'SET_PRICING', patch: { notes: e.target.value } })}
          rows={3}
          placeholder="Conditions particulières, accessoires, remarques…"
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </section>
    </div>
  )
}

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
      style={active
        ? { background: 'var(--accent)', color: '#fff' }
        : { background: 'transparent', color: 'var(--text-secondary)' }}
    >
      {icon}{label}
    </button>
  )
}
