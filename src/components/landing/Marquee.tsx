'use client'
// ─────────────────────────────────────────────────────────────────────
// Marquee — infinite horizontal scroll of product highlights.
// ─────────────────────────────────────────────────────────────────────
// The track is duplicated and translated from 0 to -50% so the seam
// is invisible. Pauses on hover, freezes entirely under
// prefers-reduced-motion (CSS handles that — the class is just gone
// from the track DOM).
// ─────────────────────────────────────────────────────────────────────

import { useTranslations } from '@/hooks/useTranslations'

export default function Marquee() {
  const { t } = useTranslations()

  const items = Array.from({ length: 10 }, (_, i) => t(`marquee.item.${i + 1}`))

  return (
    <section
      className="relative overflow-hidden border-y py-6"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Fade masks on both edges so items don't pop in/out. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-0 w-24 z-10"
        style={{
          background: 'linear-gradient(to right, var(--bg-surface), transparent)',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-24 z-10"
        style={{
          background: 'linear-gradient(to left, var(--bg-surface), transparent)',
        }}
      />

      <div className="marquee-track flex gap-10 w-max" aria-hidden="false">
        {[...items, ...items].map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="flex items-center gap-10 shrink-0 text-sm font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{label}</span>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 8px var(--accent-glow)',
              }}
              aria-hidden="true"
            />
          </span>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .marquee-track {
          animation: marquee-scroll 40s linear infinite;
        }
        :global([dir="rtl"]) .marquee-track {
          animation-direction: reverse;
        }
        .marquee-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none;
            justify-content: center;
            width: 100%;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </section>
  )
}
