// ─────────────────────────────────────────────────────────────────────
// Public landing page at `/`
// ─────────────────────────────────────────────────────────────────────
// Server component for SEO metadata; the actual page is a client
// component (Landing) that drives the form, animations, and pixels.
// Authenticated visitors get redirected client-side from inside Landing
// — middleware doesn't gate this route, since it must remain public.
// ─────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next'
import Landing from '@/components/landing/Landing'

export const metadata: Metadata = {
  title: 'AutoDex — Le CRM des concessionnaires algériens',
  description:
    'Gérez vos prospects, RDV et inventaire depuis une seule plateforme. Essai gratuit 20 jours.',
  openGraph: {
    title: 'AutoDex — CRM pour concessionnaires algériens',
    description:
      'Gérez vos prospects, RDV et inventaire depuis une seule plateforme.',
    url: 'https://www.autodex.store',
    siteName: 'AutoDex',
    locale: 'fr_DZ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoDex',
    description: 'Le CRM des concessionnaires algériens',
  },
}

export default function HomePage() {
  return <Landing />
}
