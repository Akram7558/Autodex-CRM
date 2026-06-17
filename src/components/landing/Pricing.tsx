'use client'
// ─────────────────────────────────────────────────────────────────────
// Pricing — Classique / La Totale toggle + plans from /api/plans.
// ─────────────────────────────────────────────────────────────────────
// Plans fetched lazily on type switch. Shows a shimmer skeleton while
// loading and a friendly error/retry state on failure. Middle (6-mo)
// plan carries the "LE PLUS POPULAIRE" ribbon + emerald glow halo.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

type PlanType = 'classique' | 'totale' | 'location'
type Plan = {
  id:              string
  name:            string
  duration_months: number
  price:           number
  plan_type:       PlanType
}

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

export default function Pricing() {
  const { t } = useTranslations()
  const [type, setType] = useState<PlanType>('classique')
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (next: PlanType) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/plans?type=${next}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'http')
      setPlans((json.plans ?? []) as Plan[])
    } catch {
      setError('error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(type) }, [type, load])

  return (
    <section id="tarifs" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="text-center">
          <p
            className="inline-block text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('pricing.label')}
          </p>
          <h2
            className="mt-3 text-3xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('pricing.title')}
          </h2>
          <p
            className="mt-4 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Plan-type toggle */}
        <div
          className="mt-10 mx-auto inline-flex p-1 rounded-full"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-glass)',
          }}
        >
          <TypePill active={type === 'classique'} onClick={() => setType('classique')}>
            {t('pricing.type.classique')}
          </TypePill>
          <TypePill active={type === 'location'} onClick={() => setType('location')}>
            {t('pricing.type.location')}
          </TypePill>
          <TypePill active={type === 'totale'} onClick={() => setType('totale')}>
            <span className="inline-flex items-center gap-2">
              {t('pricing.type.totale')}
              <span
                className="text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 38%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {t('pricing.type.premium')}
              </span>
            </span>
          </TypePill>
        </div>

        {/* Plans grid (crossfade on type switch) */}
        <div
          key={type}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 animate-pricing-fade-in motion-reduce:animate-none"
        >
          {loading
            ? Array.from({ length: 3 }, (_, i) => <PlanSkeleton key={i} />)
            : error
              ? (
                <div className="md:col-span-3">
                  <ErrorState onRetry={() => load(type)} />
                </div>
              )
              : plans.map((p) => (
                  <PlanCard key={p.id} plan={p} popular={p.duration_months === 6} />
                ))
          }
        </div>

        <p
          className="mt-16 text-center text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('pricing.note')}
        </p>
      </div>

      <style jsx>{`
        @keyframes pricing-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        :global(.animate-pricing-fade-in) {
          animation: pricing-fade-in 220ms ease-out both;
        }
      `}</style>
    </section>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

