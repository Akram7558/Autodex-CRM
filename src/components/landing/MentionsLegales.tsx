'use client'
// ─────────────────────────────────────────────────────────────────────
// MentionsLegales — body of /mentions-legales (FR + AR, landing tokens).
// ─────────────────────────────────────────────────────────────────────
// Legal-entity facts are hard-coded (they are not translatable): company
// name, postal address and contact email must read identically in every
// locale. Only labels and prose go through the translations dictionary.
// No personal name, tax ID or phone number is published on purpose.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { LocaleProvider } from '@/components/landing/LocaleProvider'
import { useTranslations } from '@/hooks/useTranslations'
import ThemeToggle from '@/components/landing/ThemeToggle'
import LocaleToggle from '@/components/landing/LocaleToggle'
import Footer from '@/components/landing/Footer'

const ENTITY = {
  name:    'SHYFTCOM LLC',
  address: '102 Gold Ave SW, Albuquerque, NM 87102, United States',
  email:   'contact@autodex.store',
  brand:   'AutoDex (autodex.store)',
}

export default function MentionsLegales() {
  return (
    <LocaleProvider>
      <Body />
    </LocaleProvider>
  )
}

function Body() {
  const { t } = useTranslations()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--accent)' }}
          >
            {t('legal.back')}
          </Link>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">{t('legal.title')}</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('legal.intro')}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <Section title={t('legal.publisher.title')}>
            <p>{t('legal.publisher.body')}</p>
            <dl
              className="mt-4 rounded-2xl p-5 grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <Row label={t('legal.label.company')}><bdi>{ENTITY.name}</bdi></Row>
              <Row label={t('legal.label.form')}>{t('legal.value.form')}</Row>
              <Row label={t('legal.label.address')}><bdi>{ENTITY.address}</bdi></Row>
              <Row label={t('legal.label.email')}>
                <a href={`mailto:${ENTITY.email}`} style={{ color: 'var(--accent)' }}>
                  <bdi>{ENTITY.email}</bdi>
                </a>
              </Row>
              <Row label={t('legal.label.brand')}><bdi>{ENTITY.brand}</bdi></Row>
            </dl>
          </Section>

          <Section title={t('legal.hosting.title')}>
            <p>{t('legal.hosting.body')}</p>
          </Section>

          <Section title={t('legal.ip.title')}>
            <p>{t('legal.ip.body')}</p>
          </Section>

          <Section title={t('legal.data.title')}>
            <p>
              {t('legal.data.body')}{' '}
              <Link href="/privacy" style={{ color: 'var(--accent)' }}>
                {t('footer.link.privacy')}
              </Link>
              {' · '}
              <Link href="/terms" style={{ color: 'var(--accent)' }}>
                {t('footer.link.terms')}
              </Link>
            </p>
          </Section>

          <Section title={t('legal.contact.title')}>
            <p>
              {t('legal.contact.body')}{' '}
              <a href={`mailto:${ENTITY.email}`} style={{ color: 'var(--accent)' }}>
                <bdi>{ENTITY.email}</bdi>
              </a>
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd style={{ color: 'var(--text-primary)' }}>{children}</dd>
    </>
  )
}
