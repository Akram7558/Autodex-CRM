'use client'
// ─────────────────────────────────────────────────────────────────────
// DemoCTA — final conversion section before the footer.
// ─────────────────────────────────────────────────────────────────────
// Oversized glass card with copy on one side and an onboarding-screen
// mockup on the other (pure div composition, no real form).
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

export default function DemoCTA() {
  const { t } = useTranslations()
  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="relative overflow-hidden rounded-3xl p-8 md:p-16"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-glass)',
          }}
        >
          {/* Background glow */}
          <div
            aria-hidden="true"
            className="absolute -top-24 -end-24 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none"
            style={{ background: 'var(--accent-glow)', opacity: 0.4 }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -start-24 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none"
            style={{ background: 'var(--accent-glow)', opacity: 0.25 }}
          />

          <div className="relative grid md:grid-cols-2 gap-10 md:gap-14 items-center">
            {/* Left — copy */}
            <div>
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {t('demo.badge')}
              </span>

              <h2
                className="mt-4 text-3xl md:text-4xl font-bold tracking-tight leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('demo.title')}
              </h2>
              <p
                className="mt-4 text-base md:text-lg max-w-md leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('demo.desc')}
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                      }}
                    >
                      <Check className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {t(`demo.bullet${i}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 h-12 px-6 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: 'var(--accent)',
                  boxShadow: '0 14px 38px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                {t('demo.cta')}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>

            {/* Right — onboarding mock */}
            <OnboardingMock />
          </div>
        </div>
      </div>
    </section>
  )
}

function OnboardingMock() {
  const { t } = useTranslations()
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-glass)',
      }}
    >
      {/* Progress */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
          <bdi>{t('demo.mock.step')}</bdi>
        </p>
        <bdi className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--accent)' }}>67%</bdi>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-surface)' }}
      >
        <span
          className="block h-full"
          style={{
            width: '67%',
            background: 'linear-gradient(90deg, #10b981, #34d399)',
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
        />
      </div>

      {/* Title */}
      <h3
        className="mt-6 text-lg font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        {t('demo.mock.title')}
      </h3>

      {/* Fake input rows */}
      <div className="mt-5 flex flex-col gap-3">
        <MockField label={t('demo.mock.field.name')} value="Auto Plus Alger" />
        <MockField label={t('demo.mock.field.wilaya')} value="Alger" select />
        <MockField label={t('demo.mock.field.phone')} value="+213 5 55 12 34 56" mono />
      </div>

      <button
        type="button"
        disabled
        className="mt-6 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white cursor-default"
        style={{
          background: 'var(--accent)',
          boxShadow: '0 8px 22px -8px var(--accent-glow)',
        }}
      >
        {t('demo.mock.cta')}
        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
      </button>
    </div>
  )
}

function MockField({
  label, value, select, mono,
}: {
  label: string
  value: string
  select?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-widest font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <div
        className="mt-1 h-10 px-3 flex items-center justify-between rounded-lg text-sm"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <bdi className={mono ? 'font-mono text-xs' : ''}>{value}</bdi>
        {select && (
          <ChevronDown
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}
