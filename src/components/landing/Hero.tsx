'use client'
// ─────────────────────────────────────────────────────────────────────
// Hero — title, subtitle, dual CTA, mini-stats, dashboard mockup.
// ─────────────────────────────────────────────────────────────────────
// The mockup is a pure-div composition (no images) styled with CSS
// variables, so dark + light render correctly out of the box. An
// emerald radial glow sits behind the mock to lift it off the bg.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { ArrowRight, Search, Users, Car, BadgeDollarSign, LayoutDashboard } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

export default function Hero() {
  const { t } = useTranslations()

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-24 min-h-[88vh] flex flex-col">
      {/* Ambient emerald glow */}
      <div
        aria-hidden="true"
        className="absolute top-32 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--accent-glow)', opacity: 0.45 }}
      />

      <div className="relative mx-auto max-w-5xl px-6 text-center w-full">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {t('hero.badge')}
        </div>

        {/* Title */}
        <h1
          className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('hero.title.before')}{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #10b981 0%, #34d399 60%, #6ee7b7 100%)',
            }}
          >
            {t('hero.title.emphasis')}
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('hero.subtitle')}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 10px 30px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            {t('hero.cta.primary')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            {t('hero.cta.secondary')}
          </a>
        </div>

        {/* Mini-stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-3xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <span
                className="text-2xl md:text-3xl font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                <bdi>{t(`hero.stat.value.${i}`)}</bdi>
              </span>
              <span
                className="mt-1 text-xs md:text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t(`hero.stat.label.${i}`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard mockup */}
      <div className="relative mx-auto mt-16 md:mt-20 max-w-5xl w-full px-6">
        {/* Glow halo */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-10 h-[300px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'var(--accent-glow)', opacity: 0.35 }}
        />
        <DashboardMock />
      </div>
    </section>
  )
}

function DashboardMock() {
  const { t } = useTranslations()
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-glass)',
      }}
    >
      <div className="flex">
        {/* Sidebar */}
        <aside
          className="hidden sm:flex flex-col w-44 shrink-0 border-e p-3 gap-1"
          style={{
            borderColor: 'var(--border)',
            background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
          }}
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              A
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('hero.mock.sidebar.brand')}
            </span>
          </div>
          {[
            { icon: LayoutDashboard, key: 'hero.mock.sidebar.dashboard', active: true },
            { icon: Users,           key: 'hero.mock.sidebar.leads' },
            { icon: Car,             key: 'hero.mock.sidebar.vehicles' },
            { icon: BadgeDollarSign, key: 'hero.mock.sidebar.sales' },
          ].map((it) => {
            const Icon = it.icon
            return (
              <div
                key={it.key}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium"
                style={
                  it.active
                    ? {
                        background: 'var(--accent)',
                        color: '#fff',
                        boxShadow: '0 4px 14px var(--accent-glow)',
                      }
                    : { color: 'var(--text-secondary)' }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate">{t(it.key)}</span>
              </div>
            )
          })}
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg text-xs"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <Search className="w-3.5 h-3.5" />
              {t('hero.mock.search')}
            </div>
            <span
              className="w-9 h-9 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #10b981, #34d399)',
                boxShadow: '0 0 0 2px var(--bg-elevated)',
              }}
            />
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="relative p-4 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  className="absolute top-0 inset-x-0 h-[2px]"
                  style={{ background: 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)' }}
                  aria-hidden="true"
                />
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-[9px] uppercase tracking-widest font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {t(`hero.mock.kpi.${i}.label`)}
                  </p>
                  <span
                    className="text-[10px] font-bold tabular-nums"
                    style={{ color: 'var(--accent)' }}
                  >
                    <bdi>{t(`hero.mock.kpi.${i}.delta`)} ↑</bdi>
                  </span>
                </div>
                <p
                  className="mt-2 text-2xl font-bold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <bdi>{t(`hero.mock.kpi.${i}.value`)}</bdi>
                </p>
                <svg
                  viewBox="0 0 100 28"
                  className="mt-2 w-full h-6"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`spark-${i}`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    fill={`url(#spark-${i})`}
                    points={`0,28 0,${20 - i * 3} 20,${15 - i * 2} 40,${18 - i} 60,${10 - i * 2} 80,${14 - i * 2} 100,${6 - i} 100,28`}
                  />
                  <polyline
                    points={`0,${20 - i * 3} 20,${15 - i * 2} 40,${18 - i} 60,${10 - i * 2} 80,${14 - i * 2} 100,${6 - i}`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.6"
                  />
                </svg>
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div
            className="mt-4 p-4 rounded-xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            <p
              className="text-[10px] uppercase tracking-widest font-semibold mb-3"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('hero.mock.chart.title')}
            </p>
            <svg viewBox="0 0 400 90" className="w-full h-24" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon
                fill="url(#chart-area)"
                points="0,90 0,60 50,50 100,55 150,40 200,30 250,38 300,22 350,28 400,15 400,90"
              />
              <polyline
                points="0,60 50,50 100,55 150,40 200,30 250,38 300,22 350,28 400,15"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
              <circle cx="400" cy="15" r="3" fill="#10b981" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
