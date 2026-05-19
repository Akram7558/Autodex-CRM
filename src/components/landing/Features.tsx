'use client'
// ─────────────────────────────────────────────────────────────────────
// Features — three alternating sections.
// ─────────────────────────────────────────────────────────────────────
// 1. AI Lead Scoring  (text · visual)
// 2. Unified messaging (visual · text)
// 3. Public catalog    (text · visual)
//
// Each visual is a pure-div mockup using CSS variables, so dark + light
// look polished without forking markup. Alternation is achieved via
// `flex-row` / `flex-row-reverse` on the wrapper; in RTL mode Tailwind
// auto-flips so the order still reads logically.
// ─────────────────────────────────────────────────────────────────────

import { Check } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

type FeatureSpec = {
  id:        'f1' | 'f2' | 'f3'
  bulletCount: 4
  Visual:    React.ComponentType
  flip:      boolean   // visual on the start side?
}

export default function Features() {
  const { t } = useTranslations()

  const features: FeatureSpec[] = [
    { id: 'f1', bulletCount: 4, Visual: ScoringMock,  flip: false },
    { id: 'f2', bulletCount: 4, Visual: MessagingMock, flip: true },
    { id: 'f3', bulletCount: 4, Visual: CatalogMock,   flip: false },
  ]

  return (
    <section id="features" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p
            className="inline-block text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('features.label')}
          </p>
          <h2
            className="mt-3 text-3xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('features.title')}
          </h2>
          <p
            className="mt-4 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('features.subtitle')}
          </p>
        </div>

        <div className="mt-20 flex flex-col gap-24 md:gap-32">
          {features.map(({ id, bulletCount, Visual, flip }) => (
            <div
              key={id}
              className={`grid md:grid-cols-2 gap-10 md:gap-14 items-center ${flip ? 'md:[&>*:first-child]:order-2' : ''}`}
            >
              {/* Text */}
              <div>
                <span
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {t(`features.${id}.badge`)}
                </span>
                <h3
                  className="mt-5 text-2xl md:text-3xl font-bold tracking-tight leading-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t(`features.${id}.title`)}
                </h3>
                <p
                  className="mt-4 text-base leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t(`features.${id}.desc`)}
                </p>
                <ul className="mt-6 flex flex-col gap-3">
                  {Array.from({ length: bulletCount }, (_, i) => (
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
                        {t(`features.${id}.bullet.${i + 1}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual */}
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 blur-3xl"
                  style={{ background: 'var(--accent-glow)', opacity: 0.18 }}
                />
                <div
                  className="relative rounded-3xl p-6 min-h-[400px]"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: 'var(--shadow-glass)',
                  }}
                >
                  <Visual />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Feature 1 — AI Lead Scoring mock ──────────────────────────────

function ScoringMock() {
  const { t } = useTranslations()
  const leads: Array<{ key: string; tone: 'hot' | 'warm' | 'cold'; label: string; score: number }> = [
    { key: 'features.f1.mock.lead.1', tone: 'hot',  label: 'hot',  score: 88 },
    { key: 'features.f1.mock.lead.2', tone: 'warm', label: 'warm', score: 56 },
    { key: 'features.f1.mock.lead.3', tone: 'cold', label: 'cold', score: 22 },
  ]
  const toneStyles = {
    hot:  { bg: 'rgba(244, 63, 94, 0.15)',  ring: 'rgba(244, 63, 94, 0.40)',  fg: '#fb7185' },
    warm: { bg: 'rgba(245, 158, 11, 0.15)', ring: 'rgba(245, 158, 11, 0.40)', fg: '#fbbf24' },
    cold: { bg: 'rgba(59, 130, 246, 0.15)', ring: 'rgba(59, 130, 246, 0.40)', fg: '#60a5fa' },
  } as const

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('features.f1.mock.title')}
        </p>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('features.f1.mock.score')}
        </p>
      </div>

      {leads.map((l) => {
        const s = toneStyles[l.tone]
        return (
          <div
            key={l.key}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <span
              className="w-9 h-9 rounded-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                <bdi>{t(l.key)}</bdi>
              </p>
              <span
                className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: s.bg,
                  border: `1px solid ${s.ring}`,
                  color: s.fg,
                }}
              >
                {t(`features.f1.mock.${l.label}`)}
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              <bdi>{l.score}</bdi>
            </span>
          </div>
        )
      })}

      <div
        className="mt-2 p-3 rounded-xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        <p
          className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('features.f1.mock.dist')}
        </p>
        <div className="mt-2 h-2.5 rounded-full overflow-hidden flex">
          <span style={{ background: '#fb7185', width: '38%' }} />
          <span style={{ background: '#fbbf24', width: '34%' }} />
          <span style={{ background: '#60a5fa', width: '28%' }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>🔥 <bdi>38%</bdi></span>
          <span>🌡️ <bdi>34%</bdi></span>
          <span>❄️ <bdi>28%</bdi></span>
        </div>
      </div>
    </div>
  )
}

// ─── Feature 2 — Messaging mock ────────────────────────────────────

function MessagingMock() {
  const { t } = useTranslations()
  const channels: Array<{ key: string; color: string }> = [
    { key: 'features.f2.mock.channel.wa', color: '#25D366' },
    { key: 'features.f2.mock.channel.fb', color: '#0084FF' },
    { key: 'features.f2.mock.channel.ig', color: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('features.f2.mock.title')}
        </p>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          />
          {t('features.f2.mock.online')}
        </span>
      </div>

      {/* Channel pills */}
      <div className="flex items-center gap-2">
        {channels.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold text-white"
            style={{ background: c.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/70" aria-hidden="true" />
            {t(c.key)}
          </span>
        ))}
      </div>

      {/* Chat bubbles */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-start">
          <div
            className="max-w-[80%] px-3 py-2 rounded-2xl rounded-ss-md text-sm leading-relaxed"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <bdi>{t('features.f2.mock.bubble.1')}</bdi>
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="max-w-[80%] px-3 py-2 rounded-2xl rounded-se-md text-sm leading-relaxed text-white"
            style={{
              background: '#25D366',
            }}
          >
            <bdi>{t('features.f2.mock.bubble.2')}</bdi>
          </div>
        </div>
        <div className="flex justify-start">
          <div
            className="max-w-[80%] px-3 py-2 rounded-2xl rounded-ss-md text-sm leading-relaxed"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <bdi>{t('features.f2.mock.bubble.3')}</bdi>
          </div>
        </div>
      </div>

      {/* Composer placeholder */}
      <div
        className="mt-2 h-10 rounded-xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      />
    </div>
  )
}

// ─── Feature 3 — Public catalog mock ──────────────────────────────

function CatalogMock() {
  const { t } = useTranslations()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            A
          </span>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('features.f3.mock.title')}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 4px 14px var(--accent-glow)',
          }}
        >
          {t('features.f3.mock.share')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="aspect-[4/3]"
              style={{
                background:
                  i === 1
                    ? 'linear-gradient(135deg, #1f2937, #475569)'
                    : i === 2
                      ? 'linear-gradient(135deg, #1e293b, #64748b)'
                      : 'linear-gradient(135deg, #0f172a, #334155)',
              }}
            />
            <div className="p-2.5">
              <p
                className="text-xs font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                <bdi>{t(`features.f3.mock.car.${i}`)}</bdi>
              </p>
              <p
                className="mt-0.5 text-xs font-bold tabular-nums"
                style={{ color: 'var(--accent)' }}
              >
                <bdi>{t(`features.f3.mock.price.${i}`)}</bdi>
              </p>
              <span
                className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {t('features.f3.mock.status')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
