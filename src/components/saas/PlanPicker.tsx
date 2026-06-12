'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Calendar, AlertTriangle, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SaasPlan, SaasPlanType } from '@/lib/types'

// The 9 plans (3 tiers × 3 durations) are grouped into labeled tier rows so
// the picker stays compact vertically. Order + short labels for the headers.
const TIER_ORDER: SaasPlanType[] = ['classique', 'location', 'totale']
const TIER_LABEL: Record<SaasPlanType, string> = {
  classique: 'Classique',
  location:  'Location',
  totale:    'La Totale',
}

// ─────────────────────────────────────────────────────────────────────
// PlanPicker — shared radio-card UI used by
//   - ShowroomsManager creation modal (with "Sans plan" extra option)
//   - ConvertTrialModal
//   - DirectConvertModal
//
// The parent owns `value` (plan id, 'custom', 'none') and the derived
// fields (contract_amount, expires_at). PlanPicker only renders the
// cards + emits onChange + exposes the loaded plans so the parent can
// look up the selected plan's price/duration.
// ─────────────────────────────────────────────────────────────────────

export type PlanPickerValue = string | 'custom' | 'none'

export type PlanPickerProps = {
  value:           PlanPickerValue
  onChange:        (next: PlanPickerValue, plan: SaasPlan | null) => void
  /** Show the "Sans plan" option (used by showroom creation form). */
  allowNone?:      boolean
  /** Show the "Personnalisé" option (used by ConvertTrialModal). */
  allowCustom?:    boolean
  /** Optional label shown above the cards. */
  label?:          string
}

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export function PlanPicker({
  value,
  onChange,
  allowNone   = false,
  allowCustom = false,
  label       = 'Plan',
}: PlanPickerProps) {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/saas-plans')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const all = (j.plans ?? []) as SaasPlan[]
        setPlans(all.filter(p => p.active))
      })
      .catch(() => { if (!cancelled) setError('Erreur de chargement des plans.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function pick(next: PlanPickerValue) {
    if (next === 'custom' || next === 'none') {
      onChange(next, null)
      return
    }
    const plan = plans.find(p => p.id === next) ?? null
    onChange(next, plan)
  }

  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>

      {loading ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
          Chargement des plans…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-900 dark:text-amber-200">
            Aucun plan configuré.{' '}
            <Link
              href="/dashboard/super-admin/parametres"
              className="underline font-bold hover:text-amber-700 dark:hover:text-amber-100"
            >
              Ajoutez des plans dans Paramètres
            </Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {TIER_ORDER.map((tier) => {
            const group = plans.filter((p) => (p.plan_type ?? 'classique') === tier)
            if (group.length === 0) return null
            return (
              <div key={tier}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  {TIER_LABEL[tier]}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {group.map((p) => {
                    const selected = value === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pick(p.id)}
                        className={cn(
                          'rounded-lg border p-2 text-left transition-all',
                          selected
                            ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/10 ring-2 ring-violet-500/30'
                            : 'border-border bg-background hover:border-violet-300 dark:hover:border-violet-500/40',
                        )}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-[12px] font-bold text-foreground leading-tight">{p.name}</p>
                          {selected && <CheckCircle2 className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                        </div>
                        <p className="mt-1 text-[13px] font-black text-violet-700 dark:text-violet-300">
                          {formatDzd(p.price)} <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">DZD</span>
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Auxiliary options — opt-in via props */}
      {(allowNone || allowCustom) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {allowNone && (
            <button
              type="button"
              onClick={() => pick('none')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors',
                value === 'none'
                  ? 'bg-zinc-200 dark:bg-zinc-700 text-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Crown className="w-3.5 h-3.5" />
              Sans plan
            </button>
          )}
          {allowCustom && (
            <button
              type="button"
              onClick={() => pick('custom')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors',
                value === 'custom'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Personnalisé
            </button>
          )}
        </div>
      )}
    </div>
  )
}
