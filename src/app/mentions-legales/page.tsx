// ─────────────────────────────────────────────────────────────────────
// /mentions-legales — PUBLIC legal notice (publisher, address, hosting).
// ─────────────────────────────────────────────────────────────────────
// Discloses SHYFTCOM LLC as the operator of autodex.store (required for
// Meta Business Verification). Outside /dashboard, so the auth middleware
// (matcher: /dashboard/:path*) never touches it. Server shell for the
// metadata; the FR/AR body is a client component (locale context).
// ─────────────────────────────────────────────────────────────────────

import MentionsLegales from '@/components/landing/MentionsLegales'

export const metadata = {
  title: 'Mentions légales · AutoDex',
  description:
    'Mentions légales du site autodex.store — éditeur SHYFTCOM LLC (Nouveau-Mexique, USA), hébergement et contact.',
}

export default function MentionsLegalesPage() {
  return <MentionsLegales />
}
