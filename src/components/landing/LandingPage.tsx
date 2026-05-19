'use client'
// ─────────────────────────────────────────────────────────────────────
// LandingPage — scaffold for the FoCar-inspired landing redesign.
// ─────────────────────────────────────────────────────────────────────
// Chunk 1: infrastructure only — sections are placeholders. Chunks 2
// and 3 will fill <Nav />, <Hero />, <Marquee />, <Problem />,
// <Features />, <Pricing />, <FAQ />, <DemoCTA />, <Footer />.
//
// Reads CSS variables exposed by `:root[data-theme="…"]` in
// globals.css so dark/light + FR/AR toggles work end-to-end before
// any section markup ships.
// ─────────────────────────────────────────────────────────────────────

import ThemeToggle from '@/components/landing/ThemeToggle'
import LocaleToggle from '@/components/landing/LocaleToggle'

export default function LandingPage() {
  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* TODO chunk 2: <Nav /> */}
      <Placeholder id="hero" label="Hero" />
      {/* TODO chunk 2: <Hero /> */}
      <Placeholder id="marquee" label="Marquee" />
      {/* TODO chunk 2: <Marquee /> */}
      <Placeholder id="problem" label="Problem" />
      {/* TODO chunk 2: <Problem /> */}
      <Placeholder id="features" label="Features" />
      {/* TODO chunk 2: <Features /> */}
      <Placeholder id="tarifs" label="Pricing" />
      {/* TODO chunk 3: <Pricing /> */}
      <Placeholder id="faq" label="FAQ" />
      {/* TODO chunk 3: <FAQ /> */}
      <Placeholder id="demo" label="DemoCTA" />
      {/* TODO chunk 3: <DemoCTA /> */}
      <Placeholder id="footer" label="Footer" />
      {/* TODO chunk 3: <Footer /> */}

      {/* Floating controls so chunks 2 + 3 can verify both toggles
          before the real Nav lands. */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  )
}

function Placeholder({ id, label }: { id: string; label: string }) {
  return (
    <section
      id={id}
      className="border-y px-6 py-20 text-center"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-surface)',
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.3em] font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Placeholder — section lands in chunk {id === 'tarifs' || id === 'faq' || id === 'demo' || id === 'footer' ? 3 : 2}.
      </p>
    </section>
  )
}
