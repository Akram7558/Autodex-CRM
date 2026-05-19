'use client'
// ─────────────────────────────────────────────────────────────────────
// UpgradeModal — surfaced when a Classique showroom hits the
// 5-vehicle rental cap. Sells the La Totale plan and routes to the
// public pricing section.
// ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles, X } from 'lucide-react'

const BENEFITS: string[] = [
  'Véhicules louables illimités',
  'AI Chatbot WhatsApp (darija + français) 24/7',
  'WhatsApp Drip Campaigns + re-engagement auto',
  'AI Car Matching + Predictive Close Rate',
  'Support prioritaire H24',
]

export default function UpgradeModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        {/* Emerald gradient hero */}
        <div
          aria-hidden="true"
          className="absolute -top-32 -end-32 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'var(--accent-glow)', opacity: 0.55 }}
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 end-3 w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] z-10"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-6 pt-8 pb-6 sm:px-8 sm:pt-10 sm:pb-8">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.18em] uppercase"
            style={{
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <Sparkles className="w-3 h-3" />
            La Totale
          </span>

          <h3
            className="mt-4 text-2xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Limite Classique atteinte
          </h3>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Votre plan Classique permet jusqu&apos;à <bdi className="font-semibold">5 véhicules</bdi>{' '}
            de location. Passez à <span className="font-semibold" style={{ color: 'var(--accent)' }}>La Totale</span>{' '}
            pour débloquer la flotte illimitée et toutes les fonctionnalités premium.
          </p>

          <ul className="mt-5 flex flex-col gap-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                  }}
                >
                  <Check className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                </span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/#tarifs"
              onClick={onClose}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 12px 32px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              Voir les plans
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center h-11 px-4 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
