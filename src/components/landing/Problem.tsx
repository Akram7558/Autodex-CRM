'use client'
// ─────────────────────────────────────────────────────────────────────
// Problem — 4 pain-point cards with lucide icons + emerald headline.
// ─────────────────────────────────────────────────────────────────────

import { MessageSquareX, Users, Clock, TrendingDown, type LucideIcon } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

const CARDS: Array<{ icon: LucideIcon; titleKey: string; descKey: string }> = [
  { icon: MessageSquareX, titleKey: 'problem.card.1.title', descKey: 'problem.card.1.desc' },
  { icon: Users,          titleKey: 'problem.card.2.title', descKey: 'problem.card.2.desc' },
  { icon: Clock,          titleKey: 'problem.card.3.title', descKey: 'problem.card.3.desc' },
  { icon: TrendingDown,   titleKey: 'problem.card.4.title', descKey: 'problem.card.4.desc' },
]

export default function Problem() {
  const { t } = useTranslations()
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p
            className="inline-block text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('problem.label')}
          </p>
          <h2
            className="mt-3 text-3xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('problem.title.before')}{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #10b981 0%, #34d399 60%, #6ee7b7 100%)',
              }}
            >
              {t('problem.title.emphasis')}
            </span>{' '}
            {t('problem.title.after')}
          </h2>
          <p
            className="mt-4 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('problem.subtitle')}
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CARDS.map((c) => {
            const Icon = c.icon
            return (
              <div
                key={c.titleKey}
                className="p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-glass)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                </div>
                <h3
                  className="mt-4 text-lg font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t(c.titleKey)}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t(c.descKey)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
