'use client'
// ─────────────────────────────────────────────────────────────────────
// Nav — sticky glass header for the public landing.
// ─────────────────────────────────────────────────────────────────────
// Desktop:  brand · centered anchor links · ThemeToggle + LocaleToggle
//           + Connexion (ghost) + Essai gratuit 20j (emerald solid)
// Mobile:   brand · hamburger → full-screen glass drawer with the same
//           links stacked.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'
import ThemeToggle from '@/components/landing/ThemeToggle'
import LocaleToggle from '@/components/landing/LocaleToggle'

export default function Nav() {
  const { t } = useTranslations()
  const [open, setOpen] = useState(false)

  // Body scroll lock while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = open ? 'hidden' : prev || ''
    return () => { document.body.style.overflow = prev || '' }
  }, [open])

  const links: Array<{ href: string; label: string }> = [
    { href: '#features', label: t('nav.links.features') },
    { href: '#tarifs',   label: t('nav.links.pricing') },
    { href: '#faq',      label: t('nav.links.faq') },
  ]

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b"
      style={{
        background: 'color-mix(in srgb, var(--bg-surface) 70%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <nav className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="#top" className="flex items-center gap-2 group" aria-label="AutoDex">
          <span
            className="font-bold text-lg tracking-tight transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('nav.brand')}
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full transition-transform group-hover:scale-150"
            style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}
            aria-hidden="true"
          />
        </Link>

        {/* Desktop links — centred */}
        <ul className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <Link
            href="/login"
            className="ms-2 px-3 h-10 inline-flex items-center text-sm font-medium rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('nav.cta.login')}
          </Link>
          <Link
            href="/register"
            className="px-4 h-10 inline-flex items-center text-sm font-semibold rounded-lg text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            {t('nav.cta.trial')}
          </Link>
        </div>

        {/* Mobile actions */}
        <div className="md:hidden flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            aria-label={t('nav.menu.open')}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden backdrop-blur-2xl flex flex-col"
          style={{
            background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
          }}
        >
          <div className="flex items-center justify-between px-6 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <Link href="#top" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {t('nav.brand')}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--accent)' }}
                aria-hidden="true"
              />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
              aria-label={t('nav.menu.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <ul className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-2xl font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-6 w-full max-w-xs flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="w-full h-12 inline-flex items-center justify-center rounded-xl text-sm font-medium"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {t('nav.cta.login')}
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="w-full h-12 inline-flex items-center justify-center rounded-xl text-sm font-semibold text-white"
                style={{
                  background: 'var(--accent)',
                  boxShadow: '0 6px 22px var(--accent-glow)',
                }}
              >
                {t('nav.cta.trial')}
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
