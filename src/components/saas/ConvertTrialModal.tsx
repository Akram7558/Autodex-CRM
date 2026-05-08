'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { X, CheckCircle2, Crown, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SaasPlan, Showroom } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────
// ConvertTrialModal
// ─────────────────────────────────────────────────────────────────────
// Converts a trial showroom to a paid subscription. The user picks one
// of the configured plans (radio cards) — or "Personnalisé" to fall back
// to the legacy free-form amount + date pickers. The plan choice
// pre-fills `contract_amount` (= plan.price) and `expires_at` (= today +
// plan.duration_months); both are still editable overrides.
//
// On submit:
//   POST /api/admin/convert-trial
//     { showroom_id, plan_id?, contract_amount, expires_at }
// ─────────────────────────────────────────────────────────────────────

function todayPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayInputValue(): string {
  return todayPlusDays(0)
}

function formatDzd(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(num)
}

export function ConvertTrialModal({
  open,
  showroom,
  onClose,
  onConverted,
}: {
  open: boolean
  showroom: Showroom | null
  onClose: () => void
  onConverted: (info: { expires_at: string; contract_amount: number; plan_id: string | null }) => void
}) {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [loadError, setLoadError] = useState('')

  // 'custom' means use the manual amount + date fields. Any other value
  // is the chosen plan id.
  const [pick, setPick]                 = useState<'custom' | string>('custom')
  const [contractAmount, setAmount]     = useState('')
  const [expiresAt, setExpiresAt]       = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Fetch plans on open ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    setLoadingPlans(true); setLoadError('')
    fetch('/api/saas-plans')
      .then((r) => r.json())
      .then((j) => setPlans(((j.plans ?? []) as SaasPlan[]).filter(p => p.active)))
      .catch(() => setLoadError('Erreur de chargement des plans.'))
      .finally(() => setLoadingPlans(false))
  }, [open])

  // ── Reset / preseed the picker each time the modal opens ──────────
  useEffect(() => {
    if (!open) return
    if (plans.length > 0) {
      // Default to the first active plan (cheapest by duration).
      setPick(plans[0].id)
    } else {
      setPick('custom')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plans.length])

  // ── Pre-fill amount/date based on the picker ──────────────────────
  useEffect(() => {
    if (pick === 'custom') {
      // Preserve whatever the user already typed.
      if (!expiresAt) setExpiresAt(todayPlusDays(30))
      return
    }
    const plan = plans.find(p => p.id === pick)
    if (plan) {
      setAmount(String(plan.price))
      setExpiresAt(todayPlusDays(Math.max(1, plan.duration_months * 30)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick])

  // Esc closes (when not saving).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === pick) ?? null,
    [plans, pick],
  )

  if (!open || !showroom) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!showroom) return
    setError('')
    const amountNum = Number(contractAmount)
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError('Montant du contrat invalide.'); return
    }
    if (!expiresAt) {
      setError('Date d\'expiration requise.'); return
    }
    setSaving(true)
    const res = await fetch('/api/admin/convert-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showroom_id:     showroom.id,
        plan_id:         pick === 'custom' ? null : pick,
        contract_amount: amountNum,
        // datetime-local-style strings get auto-coerced server-side.
        expires_at:      new Date(expiresAt + 'T23:59:59').toISOString(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? 'Échec de la conversion.')
      return
    }
    onConverted({
      expires_at:      String(json.expires_at ?? expiresAt),
      contract_amount: Number(json.contract_amount ?? amountNum),
      plan_id:         (json.plan_id as string | null) ?? (pick === 'custom' ? null : pick),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-violet-500" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Convertir l&apos;essai en abonnement</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{showroom.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {/* ── Plan picker ──────────────────────────────────────── */}
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Plan</p>

            {loadingPlans ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                Chargement des plans…
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {loadError}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {plans.map((p) => {
                  const selected = pick === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPick(p.id)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all',
                        selected
                          ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/10 ring-2 ring-violet-500/30'
                          : 'border-border bg-background hover:border-violet-300 dark:hover:border-violet-500/40',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.duration_months} mois</p>
                        </div>
                        {selected && <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />}
                      </div>
                      <p className="mt-2 text-sm font-black text-violet-700 dark:text-violet-300">
                        {formatDzd(p.price)} <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">DZD</span>
                      </p>
                    </button>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPick('custom')}
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors',
                pick === 'custom'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Personnalisé
            </button>
          </div>

          {/* ── Amount + date (auto-filled, editable) ────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Montant du contrat (DZD) *</label>
              <input
                type="number"
                min={0}
                step={1}
                value={contractAmount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex. 25000"
                required
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              {selectedPlan && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pré-rempli depuis le plan « {selectedPlan.name} » · modifiable
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date d&apos;expiration *</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={todayInputValue()}
                required
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              {selectedPlan && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Calculée automatiquement · modifiable
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || (plans.length === 0 && pick !== 'custom')}
              className="px-5 py-2 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 font-medium"
            >
              {saving ? 'Conversion…' : 'Convertir en abonnement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
