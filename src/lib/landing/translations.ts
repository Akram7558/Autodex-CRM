// ─────────────────────────────────────────────────────────────────────
// Landing translations — FR + AR.
// ─────────────────────────────────────────────────────────────────────
// Empty for chunk 1; populated in chunks 2 + 3 as each section ships.
// Keep keys flat-dotted (e.g. 'hero.title', 'pricing.cta.classique')
// so the `t()` lookup in `useTranslations` stays trivial.
// ─────────────────────────────────────────────────────────────────────

import type { Locale } from '@/lib/i18n'

export type TranslationKey = string
export type TranslationDict = Record<TranslationKey, string>

export const translations: Record<Locale, TranslationDict> = {
  fr: {
    // TODO chunk 2/3 — section copy lands here.
  },
  ar: {
    // TODO chunk 2/3 — section copy lands here.
  },
}
