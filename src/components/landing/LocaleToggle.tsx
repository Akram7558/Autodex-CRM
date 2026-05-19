'use client'
// ─────────────────────────────────────────────────────────────────────
// Landing LocaleToggle — switch between FR (default) and AR (RTL).
// ─────────────────────────────────────────────────────────────────────
// Lives next to the ThemeToggle in the landing header / footer.
// On click flips the active locale, applies it to <html> (lang + dir)
// and persists the choice. The hook re-renders consumers of
// `useTranslations()` automatically.
// ─────────────────────────────────────────────────────────────────────

import { useTranslations } from '@/hooks/useTranslations'
import type { Locale } from '@/lib/i18n'

const LABELS: Record<Locale, { flag: string; code: string; full: string }> = {
  fr: { flag: '🇫🇷', code: 'FR', full: 'Français' },
  ar: { flag: '🇩🇿', code: 'AR', full: 'العربية' },
}

export function LocaleToggle() {
  const { locale, setLocale } = useTranslations()
  const next: Locale = locale === 'fr' ? 'ar' : 'fr'
  const current = LABELS[locale]
  const nextLabel = LABELS[next]

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`Passer en ${nextLabel.full}`}
      title={`Passer en ${nextLabel.full}`}
      className="inline-flex items-center gap-2 px-3 h-10 rounded-full backdrop-blur-md text-sm font-medium transition-all duration-300 hover:ring-2 hover:ring-emerald-500/40 hover:shadow-[0_0_20px_var(--accent-glow)]"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <span aria-hidden="true" className="text-base leading-none">{current.flag}</span>
      <span className="tabular-nums">{current.code}</span>
    </button>
  )
}

export default LocaleToggle
