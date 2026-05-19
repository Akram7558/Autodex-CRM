'use client'
// ─────────────────────────────────────────────────────────────────────
// useTranslations — client-side locale + translator hook.
// ─────────────────────────────────────────────────────────────────────
// Reads the initial locale from localStorage (or 'fr' fallback) on
// mount, applies it to the document (lang + dir), and returns:
//   • locale  — current locale ('fr' | 'ar')
//   • setLocale — switch + persist + re-render
//   • t(key, fallback?) — look up the key in the active dictionary,
//       fallback to the FR string, then to the literal key.
//   • dir — 'ltr' | 'rtl' for inline styling convenience.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { type Locale, getInitialLocale, applyLocale } from '@/lib/i18n'
import { translations } from '@/lib/landing/translations'

export function useTranslations() {
  const [locale, setLocaleState] = useState<Locale>('fr')

  // Hydrate the persisted locale on mount; also re-apply the document
  // attrs (the inline boot script does this synchronously to avoid
  // FOUC, but re-applying keeps client + server in lockstep).
  useEffect(() => {
    const initial = getInitialLocale()
    setLocaleState(initial)
    applyLocale(initial)
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    applyLocale(next)
  }, [])

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const dict = translations[locale] ?? {}
      if (dict[key]) return dict[key]
      // Fallback to French (default copy) before defaulting to the
      // literal key — useful while we're populating dictionaries.
      const fr = translations.fr?.[key]
      if (fr) return fr
      return fallback ?? key
    },
    [locale],
  )

  return {
    locale,
    setLocale,
    t,
    dir: (locale === 'ar' ? 'rtl' : 'ltr') as 'ltr' | 'rtl',
  }
}
