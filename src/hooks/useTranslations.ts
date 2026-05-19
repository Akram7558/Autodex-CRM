'use client'
// ─────────────────────────────────────────────────────────────────────
// useTranslations — locale + translator hook (reactive).
// ─────────────────────────────────────────────────────────────────────
// Reads from the LocaleProvider context so every consumer re-renders
// the moment the locale flips. Returns:
//   • locale  — current locale ('fr' | 'ar')
//   • setLocale — switch + persist + apply DOM attrs (via provider)
//   • t(key, vars?) — dotted-path lookup with FR fallback + {var}
//       interpolation. Examples:
//         t('hero.title.before')
//         t('pricing.cta.classique', { months: 3 })
//   • dir — 'ltr' | 'rtl' for inline styling convenience.
//
// Translations dictionary is a flat `Record<string, string>` per
// locale, but `t()` also supports nested objects when present — both
// shapes coexist so callers can pick whichever reads best.
// ─────────────────────────────────────────────────────────────────────

import { useLocale } from '@/components/landing/LocaleProvider'
import { translations } from '@/lib/landing/translations'

type Vars = Record<string, string | number>

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k]
    return v == null ? `{${k}}` : String(v)
  })
}

// Resolve a dotted key like 'features.f1.bullet.1' against a dict
// that may be either a flat `Record<string,string>` (current shape)
// OR a nested object. Returns the matched string or undefined.
function lookup(dict: unknown, key: string): string | undefined {
  if (dict == null || typeof dict !== 'object') return undefined
  // Fast path: flat dict.
  const flat = (dict as Record<string, unknown>)[key]
  if (typeof flat === 'string') return flat
  // Slow path: walk segments.
  const parts = key.split('.')
  let cur: unknown = dict
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

export function useTranslations() {
  const { locale, setLocale, dir } = useLocale()
  const dict = translations[locale] ?? translations.fr

  function t(key: string, vars?: Vars): string {
    const hit = lookup(dict, key)
    if (hit != null) return interpolate(hit, vars)
    // Fallback to FR before defaulting to the literal key.
    const fr = lookup(translations.fr, key)
    if (fr != null) return interpolate(fr, vars)
    return key
  }

  return { locale, setLocale, t, dir }
}
