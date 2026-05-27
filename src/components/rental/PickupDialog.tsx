'use client'
// ─────────────────────────────────────────────────────────────────────
// PickupDialog — "Voiture récupérée" modal.
// ─────────────────────────────────────────────────────────────────────
// To move a confirmed contract → active, FULL financial settlement is
// required: remaining rent = 0 AND vehicle caution fully collected. This
// dialog opens on click, GETs /api/rental/rentals/[id]/pickup to read the
// authoritative tallies (rent total/paid/remaining + caution attendue/perçue/
// restante), and renders one block per non-zero deficit:
//   • Loyer restant — type='rental_payment' (acompte mode in the reserve flow)
//   • Caution restante — type='deposit'
// Each block collects amount + method + optional reference/notes + (when
// method !== 'cash') a REQUIRED receipt photo. Upload uses the signed-URL
// flow with kind='pickup_receipt'; the resulting path is sent to POST
// /pickup which re-validates everything and runs the safe ordering
// (insert payments → flip confirmed → active, rollback on failure).
//
// If both deficits are already 0 → renders a "Tout est réglé" pane with
// only a Confirmer button (POST with payments:[]).
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Image as ImageIcon, Upload, Wallet, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDZD, toNum, RENTAL_ACTION_PICKUP } from '@/components/rental/booking/types'
import { RENTAL_PAYMENT_METHODS } from '@/lib/rental/payments'
import { uploadViaSignedUrl, validatePhotoFile, extOf } from '@/lib/rental/storage'

export type PickupResult = {
  rental:   { id: string; contract_number: string | null; status: string }
  payments: Array<{
    id: string; type: string; amount: number; method: string
    reference: string | null; notes: string | null
    receipt_url: string | null; created_at: string
  }>
}

type Tallies = {
  total:           number
  payeLoyer:       number
  resteLoyer:      number
  cautionAttendue: number
  cautionPercue:   number
  cautionRestante: number
}

