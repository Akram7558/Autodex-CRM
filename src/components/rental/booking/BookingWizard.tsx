'use client'
// ─────────────────────────────────────────────────────────────────────
// BookingWizard — 4-step rental contract creation (Phase 2B + chunk D).
// ─────────────────────────────────────────────────────────────────────
//   1 Véhicule & dates (availability)   2 Client
//   3 Tarif (pricing/discount/deposit)  4 Récap & signature → create draft
// Held in memory (useReducer); the rental row is inserted as 'draft' only
// on "Créer le contrat" (POST /api/rental/rentals, re-validates + re-checks
// availability).
//
// When opened from a rental prospect (?from_prospect via the server page),
// `prefill` seeds the vehicle + dates and primes the customer step; on
// successful creation the server links the prospect (status='convertie',
// converted_rental_id).
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useReducer, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, KeyRound, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadViaSignedUrl } from '@/lib/rental/storage'
import {
  bookingReducer, bookingStateFromPrefill, rentalStatusLabel,
  type WizardPrefill,
} from '@/components/rental/booking/types'
import StepVehicleDates from '@/components/rental/booking/StepVehicleDates'
import StepCustomer from '@/components/rental/booking/StepCustomer'
import StepPricing from '@/components/rental/booking/StepPricing'
import StepRecapSignature from '@/components/rental/booking/StepRecapSignature'

const STEPS = [
  { n: 1, label: 'Véhicule & dates' },
  { n: 2, label: 'Client' },
  { n: 3, label: 'Tarif' },
  { n: 4, label: 'Récap & signature' },
] as const

type CreatedContract = { id: string; contract_number: string | null }

export default function BookingWizard({ prefill }: { prefill?: WizardPrefill | null }) {
  const router = useRouter()
  const [state, dispatch] = useReducer(bookingReducer, prefill ?? null, bookingStateFromPrefill)
  const [stepValid, setStepValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedContract | null>(null)

  const fromProspectId = prefill?.fromProspectId ?? null
  const customerPrefill = prefill && (prefill.customerName || prefill.customerPhone)
    ? { name: prefill.customerName, phone: prefill.customerPhone }
    : undefined

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

  async function handleCreate() {
    if (!state.vehicle || !state.customer || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // 1. Upload the signature (optional) via the signed-upload flow.
      let signaturePath: string | null = null
      if (state.signatureDataUrl) {
        try {
          const blob = await (await fetch(state.signatureDataUrl)).blob()
          const file = new File([blob], 'signature.png', { type: 'image/png' })
          signaturePath = await uploadViaSignedUrl(file, { kind: 'rental_signature', file_ext: 'png' })
        } catch {
          signaturePath = null   // non-fatal — create the draft without it
        }
      }

      // 2. Create the rental (server re-validates everything + links the
      //    prospect when from_prospect_id is present).
      const res = await fetch('/api/rental/rentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rental_vehicle_id: state.vehicle.id,
          customer_id:       state.customer.id,
          start_date:        state.startDate,
          start_time:        state.startTime,
          end_date:          state.endDate,
          end_time:          state.endTime,
          discount_type:     state.discountType,
          discount_value:    state.discountValue,
          deposit_amount:    state.depositAmount,
          notes:             state.notes || null,
          signature_path:    signaturePath,
          from_prospect_id:  fromProspectId,
        }),
      })
      const j = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setSubmitError(j?.message ?? 'Ce véhicule est indisponible pour ces dates.')
        setSubmitting(false)
        return
      }
      if (!res.ok || !j.rental) {
        setSubmitError(j?.error ?? 'Création du contrat échouée.')
        setSubmitting(false)
        return
      }

      const rental = j.rental as CreatedContract
      setCreated(rental)
      // Both flows land on the new contract's detail page. The prospect (if
      // any) was already marked convertie + linked server-side. router.replace
      // so the back button doesn't return to the filled wizard (no re-submit).
      setTimeout(() => { dispatch({ type: 'RESET' }); router.replace(`/dashboard/location/contrats/${rental.id}`) }, 1500)
    } catch {
      setSubmitError('Erreur réseau. Réessayez.')
      setSubmitting(false)
    }
  }

  // ── Success state ───────────────────────────────────────────
  if (created) {
    return (
      <div className="p-6 md:p-10 max-w-lg mx-auto">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
        >
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Contrat créé</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Statut : {rentalStatusLabel('draft')} — à confirmer.
            {fromProspectId && ' La demande a été marquée « Convertie ».'}
          </p>
          {created.contract_number && (
            <p className="mt-4 inline-block rounded-lg px-3 py-2 text-sm font-mono font-semibold tabular-nums"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
              {created.contract_number}
            </p>
          )}
          <div className="mt-6">
            <Link
              href={`/dashboard/location/contrats/${created.id}`}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
            >
              Voir le contrat <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={fromProspectId ? '/dashboard/location/prospects' : '/dashboard/location'}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <KeyRound className="w-3.5 h-3.5" /> Location · {fromProspectId ? 'Conversion demande' : 'Nouveau contrat'}
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Nouvelle location
          </h1>
        </div>
      </div>

      {/* Prefill notice: requested vehicle no longer available */}
      {prefill?.vehicleUnavailable && !state.vehicle && state.step === 1 && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Le véhicule demandé n&apos;est plus disponible, choisissez-en un autre.
        </div>
      )}

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
        {state.step === 1 && <StepVehicleDates state={state} dispatch={dispatch} onValidity={handleValidity} />}
        {state.step === 2 && <StepCustomer state={state} dispatch={dispatch} onValidity={handleValidity} prefill={customerPrefill} prefilledCustomerId={prefill?.customer?.id ?? null} />}
        {state.step === 3 && <StepPricing state={state} dispatch={dispatch} onValidity={handleValidity} />}
        {state.step === 4 && <StepRecapSignature state={state} dispatch={dispatch} onValidity={handleValidity} />}
      </div>

      {submitError && (
        <p className="text-sm rounded-xl px-4 py-3"
          style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
          {submitError}
        </p>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={state.step === 1 || submitting}
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
            onClick={handleCreate}
            disabled={submitting}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {submitting ? 'Création…' : 'Créer le contrat'}
          </button>
        )}
      </div>
    </div>
  )
}
