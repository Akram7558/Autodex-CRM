'use client'

import { Sparkles, AlertTriangle, Clock } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// TrialBadge — small pill rendered on showroom rows / cards.
// ─────────────────────────────────────────────────────────────────────
// Renders nothing for non-trial showrooms (`is_trial=false`). For trial
// showrooms it picks one of three states:
//
//   active=false                  → "Essai expiré"          (rose)
//   active + days_left <= 0       → "Essai expiré"          (rose)
//   active + days_left ≤ 7        → "Essai — N jours"        (rose, urgent)
//   active + days_left  > 7       → "Essai — N jours"        (amber)
//
// `days_left` is computed by ceiling, so a trial that ends in 23 hours
// reads "1 jour" rather than "0".
// ─────────────────────────────────────────────────────────────────────

export type TrialBadgeProps = {
  trial_ends_at: string | null | undefined
  is_trial:      boolean | null | undefined
  active:        boolean | null | undefined
  size?:         'sm' | 'md'
}

const SIZE_CLASS: Record<NonNullable<TrialBadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
}

export function TrialBadge({
  trial_ends_at,
  is_trial,
  active,
  size = 'sm',
}: TrialBadgeProps) {
  if (!is_trial) return null

  const sizeCls = SIZE_CLASS[size]
  const iconSz  = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'

  // Inactive trial = expired.
  if (!active) {
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 ${sizeCls}`}
      >
        <AlertTriangle className={iconSz} />
        Essai expiré
      </span>
    )
  }

  if (!trial_ends_at) {
    // is_trial=true with no end date — render a neutral "Essai" pill so
    // we still surface the trial status. Shouldn't happen in practice.
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 ${sizeCls}`}
      >
        <Sparkles className={iconSz} />
        Essai
      </span>
    )
  }

  const ends    = new Date(trial_ends_at)
  const daysLft = Math.ceil((ends.getTime() - Date.now()) / 86_400_000)

  if (daysLft <= 0) {
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 ${sizeCls}`}
      >
        <AlertTriangle className={iconSz} />
        Essai expiré
      </span>
    )
  }

  // Urgent palette under a week.
  if (daysLft <= 7) {
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 ${sizeCls}`}
        title={`Expire le ${ends.toLocaleDateString('fr-DZ')}`}
      >
        <AlertTriangle className={iconSz} />
        Essai — {daysLft} jour{daysLft > 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center font-black uppercase tracking-widest border rounded-full bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 ${sizeCls}`}
      title={`Expire le ${ends.toLocaleDateString('fr-DZ')}`}
    >
      <Clock className={iconSz} />
      Essai — {daysLft} jours
    </span>
  )
}
