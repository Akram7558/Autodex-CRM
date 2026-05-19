// ─────────────────────────────────────────────────────────────────────
// Landing theme helpers (FoCar redesign chunk 1).
// ─────────────────────────────────────────────────────────────────────
// The dashboard ships with its own `ThemeProvider`
// (`src/components/theme-provider.tsx`) that uses a 3-state model
// ('light' | 'dark' | 'system') and toggles a `.dark` class on
// `<html>`. The landing page needs a simpler resolved 2-state model
// AND CSS variables scoped by `[data-theme]`.
//
// To avoid forking the source of truth, `applyTheme()` writes BOTH:
//   • `data-theme="dark|light"` (read by the new landing tokens)
//   • The legacy `.dark` class on `<html>` (read by every existing
//     dashboard component, tailwind `dark:` variant, etc.)
//
// localStorage key is `autodex-theme` — same key the dashboard
// ThemeProvider reads, so toggling the landing keeps the dashboard
// in sync.
// ─────────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'autodex-theme'

/**
 * Resolve the initial theme: explicit user pick from localStorage, or
 * fall back to the OS `prefers-color-scheme`. Defaults to 'dark' when
 * called server-side or when neither signal is available.
 */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
    // The dashboard provider may have stored 'system' — resolve it.
    if (stored === 'system' || stored == null) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
  } catch {
    /* ignore — SSR / locked-down storage */
  }
  return 'dark'
}

/**
 * Apply a theme to the document.
 * Writes the `data-theme` attribute + the legacy `.dark` class, and
 * persists the choice to localStorage.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}
