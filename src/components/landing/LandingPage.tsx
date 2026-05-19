'use client'
// ─────────────────────────────────────────────────────────────────────
// LandingPage — composition root for the public landing.
// ─────────────────────────────────────────────────────────────────────
// Chunk 2 wires Nav + Hero + Marquee + Problem + Features.
// Chunks 3 owns <Pricing /> · <FAQ /> · <DemoCTA /> · <Footer />.
// ─────────────────────────────────────────────────────────────────────

import Nav from '@/components/landing/Nav'
import Hero from '@/components/landing/Hero'
import Marquee from '@/components/landing/Marquee'
import Problem from '@/components/landing/Problem'
import Features from '@/components/landing/Features'

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Problem />
        <Features />
        {/* TODO chunk 3: <Pricing /> at #tarifs */}
        <Placeholder id="tarifs" label="Pricing — chunk 3" />
        {/* TODO chunk 3: <FAQ /> at #faq */}
        <Placeholder id="faq" label="FAQ — chunk 3" />
        {/* TODO chunk 3: <DemoCTA /> */}
        <Placeholder id="demo" label="Demo CTA — chunk 3" />
        {/* TODO chunk 3: <Footer /> */}
        <Placeholder id="footer" label="Footer — chunk 3" />
      </main>
    </div>
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
    </section>
  )
}
