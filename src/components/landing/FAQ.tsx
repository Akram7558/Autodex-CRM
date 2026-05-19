'use client'
// ─────────────────────────────────────────────────────────────────────
// FAQ — 6 controlled accordions, one-open-at-a-time.
// ─────────────────────────────────────────────────────────────────────
// Smooth height transition without measuring the DOM: we use the
// grid-template-rows trick — animate `grid-rows-[0fr] → grid-rows-[1fr]`
// on the row wrapper while the inner content uses `overflow-hidden` so
// it clips during the transition.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, MessageCircle } from 'lucide-react'
import { useTranslations } from '@/hooks/useTranslations'

const WHATSAPP = process.env.NEXT_PUBLIC_AUTODEX_WHATSAPP ?? '213000000000'

export default function FAQ() {
  const { t } = useTranslations()
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const items = [1, 2, 3, 4, 5, 6].map((i) => ({
    q: t(`faq.q${i}`),
    a: t(`faq.a${i}`),
  }))

  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p
            className="inline-block text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('faq.label')}
          </p>
          <h2
            className="mt-3 text-3xl md:text-5xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('faq.title')}
          </h2>
        </div>

        <ul className="mt-12 flex flex-col gap-3">
          {items.map((item, i) => {
            const open = openIndex === i
            const panelId = `faq-panel-${i}`
            const btnId   = `faq-trigger-${i}`
            return (
              <li
                key={i}
                className="rounded-2xl overflow-hidden transition-colors duration-200"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <button
                  id={btnId}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="w-full p-6 flex items-center justify-between gap-4 text-start font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="text-base md:text-lg">{item.q}</span>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 transition-transform duration-300 motion-reduce:transition-none"
                    style={{
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      color: 'var(--text-secondary)',
                    }}
                    aria-hidden="true"
                  />
                </button>

                {/* grid-rows transition — no JS height measurement. */}
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
                  style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p
                      className="px-6 pb-6 text-sm md:text-base leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p
            className="text-base"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('faq.more.question')}
          </p>
          <Link
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 8px 22px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <MessageCircle className="w-4 h-4" />
            {t('faq.more.cta')}
          </Link>
        </div>
      </div>
    </section>
  )
}
