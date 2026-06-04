'use client'
// ─────────────────────────────────────────────────────────────────────
// ReserveDialog — "Réserver le contrat" modal.
// ─────────────────────────────────────────────────────────────────────
// To move a draft contract → confirmed, the client picks ONE commitment
// via a toggle:
//   • ACOMPTE (avance loyer)     — must be ≥ deposit_min_percent% of total.
//                                  Recorded as type='rental_payment'.
//   • CAUTION (garantie voiture) — must be ≥ rentals.deposit_amount (the
//                                  vehicle caution). Recorded as type='deposit'.
//
// Payment method = cash / ccp / baridimob / bank_transfer. If method !== 'cash'
// a RECEIPT PHOTO is REQUIRED to reserve (uploaded to the private
// `rental-documents` bucket via the signed-URL flow; path stored on the
// payment as receipt_url). Cash → no photo, receipt_url = NULL.
//
// Mounted for users who can reserve (owner/manager/closer/super_admin); the
// server re-validates everything in POST /api/rental/rentals/[id]/reserve and
// RLS scopes a closer to their OWN contracts.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Loader2, CheckCircle2, Image as ImageIcon, Upload, Wallet, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatDZD, toNum, rentalMinDeposit, RENTAL_ACTION_RESERVE,
} from '@/components/rental/booking/types'
import { RENTAL_PAYMENT_METHODS } from '@/lib/rental/payments'
import { uploadViaSignedUrl, validatePhotoFile, extOf } from '@/lib/rental/storage'

export type ReserveResult = {
  rental:  { id: string; contract_number: string | null; status: string }
  payment: {
    id: string; type: string; amount: number; method: string
    reference: string | null; notes: string | null
    receipt_url: string | null
    created_at: string
  }
}

type Mode = 'acompte' | 'caution'

