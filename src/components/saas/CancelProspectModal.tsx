'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  type SaasProspect, type SaasCancellationReason,
  SAAS_CANCELLATION_REASONS,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const COMMENT_MAX = 1000

export function CancelProspectModal({
  open,
  prospect,
  onClose,
  onConfirmed,
}: {
  open: boolean
  prospect: SaasProspect
  onClose: () => void
  onConfirmed: (updated: SaasProspect) => void
}) {
  const [reason, setReason]   = useState<SaasCancellationReason | ''>('')
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setReason('')
      setComment('')
      setError('')
      setReasonTouched(false)
      setSaving(false)
    }
  }, [open, prospect?.id])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const reasonMissing = !reason
  const reasonError   = reasonTouched && reasonMissing

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setReasonTouched(true)
    if (reasonMissing) return
    setSaving(true); setError('')
    const res = await fetch(`/api/saas-prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suivi: 'annule',
        cancellation_reason:  reason,
        cancellation_comment: comment.trim() || null,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? "Erreur lors de l'annulation.")
      return
    }
    onConfirmed(json.prospect as SaasProspect)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Annuler le prospect</h2>
            <p className="text-xs text-muted-foreground mt-0.5" dir="auto">
              {prospect.full_name} — {prospect.showroom_name}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Reason — required */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Raison de l&apos;annulation *
            </label>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value as SaasCancellationReason | '')
                setReasonTouched(true)
              }}
              onBlur={() => setReasonTouched(true)}
              className={cn(
                'w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 transition',
                reasonError
                  ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/20'
                  : 'border-border focus:border-indigo-400 focus:ring-indigo-500/20',
              )}
            >
              <option value="">Sélectionnez une raison</option>
              {SAAS_CANCELLATION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {reasonError && (
              <p className="mt-1 text-[11px] text-rose-600">
                La raison d&apos;annulation est obligatoire.
              </p>
            )}
          </div>

          {/* Comment — optional */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Commentaire (optionnel)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
              rows={4}
              placeholder="Ajouter des détails…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {comment.length} / {COMMENT_MAX}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 font-medium"
            >
              {saving ? 'Enregistrement…' : "Confirmer l'annulation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