function TypePill({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-5 h-10 rounded-full text-sm font-semibold transition-all duration-200"
      style={
        active
          ? {
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '0 4px 18px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }
          : { background: 'transparent', color: 'var(--text-secondary)' }
      }
    >
      {children}
    </button>
  )
}

function PlanCard({ plan, popular }: { plan: Plan; popular: boolean }) {
  const { t } = useTranslations()
  const isTotale   = plan.plan_type === 'totale'
  const isLocation = plan.plan_type === 'location'
  const packLabel = t(`pricing.pack.${plan.duration_months}`)
  const saveLabel =
    plan.duration_months === 6  ? t('pricing.save_10')
    : plan.duration_months === 12 ? t('pricing.save_25')
    : null
  const classiqueFeatures = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`pricing.feat.c.${i}`)),
    [t],
  )
  const locationFeatures = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`pricing.feat.l.${i}`)),
    [t],
  )
  const totaleExtras = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`pricing.feat.t.${i}`)),
    [t],
  )
  // Location-only plans show their own feature list; classique + totale
  // keep the classique base (totale appends its premium extras below).
  const baseFeatures = isLocation ? locationFeatures : classiqueFeatures

  return (
    <div className="relative">
      {/* Glow halo behind popular card */}
      {popular && (
        <div
          aria-hidden="true"
          className="absolute -inset-4 blur-3xl pointer-events-none"
          style={{ background: 'var(--accent-glow)', opacity: 0.35 }}
        />
      )}

      <div
        className="relative h-full rounded-3xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1"
        style={{
          background: 'var(--bg-surface)',
          border: popular
            ? '1px solid color-mix(in srgb, var(--accent) 50%, var(--border))'
            : '1px solid var(--border)',
          boxShadow: popular
            ? '0 20px 60px -20px var(--accent-glow), var(--shadow-glass)'
            : 'var(--shadow-glass)',
        }}
      >
        {/* Top accent rim (totale only) */}
        {isTotale && (
          <span
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-[3px] rounded-t-3xl"
            style={{ background: 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)' }}
          />
        )}

        {/* Most-popular ribbon */}
        {popular && (
          <div
            className="absolute -top-3 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.18em] uppercase whitespace-nowrap"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '0 6px 22px var(--accent-glow)',
            }}
          >
            {t('pricing.most_popular')}
          </div>
        )}

        {/* Plan name */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {packLabel}
          </h3>
          {isTotale && (
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              · {t('pricing.totale_suffix')}
            </span>
          )}
          {isLocation && (
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              · {t('pricing.location_suffix')}
            </span>
          )}
        </div>

        {/* Save badge */}
        {saveLabel && (
          <span
            className="mt-2 inline-block self-start px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase"
            style={{
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            {saveLabel}
          </span>
        )}

        {/* Price */}
        <div className="mt-6 flex items-baseline gap-2">
          <bdi
            className="text-5xl font-bold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatDzd(plan.price)}
          </bdi>
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            DZD
          </span>
        </div>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('pricing.for_months', { months: plan.duration_months })}
        </p>

        {/* Features */}
        <ul className="mt-8 flex-1 flex flex-col gap-3">
          {baseFeatures.map((label, i) => (
            <li key={`c-${i}`} className="flex items-start gap-3">
              <FeatureCheck size={isTotale ? 'sm' : 'md'} />
              <span
                className={isTotale ? 'text-xs' : 'text-sm'}
                style={{ color: isTotale ? 'var(--text-secondary)' : 'var(--text-primary)' }}
              >
                {label}
              </span>
            </li>
          ))}

          {isTotale && (
            <>
              <li className="mt-3 mb-1 flex items-center gap-3">
                <span
                  className="h-px flex-1"
                  style={{ background: 'var(--border)' }}
                />
                <span
                  className="text-[10px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: 'var(--accent)' }}
                >
                  {t('pricing.feat.t.divider')}
                </span>
                <span
                  className="h-px flex-1"
                  style={{ background: 'var(--border)' }}
                />
              </li>
              {totaleExtras.map((label, i) => (
                <li key={`t-${i}`} className="flex items-start gap-3">
                  <FeatureCheck size="md" premium />
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span aria-hidden="true" className="me-1">⭐</span>
                    {label}
                  </span>
                </li>
              ))}
            </>
          )}
        </ul>

        {/* CTA */}
        <Link
          href={`/register?plan=${encodeURIComponent(plan.id)}`}
          onClick={() => {
            // InitiateCheckout — fires before client-side nav. price is always
            // a number here. Guarded → safe no-op when pixels aren't loaded.
            try {
              if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
                window.fbq('track', 'InitiateCheckout', {
                  content_name:     plan.name,
                  content_category: plan.plan_type,
                  content_ids:      [plan.id],
                  content_type:     'product',
                  value:            plan.price,
                  currency:         'DZD',
                })
              }
            } catch {}
            try {
              if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
                window.ttq.track('InitiateCheckout', {
                  value:    plan.price,
                  currency: 'DZD',
                  contents: [{ content_id: plan.id, content_type: 'product', content_name: plan.name }],
                })
              }
            } catch {}
          }}
          className="mt-8 inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
          style={{
            background: 'var(--accent)',
            boxShadow: isTotale
              ? '0 14px 38px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)'
              : '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {isTotale
            ? t('pricing.cta_totale')
            : isLocation
              ? t('pricing.cta_location')
              : t('pricing.cta_classique')}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}

function FeatureCheck({
  size = 'md',
  premium = false,
}: { size?: 'sm' | 'md'; premium?: boolean }) {
  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const icon = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  return (
    <span
      className={`mt-0.5 flex items-center justify-center rounded-full shrink-0 ${dim}`}
      style={{
        background: premium
          ? 'color-mix(in srgb, var(--accent) 28%, transparent)'
          : 'color-mix(in srgb, var(--accent) 14%, transparent)',
        border: `1px solid color-mix(in srgb, var(--accent) ${premium ? 55 : 32}%, transparent)`,
      }}
    >
      <Check className={icon} style={{ color: 'var(--accent)' }} />
    </span>
  )
}

function PlanSkeleton() {
  return (
    <div
      className="rounded-3xl p-8 h-[560px] animate-pulse"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-glass)',
      }}
    >
      <div className="h-5 w-28 rounded-md" style={{ background: 'var(--bg-elevated)' }} />
      <div className="mt-6 h-12 w-40 rounded-md" style={{ background: 'var(--bg-elevated)' }} />
      <div className="mt-3 h-3 w-32 rounded-md" style={{ background: 'var(--bg-elevated)' }} />
      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-3 rounded-md" style={{ background: 'var(--bg-elevated)' }} />
        ))}
      </div>
      <div className="mt-8 h-12 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslations()
  return (
    <div
      className="rounded-3xl p-10 text-center"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p className="text-base" style={{ color: 'var(--text-primary)' }}>
        {t('pricing.error')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white"
        style={{
          background: 'var(--accent)',
          boxShadow: '0 6px 22px var(--accent-glow)',
        }}
      >
        {t('pricing.retry')}
      </button>
    </div>
  )
}