export default function ReserveDialog({
  rentalId, contractNumber, total, depositAmount, minPercent, onClose, onReserved,
}: {
  rentalId:       string
  contractNumber: string | null
  total:          number
  depositAmount:  number      // = rentals.deposit_amount = vehicle caution
  minPercent:     number      // per-showroom deposit_min_percent
  onClose:        () => void
  onReserved:     (r: ReserveResult) => void
}) {
  const minAcompte    = rentalMinDeposit(total, minPercent)
  const cautionTarget = Math.max(0, Math.round(toNum(depositAmount)))

  const [mode, setMode] = useState<Mode>('acompte')
  const [amount, setAmount] = useState<string>(String(minAcompte))
  const [method, setMethod] = useState<string>(RENTAL_PAYMENT_METHODS[0].code)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const target       = mode === 'acompte' ? minAcompte : cautionTarget
  const amt          = toNum(amount)
  const belowTarget  = amt < target
  const needsPhoto   = method !== 'cash'
  const missingPhoto = needsPhoto && !file
  const canSubmit    = amt > 0 && !belowTarget && !missingPhoto && !busy

  function changeMode(next: Mode) {
    setMode(next)
    setAmount(String(next === 'acompte' ? minAcompte : cautionTarget))
    setErr(null)
  }

  function pickFile(f: File | null) {
    setFileErr(null)
    if (!f) { setFile(null); return }
    const v = validatePhotoFile(f)
    if (v) {
      setFileErr(v === 'rental.upload.error_size'
        ? 'Fichier trop volumineux (max 5 Mo).'
        : 'Format non autorisé (jpg/png/webp).')
      setFile(null)
      return
    }
    setFile(f)
  }

  async function submit() {
    if (!(amt > 0)) { setErr('Montant invalide.'); return }
    if (belowTarget) {
      setErr(mode === 'acompte'
        ? `L'acompte doit être au moins ${formatDZD(minAcompte)} (${minPercent}% du total).`
        : `La caution doit couvrir la caution voiture (${formatDZD(cautionTarget)}).`,
      )
      return
    }
    if (missingPhoto) { setErr('Photo du reçu obligatoire pour ce mode de paiement.'); return }
    setBusy(true); setErr(null)
    try {
      // 1) Upload the receipt first if non-cash. The path is what the server stores.
      let receiptPath: string | null = null
      if (needsPhoto && file) {
        const ext = extOf(file) || 'jpg'
        receiptPath = await uploadViaSignedUrl(file, {
          kind:      'deposit_receipt',
          rental_id: rentalId,
          file_ext:  ext,
        })
      }

      // 2) POST /reserve. Server re-validates everything and runs the
      //    overlap-check → insert → flip-status sequence atomically-ish.
      const res = await fetch(`/api/rental/rentals/${rentalId}/reserve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          amount:    amt,
          method,
          reference: reference.trim() || null,
          notes:     notes.trim() || null,
          ...(receiptPath ? { receipt_path: receiptPath } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setErr(j?.message ?? j?.error ?? 'Réservation échouée.')
        setBusy(false); return
      }
      onReserved(j as ReserveResult)
      // Parent unmounts the dialog on success — keep busy until then.
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Erreur réseau. Réessayez.')
      setBusy(false)
    }
  }

  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Réserver le contrat" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Réserver le contrat</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {contractNumber ? <bdi className="font-medium text-[var(--text-primary)]">{contractNumber}</bdi> : 'Ce contrat'} passera en « Réservé » après l’enregistrement du paiement.
        </p>

        {/* Mode toggle */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Que dépose le client&nbsp;?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ModePill active={mode === 'acompte'} onClick={() => changeMode('acompte')} icon={<Wallet className="w-3.5 h-3.5" />}>
              Acompte
            </ModePill>
            <ModePill active={mode === 'caution'} onClick={() => changeMode('caution')} icon={<ShieldCheck className="w-3.5 h-3.5" />}>
              Caution
            </ModePill>
          </div>
        </div>

        {/* Both targets always shown — active mode highlighted */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TargetBox label={`Acompte min (${minPercent}%)`} value={formatDZD(minAcompte)} active={mode === 'acompte'} />
          <TargetBox label="Caution voiture" value={formatDZD(cautionTarget)} active={mode === 'caution'} />
        </div>

        {/* Amount + method */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Montant (DZD)</label>
            <input type="number" min={target} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Méthode</label>
            <select value={method} onChange={(e) => { setMethod(e.target.value); if (e.target.value === 'cash') { setFile(null); setFileErr(null) } }} className={input} style={inputStyle}>
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

        {/* Receipt photo — only when non-cash */}
        {needsPhoto && (
          <div className="mt-3">
            <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <ImageIcon className="w-3.5 h-3.5" />
              Photo du reçu <span style={{ color: '#fb7185' }}>(obligatoire)</span>
            </label>
            <label
              className={cn(
                'flex items-center gap-2 h-10 px-3 rounded-lg text-sm cursor-pointer',
                file ? '' : 'opacity-90',
              )}
              style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
              <Upload className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="truncate">{file ? file.name : 'Choisir une image (jpg / png / webp, max 5 Mo)'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {fileErr && <p className="mt-1 text-xs" style={{ color: '#fb7185' }}>{fileErr}</p>}
          </div>
        )}

        {/* Inline warnings */}
        {amt > 0 && belowTarget && !err && (
          <p className="mt-2 text-xs" style={{ color: '#fbbf24' }}>
            {mode === 'acompte'
              ? `L'acompte doit être au moins ${formatDZD(minAcompte)}.`
              : `La caution doit couvrir au moins ${formatDZD(cautionTarget)}.`}
          </p>
        )}
        {err && <p className="mt-2 text-xs" style={{ color: '#fb7185' }}>{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Annuler</button>
          <button type="button" onClick={submit} disabled={!canSubmit}
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

function ModePill({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-sm font-semibold transition-colors duration-150"
      style={active
        ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 22px -10px var(--accent-glow)' }
        : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
      {icon}{children}
    </button>
  )
}

function TargetBox({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="rounded-xl p-3"
      style={active
        ? { background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }
        : { background: 'var(--bg-elevated)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}>
        <bdi>{value}</bdi>
      </p>
    </div>
  )
}
