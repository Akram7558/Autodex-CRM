'use client'
// ─────────────────────────────────────────────────────────────────────
// LandingPage — composition root for the public landing.
// ─────────────────────────────────────────────────────────────────────
// Final order (post chunk 3):
//   Nav → Hero → Marquee → Problem → Features → Pricing → FAQ →
//   DemoCTA → Footer.
//
// The entire tree is wrapped in <LocaleProvider> so every section
// reactively re-renders on locale flips (chunk 3 fix).
// ─────────────────────────────────────────────────────────────────────

import { LocaleProvider } from '@/components/landing/LocaleProvider'
import Nav      from '@/components/landing/Nav'
import Hero     from '@/components/landing/Hero'
import Marquee  from '@/components/landing/Marquee'
import Problem  from '@/components/landing/Problem'
import Features from '@/components/landing/Features'
import Pricing  from '@/components/landing/Pricing'
import FAQ      from '@/components/landing/FAQ'
import DemoCTA  from '@/components/landing/DemoCTA'
import Footer   from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <LocaleProvider>
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
          <Pricing />
          <FAQ />
          <DemoCTA />
        </main>
        <Footer />
      </div>
    </LocaleProvider>
  )
}
