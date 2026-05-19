'use client'
// ─────────────────────────────────────────────────────────────────────
// Footer — 4 columns (Brand · Produit · Support · Légal) + bottom bar.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { useTranslations } from '@/hooks/useTranslations'

// Minimal inline brand glyphs — lucide-react no longer ships
// Facebook/Instagram, so we render two trim SVGs here rather than
// pulling in a new icon-pack dependency.
function FacebookGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 21v-7.5h2.6l.4-3.1h-3V8.4c0-.9.3-1.6 1.6-1.6h1.5V4.1A22.6 22.6 0 0 0 14.4 4c-2.2 0-3.7 1.3-3.7 3.8v2.6h-2.6v3.1h2.6V21h2.8z" />
    </svg>
  )
}
function InstagramGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

const WHATSAPP = process.env.NEXT_PUBLIC_AUTODEX_WHATSAPP ?? '213000000000'

export default function Footer() {
  const { t } = useTranslations()

  const sections: Array<{
    titleKey: string
    items: Array<{ href: string; labelKey: string; external?: boolean }>
  }> = [
    {
      titleKey: 'footer.product',
      items: [
        { href: '#features', labelKey: 'footer.link.features' },
        { href: '#tarifs',   labelKey: 'footer.link.pricing' },
        { href: '#faq',      labelKey: 'footer.link.faq' },
        { href: '/s/exemple', labelKey: 'footer.link.catalog' },
      ],
    },
    {
      titleKey: 'footer.support',
      items: [
        { href: `https://wa.me/${WHATSAPP}`, labelKey: 'footer.link.whatsapp', external: true },
        { href: 'mailto:support@autodex.store', labelKey: 'footer.link.email' },
        { href: '#',                            labelKey: 'footer.link.help' },
        { href: '#',                            labelKey: 'footer.link.status' },
      ],
    },
    {
      titleKey: 'footer.legal',
      items: [
        { href: '/privacy', labelKey: 'footer.link.privacy' },
        { href: '/terms',   labelKey: 'footer.link.terms' },
        { href: '#',        labelKey: 'footer.link.cookies' },
      ],
    },
  ]

  return (
    <footer
      id="footer"
      className="py-16 border-t"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="#top" className="inline-flex items-center gap-2 group">
              <span
                className="font-bold text-lg tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                AutoDex
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full transition-transform group-hover:scale-150"
                style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}
                aria-hidden="true"
              />
            </Link>
            <p
              className="mt-4 text-sm leading-relaxed max-w-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('footer.tagline')}
            </p>
            <p
              className="mt-6 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <bdi>© 2026 AutoDex</bdi>
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('footer.made_in')}
            </p>
          </div>

          {/* Link columns */}
          {sections.map((s) => (
            <div key={s.titleKey}>
              <p
                className="text-[11px] uppercase tracking-[0.18em] font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t(s.titleKey)}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {s.items.map((it) => (
                  <li key={it.labelKey}>
                    <FooterLink href={it.href} external={it.external}>
                      {t(it.labelKey)}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-12 pt-8 border-t flex flex-wrap items-center justify-between gap-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <bdi>{t('footer.copyright')}</bdi>
          </p>
          <div className="flex items-center gap-2">
            <SocialIcon href="#" label="Facebook">
              <FacebookGlyph className="w-4 h-4" />
            </SocialIcon>
            <SocialIcon href="#" label="Instagram">
              <InstagramGlyph className="w-4 h-4" />
            </SocialIcon>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterLink({
  href, external, children,
}: {
  href: string
  external?: boolean
  children: React.ReactNode
}) {
  const cls = 'text-sm transition-colors'
  const style: React.CSSProperties = { color: 'var(--text-secondary)' }
  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = 'var(--accent)'
  }
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = 'var(--text-secondary)'
  }
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        style={style}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {children}
      </a>
    )
  }
  return (
    <Link
      href={href}
      className={cls}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </Link>
  )
}

function SocialIcon({
  href, label, children,
}: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </a>
  )
}
