'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Phase 2B, chunk 1.
// ─────────────────────────────────────────────────────────────────────
// 4-step shell for creating a rental contract. Chunk 1 implements step 1
// (vehicle + dates + availability) and step 2 (customer); steps 3 (tarif)
// and 4 (récap & signature) are placeholders for chunk 2. NOTHING is
// written to `rentals` here — the wizard holds everything in memory and
// the draft is created at the end of step 4 in chunk 2.
//
// Access is gated by middleware (ROUTE_ACL: /dashboard/location →
// owner/manager/closer/super_admin) and by the RLS-backed APIs the steps
// call. prospecteur has no location access.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useReducer, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  bookingReducer, initialBookingState, computeDurationDays,
  formatDateFr, formatDZD,
} from '@/components/rental/booking/types'
import StepVehicleDates from '@/components/rental/booking/StepVehicleDates'
import StepCustomer from '@/components/rental/booking/StepCustomer'

const STEPS = [
  { n: 1, label: 'Véhicule & dates' },
  { n: 2, label: 'Client' },
  { n: 3, label: 'Tarif' },
  { n: 4, label: 'Récap & signature' },
] as const

export default function NewRentalWizardPage() {
  const [state, dispatch] = useReducer(bookingReducer, undefined, initialBookingState)
  const [stepValid, setStepValid] = useState(false)

  // Stable callback so step effects don't re-fire each render.
  const handleValidity = useCallback((v: boolean) => setStepValid(v), [])

  const goTo = useCallback((step: 1 | 2 | 3 | 4) => {
    setStepValid(false)            // new step re-reports its own validity
    dispatch({ type: 'GOTO', step })
  }, [])

  function next() {
    if (state.step < 4 && stepValid) goTo((state.step + 1) as 1 | 2 | 3 | 4)
  }
  function back() {
    if (state.step > 1) goTo((state.step - 1) as 1 | 2 | 3 | 4)
  }

  const durationDays = computeDurationDays(state.startDate, state.endDate)

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/location"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          aria-label="Retour au tableau de bord Location"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <KeyRound className="w-3.5 h-3.5" /> Location · Nouveau contrat
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Nouvelle location
          </h1>
        </div>
      </div>

      {/* Progress indicator */}
      <ol className="flex items-center gap-2 sm:gap-3" aria-label="Étapes">
        {STEPS.map((s, i) => {
          const status: 'done' | 'current' | 'todo' =
            s.n < state.step ? 'done' : s.n === state.step ? 'current' : 'todo'
          const clickable = s.n < state.step
          return (
            <li key={s.n} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && goTo(s.n)}
                aria-current={status === 'current' ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 min-w-0',
                  clickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-colors duration-150 motion-reduce:transition-none"
                  style={
                    status === 'done'
                      ? { background: 'var(--accent)', color: '#fff' }
                      : status === 'current'
                        ? { background: 'var(--accent-subtle)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                  }
                >
                  {status === 'done' ? <Check className="w-4 h-4" /> : s.n}
                </span>
                <span
                  className={cn(
                    'text-xs sm:text-sm font-medium truncate hidden sm:block',
                    status === 'todo' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]',
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="flex-1 h-px min-w-3" style={{ background: 'var(--border)' }} aria-hidden />
              )}
            </li>
          )
        })}
      </ol>

      {/* Step content */}
      <div
        className="rounded-2xl p-5 sm:p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
      >
        {state.step === 1 && (
          <StepVehicleDates state={state} dispatch={dispatch} onValidity={handleValidity} />
        )}
        {state.step === 2 && (
          <StepCustomer state={state} dispatch={dispatch} onValidity={handleValidity} />
        )}
        {state.step === 3 && (
          <PlaceholderStep
            title="Tarif"
            summary={
              state.vehicle && durationDays != null
                ? `${state.vehicle.marque} ${state.vehicle.modele} · ${durationDays} jour${durationDays > 1 ? 's' : ''} · base ${formatDZD(state.vehicle.daily_rate)}/jour`
                : undefined
            }
          />
        )}
        {state.step === 4 && (
          <PlaceholderStep
            title="Récapitulatif & signature"
            summary={
              state.vehicle && state.customer && durationDays != null
                ? `${state.vehicle.marque} ${state.vehicle.modele} · ${formatDateFr(state.startDate)} → ${formatDateFr(state.endDate)} · ${state.customer.full_name}`
                : undefined
            }
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={state.step === 1}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> Retour
        </button>

        {state.step < 4 ? (
          <button
            type="button"
            onClick={next}
            disabled={!stepValid}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
          >
            Continuer <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Disponible au chunk 2"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold text-white opacity-60 cursor-not-allowed"
            style={{ background: 'var(--accent)' }}
          >
            Créer le contrat
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 ms-1">Chunk 2</span>
          </button>
        )}
      </div>
    </div>
  )
}

function PlaceholderStep({ title, summary }: { title: string; summary?: string }) {
  return (
    <div className="py-10 text-center">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        À venir — chunk 2.
      </p>
      {summary && (
        <p className="mt-4 inline-block rounded-lg px-3 py-2 text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {summary}
        </p>
      )}
    </div>
  )
}
