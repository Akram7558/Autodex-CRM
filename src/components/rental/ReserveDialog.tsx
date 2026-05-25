'use client'
// ─────────────────────────────────────────────────────────────────────
// ReserveDialog — "Réserver le contrat" modal (shared by the contracts list
// + the contract detail). Collects the MANDATORY deposit (caution ≥ 5% of the
// total) + payment method, then POSTs /api/rental/rentals/[id]/reserve, which
// records the deposit and moves draft → confirmed (overlap re-checked
// server-side). Only mounted for financial users (owner/manager/super_admin).
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import {
  formatDZD, toNum, rentalMinDeposit, RENTAL_ACTION_RESERVE,
} from '@/components/rental/booking/types'
import { RENTAL_PAYMENT_METHODS } from '@/lib/rental/payments'

export type ReserveResult = {
  rental:  { id: string; contract_number: string | null; status: string }
  payment: {
    id: string; type: string; amount: number; method: string
    reference: string | null; notes: string | null; created_at: string
  }
}

export default function ReserveDialog({
  rentalId, contractNumber, total, depositAmount, minPercent, onClose, onReserved,
}: {
  rentalId:       string
  contractNumber: string | null
  total:          number
  depositAmount:  number
  minPercent:     number
  onClose:        () => void
  onReserved:     (r: ReserveResult) => void
}) {
  const min = rentalMinDeposit(total, minPercent)
  const [amount, setAmount] = useState(String(Math.max(Math.round(depositAmount), min)))
  const [method, setMethod] = useState<string>(RENTAL_PAYMENT_METHODS[0].code)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const amt = toNum(amount)
  const belowMin = amt < min

  async function submit() {
    if (belowMin) { setErr(`Le dépôt doit être au moins ${formatDZD(min)} (${minPercent}% du total).`); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/rental/rentals/${rentalId}/reserve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deposit_amount: amt, method,
          reference: reference.trim() || null, notes: notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) { setErr(j?.message ?? j?.error ?? 'Réservation échouée.'); setBusy(false); return }
      onReserved(j as ReserveResult)
      // Parent unmounts the dialog on success — keep busy until then.
    } catch { setErr('Erreur réseau. Réessayez.'); setBusy(false) }
  }

  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Réserver le contrat" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Réserver le contrat</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {contractNumber ? <bdi className="font-medium text-[var(--text-primary)]">{contractNumber}</bdi> : 'Ce contrat'} passera en « Réservé » après l’enregistrement de la caution.
        </p>

        {/* Total + required minimum */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total location</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text-primary)]"><bdi>{formatDZD(total)}</bdi></p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Caution min. ({minPercent}%)</p>
            <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}><bdi>{formatDZD(min)}</bdi></p>
          </div>
        </div>

        {/* Deposit + method */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Caution (DZD)</label>
            <input type="number" min={min} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Méthode</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} style={inputStyle}>
              {RENTAL_PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Référence (optionnel)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} style={inputStyle} />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notes (optionnel)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} style={inputStyle} />
        </div>

        {belowMin && !err && (
          <p className="mt-2 text-xs" style={{ color: '#fbbf24' }}>La caution doit être au moins {formatDZD(min)}.</p>
        )}
        {err && <p className="mt-2 text-xs" style={{ color: '#fb7185' }}>{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Annuler</button>
          <button type="button" onClick={submit} disabled={busy || belowMin}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {RENTAL_ACTION_RESERVE}
          </button>
        </div>
      </div>
    </div>
  )
}
