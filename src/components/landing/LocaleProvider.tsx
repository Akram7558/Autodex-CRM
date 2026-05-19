'use client'
// ─────────────────────────────────────────────────────────────────────
// LocaleProvider — single source of truth for the landing locale.
// ─────────────────────────────────────────────────────────────────────
// Wraps the landing so every consumer of `useTranslations()` /
// `useLocale()` re-renders the moment the locale flips. Without this
// context the previous hook initialised state per-component and never
// rebroadcast changes (the bug — `<html dir>` flipped, copy stayed
// French).
//
// The provider also takes ownership of `applyLocale()` so individual
// components never have to know about the DOM side-effect.
// ─────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { applyLocale, getInitialLocale, type Locale } from '@/lib/i18n'

type LocaleCtxValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  dir: 'ltr' | 'rtl'
}

const LocaleCtx = createContext<LocaleCtxValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr')

  // Hydrate persisted locale on mount; the inline boot script in
  // root layout already set <html lang/dir>, but we still re-call
  // applyLocale here in case the DOM was lost (HMR, race, etc.).
  useEffect(() => {
    const initial = getInitialLocale()
    setLocaleState(initial)
    applyLocale(initial)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    applyLocale(l)
  }, [])

  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <LocaleCtx.Provider value={{ locale, setLocale, dir }}>
      {children}
    </LocaleCtx.Provider>
  )
}

export function useLocale(): LocaleCtxValue {
  const ctx = useContext(LocaleCtx)
  if (!ctx) {
    throw new Error('useLocale must be used inside LocaleProvider')
  }
  return ctx
}
