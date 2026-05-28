'use client'
// ─────────────────────────────────────────────────────────────────────
// ReceiptLink — "📎 Reçu" pill that resolves a private rental-documents
// storage path to a 1h signed URL (GET /api/rental/uploads/read) and opens
// it in a new tab. Shared by ContractDetail's payments list + the contracts
// list expand panel. Silent on failure (a flaky signed URL shouldn't break
// the page); briefly disables while resolving.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'

export default function ReceiptLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)

  async function open() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/rental/uploads/read?path=${encodeURIComponent(path)}`)
      const j = await res.json().catch(() => ({}))
      if (res.ok && j?.url) window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch { /* ignore */ } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      title="Ouvrir le reçu"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
    >📎 Reçu</button>
  )
}
