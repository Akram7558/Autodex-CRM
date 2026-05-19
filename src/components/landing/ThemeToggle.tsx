'use client'
// ─────────────────────────────────────────────────────────────────────
// Landing ThemeToggle — pill button with animated Sun/Moon swap.
// ─────────────────────────────────────────────────────────────────────
// Reads + writes the same `autodex-theme` localStorage key as the
// dashboard ThemeProvider, so toggling here is reflected everywhere.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getInitialTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)
    setMounted(true)
  }, [])

  function onToggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  // Render a stable placeholder until hydration so the icon doesn't
  // flip between server (no localStorage) and client.
  const showSun = mounted && theme === 'dark'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-md transition-all duration-300 hover:ring-2 hover:ring-emerald-500/40 hover:shadow-[0_0_20px_var(--accent-glow)]"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      <span className="relative w-5 h-5">
        <Sun
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
            showSun ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
          }`}
        />
        <Moon
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
            !showSun && mounted ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75'
          }`}
        />
      </span>
    </button>
  )
}

export default ThemeToggle
