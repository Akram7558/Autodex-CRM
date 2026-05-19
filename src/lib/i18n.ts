// ─────────────────────────────────────────────────────────────────────
// Landing i18n helpers — FR default, AR with RTL.
// ─────────────────────────────────────────────────────────────────────
// Project-wide there is no existing i18n setup (the old landing
// renders both languages side-by-side per-element). This module is
// the entry point for the new locale-switching system.
//
// Storage key: `autodex-locale`. Value: 'fr' | 'ar'.
// ─────────────────────────────────────────────────────────────────────

export type Locale = 'fr' | 'ar'

const STORAGE_KEY = 'autodex-locale'

/** Initial locale: persisted choice, else 'fr'. */
export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'fr'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'fr' || stored === 'ar') return stored
  } catch {
    /* ignore */
  }
  return 'fr'
}

/** Apply locale: `lang` + `dir` attributes on `<html>`, persist choice. */
export function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('lang', locale)
  root.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
}