export default function PickupDialog({
  rentalId, contractNumber, onClose, onPickedUp,
}: {
  rentalId:       string
  contractNumber: string | null
  onClose:        () => void
  onPickedUp:     (r: PickupResult) => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [data, setData] = useState<Tallies | null>(null)

  // Rent block
  const [rAmount, setRAmount]   = useState('')
  const [rMethod, setRMethod]   = useState<string>(RENTAL_PAYMENT_METHODS[0].code)
  const [rRef, setRRef]         = useState('')
  const [rNotes, setRNotes]     = useState('')
  const [rFile, setRFile]       = useState<File | null>(null)
  const [rFileErr, setRFileErr] = useState<string | null>(null)

  // Caution block
  const [cAmount, setCAmount]   = useState('')
  const [cMethod, setCMethod]   = useState<string>(RENTAL_PAYMENT_METHODS[0].code)
  const [cRef, setCRef]         = useState('')
  const [cNotes, setCNotes]     = useState('')
  const [cFile, setCFile]       = useState<File | null>(null)
  const [cFileErr, setCFileErr] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  // ── Load tallies on open ───────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/rental/rentals/${rentalId}/pickup`)
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadErr(j?.message ?? j?.error ?? 'Impossible de charger les paiements.')
          setLoading(false); return
        }
        const t = j as Tallies
        setData(t)
        setRAmount(String(Math.max(0, Math.round(toNum(t.resteLoyer)))))
        setCAmount(String(Math.max(0, Math.round(toNum(t.cautionRestante)))))
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoadErr('Erreur réseau.'); setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [rentalId])

  const needRent       = (data?.resteLoyer      ?? 0) > 0
  const needCaution    = (data?.cautionRestante ?? 0) > 0
  const allSettled     = !!data && !needRent && !needCaution

  const rAmt           = toNum(rAmount)
  const cAmt           = toNum(cAmount)
  const rBelow         = needRent    && rAmt < (data?.resteLoyer      ?? 0)
  const cBelow         = needCaution && cAmt < (data?.cautionRestante ?? 0)
  const rNeedsPhoto    = needRent    && rMethod !== 'cash'
  const cNeedsPhoto    = needCaution && cMethod !== 'cash'
  const rMissingPhoto  = rNeedsPhoto && !rFile
  const cMissingPhoto  = cNeedsPhoto && !cFile

  const canSubmit =
    !loading && !busy && !loadErr && !!data
    && (!needRent    || (rAmt > 0 && !rBelow && !rMissingPhoto))
    && (!needCaution || (cAmt > 0 && !cBelow && !cMissingPhoto))

  function pickFile(setter: (f: File | null) => void, errSet: (s: string | null) => void) {
    return (f: File | null) => {
      errSet(null)
      if (!f) { setter(null); return }
      const v = validatePhotoFile(f)
      if (v) {
        errSet(v === 'rental.upload.error_size'
          ? 'Fichier trop volumineux (max 5 Mo).'
          : 'Format non autorisé (jpg/png/webp).')
        setter(null); return
      }
      setter(f)
    }
  }

  async function submit() {
    if (!data) return
    // Local validation (server is authoritative; this is UX only).
    if (needRent) {
      if (!(rAmt > 0))     { setErr('Montant loyer invalide.'); return }
      if (rBelow)          { setErr(`Loyer restant à régler: ${formatDZD(data.resteLoyer)}.`); return }
      if (rMissingPhoto)   { setErr('Photo du reçu (loyer) obligatoire pour ce mode de paiement.'); return }
    }
    if (needCaution) {
      if (!(cAmt > 0))     { setErr('Montant caution invalide.'); return }
      if (cBelow)          { setErr(`Caution restante à percevoir: ${formatDZD(data.cautionRestante)}.`); return }
      if (cMissingPhoto)   { setErr('Photo du reçu (caution) obligatoire pour ce mode de paiement.'); return }
    }
    setBusy(true); setErr(null)
    try {
      // 1) Upload non-cash receipts FIRST. The path is what the server stores.
      let rPath: string | null = null
      let cPath: string | null = null
      if (rNeedsPhoto && rFile) {
        const ext = extOf(rFile) || 'jpg'
        rPath = await uploadViaSignedUrl(rFile, {
          kind: 'pickup_receipt', rental_id: rentalId, file_ext: ext,
        })
      }
      if (cNeedsPhoto && cFile) {
        const ext = extOf(cFile) || 'jpg'
        cPath = await uploadViaSignedUrl(cFile, {
          kind: 'pickup_receipt', rental_id: rentalId, file_ext: ext,
        })
      }

      // 2) Build payments[] (skip blocks with 0 remaining; server re-validates).
      const payments: Array<Record<string, unknown>> = []
      if (needRent) {
        payments.push({
          kind:      'rent',
          amount:    rAmt,
          method:    rMethod,
          reference: rRef.trim()   || null,
          notes:     rNotes.trim() || null,
          ...(rPath ? { receipt_path: rPath } : {}),
        })
      }
      if (needCaution) {
        payments.push({
          kind:      'caution',
          amount:    cAmt,
          method:    cMethod,
          reference: cRef.trim()   || null,
          notes:     cNotes.trim() || null,
          ...(cPath ? { receipt_path: cPath } : {}),
        })
      }

      const res = await fetch(`/api/rental/rentals/${rentalId}/pickup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payments }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setErr(j?.message ?? j?.error ?? 'Récupération échouée.')
        setBusy(false); return
      }
      onPickedUp(j as PickupResult)
      // Parent unmounts the dialog on success — keep busy until then.
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Erreur réseau. Réessayez.')
      setBusy(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Voiture récupérée" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">{RENTAL_ACTION_PICKUP}</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {contractNumber ? <bdi className="font-medium text-[var(--text-primary)]">{contractNumber}</bdi> : 'Ce contrat'} passera en « En cours de location » après le règlement complet.
        </p>

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des paiements…
          </div>
        )}

        {!loading && loadErr && (
          <p className="mt-4 text-xs" style={{ color: '#fb7185' }}>{loadErr}</p>
        )}

        {!loading && data && (
          <>
            {/* Summary */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SummaryBox
                icon={<Wallet className="w-3.5 h-3.5" />}
                title="Loyer"
                lines={[
                  ['Total', formatDZD(data.total)],
                  ['Payé',  formatDZD(data.payeLoyer)],
                ]}
                highlight={needRent ? formatDZD(data.resteLoyer) : 'Réglé'}
                tone={needRent ? 'warn' : 'ok'}
              />
              <SummaryBox
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                title="Caution"
                lines={[
                  ['Requise', formatDZD(data.cautionAttendue)],
                  ['Perçue',  formatDZD(data.cautionPercue)],
                ]}
                highlight={needCaution ? formatDZD(data.cautionRestante) : 'Perçue'}
                tone={needCaution ? 'warn' : 'ok'}
              />
            </div>

            {allSettled && (
              <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                ✅ Tout est réglé — prêt à récupérer.
              </div>
            )}

            {/* Rent block */}
            {needRent && (
              <PaymentBlock
                title={`Loyer restant — ${formatDZD(data.resteLoyer)}`}
                amount={rAmount} setAmount={setRAmount} minAmount={data.resteLoyer}
                method={rMethod} setMethod={(m) => { setRMethod(m); if (m === 'cash') { setRFile(null); setRFileErr(null) } }}
                reference={rRef} setReference={setRRef}
                notes={rNotes} setNotes={setRNotes}
                needsPhoto={rNeedsPhoto}
                file={rFile} onPick={pickFile(setRFile, setRFileErr)}
                fileErr={rFileErr}
                belowMin={rAmt > 0 && rBelow}
                inputCls={input} inputStyle={inputStyle}
              />
            )}

            {/* Caution block */}
            {needCaution && (
              <PaymentBlock
                title={`Caution restante — ${formatDZD(data.cautionRestante)}`}
                amount={cAmount} setAmount={setCAmount} minAmount={data.cautionRestante}
                method={cMethod} setMethod={(m) => { setCMethod(m); if (m === 'cash') { setCFile(null); setCFileErr(null) } }}
                reference={cRef} setReference={setCRef}
                notes={cNotes} setNotes={setCNotes}
                needsPhoto={cNeedsPhoto}
                file={cFile} onPick={pickFile(setCFile, setCFileErr)}
                fileErr={cFileErr}
                belowMin={cAmt > 0 && cBelow}
                inputCls={input} inputStyle={inputStyle}
              />
            )}
          </>
        )}

        {err && <p className="mt-3 text-xs" style={{ color: '#fb7185' }}>{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Annuler</button>
          <button type="button" onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {allSettled ? 'Confirmer' : RENTAL_ACTION_PICKUP}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────
function SummaryBox({
  icon, title, lines, highlight, tone,
}: {
  icon:      React.ReactNode
  title:     string
  lines:     [string, string][]
  highlight: string
  tone:      'ok' | 'warn'
}) {
  const isWarn = tone === 'warn'
  return (
    <div className="rounded-xl p-3"
      style={isWarn
        ? { background: 'rgba(245,158,11,0.10)', boxShadow: 'inset 0 0 0 1.5px rgba(245,158,11,0.40)' }
        : { background: 'rgba(16,185,129,0.10)', boxShadow: 'inset 0 0 0 1.5px rgba(16,185,129,0.40)' }}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {icon}{title}
      </p>
      <div className="mt-1 space-y-0.5">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{k}</span><span className="tabular-nums text-[var(--text-primary)]"><bdi>{v}</bdi></span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-sm font-bold tabular-nums" style={{ color: isWarn ? '#fbbf24' : '#10b981' }}>
        <bdi>{isWarn ? `Reste: ${highlight}` : highlight}</bdi>
      </p>
    </div>
  )
}

function PaymentBlock({
  title, amount, setAmount, minAmount, method, setMethod,
  reference, setReference, notes, setNotes,
  needsPhoto, file, onPick, fileErr,
  belowMin, inputCls, inputStyle,
}: {
  title:       string
  amount:      string;  setAmount:    (s: string) => void
  minAmount:   number
  method:      string;  setMethod:    (s: string) => void
  reference:   string;  setReference: (s: string) => void
  notes:       string;  setNotes:     (s: string) => void
  needsPhoto:  boolean
  file:        File | null
  onPick:      (f: File | null) => void
  fileErr:     string | null
  belowMin:    boolean
  inputCls:    string
  inputStyle:  React.CSSProperties
}) {
  return (
    <div className="mt-4 rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-elevated)' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Montant (DZD)</label>
          <input type="number" min={minAmount} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Méthode</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls} style={inputStyle}>
            {RENTAL_PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Référence (optionnel)</label>
        <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} style={inputStyle} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notes (optionnel)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} style={inputStyle} />
      </div>

      {needsPhoto && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            <ImageIcon className="w-3.5 h-3.5" />
            Photo du reçu <span style={{ color: '#fb7185' }}>(obligatoire)</span>
          </label>
          <label
            className={cn('flex items-center gap-2 h-10 px-3 rounded-lg text-sm cursor-pointer', file ? '' : 'opacity-90')}
            style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
            <Upload className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="truncate">{file ? file.name : 'Choisir une image (jpg / png / webp, max 5 Mo)'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileErr && <p className="mt-1 text-xs" style={{ color: '#fb7185' }}>{fileErr}</p>}
        </div>
      )}

      {belowMin && (
        <p className="text-xs" style={{ color: '#fbbf24' }}>
          Montant insuffisant. Minimum: {formatDZD(minAmount)}.
        </p>
      )}
    </div>
  )
}
