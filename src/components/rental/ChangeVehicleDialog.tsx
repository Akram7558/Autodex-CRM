'use client'
// ─────────────────────────────────────────────────────────────────────
// ChangeVehicleDialog — shared "Changer le véhicule" modal.
// ─────────────────────────────────────────────────────────────────────
// Used by:
//   • Rental prospects pipeline (kind='prospect') — switch the requested car.
//   • Rental contracts list/detail (kind='contract') — switch the booked car
//     on an À-confirmer / Réservé contract, with a LIVE preview of the new
//     daily rate + caution + total. The server is authoritative on the
//     recompute — this preview just mirrors the same formula client-side.
//
// Vehicles list comes from GET /api/rental/vehicles?is_active=true (returns
// the full row incl. daily_rate + deposit_amount). The submit PATCHes the
// matching endpoint with { rental_vehicle_id: selectedId }. The server runs
// all the validation + (for contracts) the overlap re-check; this dialog
// only renders + emits.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Car as CarIcon } from 'lucide-react'
import { formatDZD, toNum } from '@/components/rental/booking/types'

export type ChangeVehicleResult =
  | { rental: unknown }
  | { prospect: unknown }

type VehicleOpt = {
  id:              string
  marque:          string
  modele:          string
  annee:           number | null
  immatriculation: string
  daily_rate:      number | string | null
  deposit_amount:  number | string | null
}

export default function ChangeVehicleDialog({
  kind, id, currentVehicleId, currentVehicleLabel, durationDays,
  onClose, onSaved,
}: {
  kind:                'contract' | 'prospect'
  id:                  string
  currentVehicleId:    string | null
  currentVehicleLabel: string | null
  durationDays?:       number | null
  onClose:             () => void
  onSaved:             (result: ChangeVehicleResult) => void
}) {
  const [vehicles, setVehicles]   = useState<VehicleOpt[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadErr, setLoadErr]     = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelected] = useState<string>(currentVehicleId ?? '')
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  // ── Load active vehicles (refetch by bumping reloadKey) ────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/rental/vehicles?is_active=true')
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadErr(j?.message ?? j?.error ?? 'Impossible de charger les véhicules.')
          setLoading(false); return
        }
        setVehicles((j.vehicles ?? []) as VehicleOpt[])
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoadErr('Erreur réseau.'); setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  const currentInList = currentVehicleId ? vehicles.some((v) => v.id === currentVehicleId) : false
  const showHead = !currentInList   // prepend a disabled head when current is null or no longer active
  const headValue = currentVehicleId ?? ''
  const headLabel = currentVehicleLabel ?? 'Aucun véhicule'

  const selectedVehicle = vehicles.find((v) => v.id === selectedId)
  const isDifferent = !!selectedId && selectedId !== (currentVehicleId ?? '')
  const isValidSelection = !!selectedVehicle  // must be in the active list

  const canSubmit = !loading && !busy && isDifferent && isValidSelection

  // Live preview (contract only).
  const newDaily   = toNum(selectedVehicle?.daily_rate)
  const newDeposit = toNum(selectedVehicle?.deposit_amount)
  const newTotal   = (durationDays && durationDays > 0)
    ? Math.max(0, Math.round(newDaily * durationDays))
    : 0

  async function submit() {
    if (!canSubmit) return
    setBusy(true); setErr(null)
    try {
      const endpoint = kind === 'contract'
        ? `/api/rental/rentals/${id}`
        : `/api/rental/prospects/${id}`
      const res = await fetch(endpoint, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rental_vehicle_id: selectedId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Contract path: 409 with error:'unavailable' = vehicle conflict.
        if (res.status === 409 && j?.error === 'unavailable') {
          setErr('Ce véhicule a un conflit de réservation sur ces dates.')
        } else {
          setErr(j?.message ?? j?.error ?? 'Échec de la mise à jour.')
        }
        setBusy(false); return
      }
      onSaved(j as ChangeVehicleResult)
      // Parent unmounts the dialog on success — keep busy until then.
    } catch {
      setErr('Erreur réseau. Réessayez.'); setBusy(false)
    }
  }

  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Changer le véhicule" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}>
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <CarIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Changer le véhicule
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {currentVehicleLabel
            ? <>Véhicule actuel : <bdi className="font-medium text-[var(--text-primary)]">{currentVehicleLabel}</bdi></>
            : 'Aucun véhicule attribué actuellement.'}
        </p>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des véhicules…
          </div>
        )}
        {!loading && loadErr && (
          <div className="mt-4">
            <p className="text-xs" style={{ color: '#fb7185' }}>{loadErr}</p>
            <button type="button"
              onClick={() => { setLoading(true); setLoadErr(null); setReloadKey((k) => k + 1) }}
              className="mt-2 h-8 px-3 rounded-lg text-xs font-medium"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Réessayer</button>
          </div>
        )}

        {!loading && !loadErr && (
          <>
            <div className="mt-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nouveau véhicule</label>
              <select value={selectedId} onChange={(e) => setSelected(e.target.value)} className={input} style={inputStyle}>
                {showHead && (
                  <option value={headValue} disabled>{headLabel}</option>
                )}
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ''} — {v.immatriculation} — {formatDZD(toNum(v.daily_rate))}/j · caution {formatDZD(toNum(v.deposit_amount))}
                  </option>
                ))}
              </select>
              {vehicles.length === 0 && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Aucun véhicule actif disponible dans votre showroom.
                </p>
              )}
            </div>

            {/* Live preview — contract only */}
            {kind === 'contract' && isDifferent && isValidSelection && durationDays != null && durationDays > 0 && (
              <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Aperçu</p>
                <div className="mt-1 text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div>Nouveau tarif journalier : <bdi className="text-[var(--text-primary)] tabular-nums">{formatDZD(newDaily)}</bdi></div>
                  <div>Nouveau total ({durationDays} j) : <bdi className="text-[var(--text-primary)] tabular-nums">{formatDZD(newTotal)}</bdi></div>
                  <div>Nouvelle caution : <bdi className="text-[var(--text-primary)] tabular-nums">{formatDZD(newDeposit)}</bdi></div>
                </div>
                <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Les paiements existants restent inchangés ; seul le restant à régler sera mis à jour.
                </p>
              </div>
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
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
