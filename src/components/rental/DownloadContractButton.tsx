'use client'
// ─────────────────────────────────────────────────────────────────────
// DownloadContractButton — fetches GET /api/rental/rentals/[id]/contract
// as a blob and triggers a client-side download. We fetch (rather than use
// a bare <a href>) so an auth/permission error surfaces as a friendly
// message instead of dumping a JSON error page into a new tab.
//
// Visible for ALL rental statuses and every role allowed to view the
// contract — the server route is the source of truth on access.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'

export default function DownloadContractButton({
  rentalId, contractNumber, variant = 'solid', className = '',
}: {
  rentalId:        string
  contractNumber:  string | null
  variant?:        'solid' | 'subtle'
  className?:       string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/rental/rentals/${rentalId}/contract`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? 'Téléchargement impossible.')
        return
      }
      const blob = await res.blob()
      const safe = (contractNumber ?? rentalId).replace(/[^a-zA-Z0-9_-]/g, '_')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contrat-${safe}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Erreur réseau.')
    } finally {
      setBusy(false)
    }
  }

  const style = variant === 'subtle'
    ? { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
    : { background: 'var(--accent-subtle)', color: 'var(--accent)' }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={style}
        title="Télécharger le contrat au format PDF"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        Télécharger le contrat PDF
      </button>
      {error && <span className="text-xs" style={{ color: '#fb7185' }}>{error}</span>}
    </div>
  )
}
