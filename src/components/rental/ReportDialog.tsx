'use client'
// ─────────────────────────────────────────────────────────────────────
// ReportDialog — "Reporter le contrat" modal.
// ─────────────────────────────────────────────────────────────────────
// Required inputs: new start_date + end_date (times are optional, prefilled).
// The dialog GETs the current rental on open, prefills the inputs, and on
// every date change runs a debounced (~400 ms) live availability check via
// POST /api/rental/availability { …, exclude_rental_id: rentalId } so the
// rental's own period doesn't self-conflict. The availability result is
// shown as a NON-BLOCKING amber banner — submitting is always allowed; a
// reported contract is excluded from check_rental_overlap, so it never
// blocks its vehicle.
//
// Below the inputs we render a live "Durée: X j · Nouveau total:
// formatDZD(daily_rate_snapshot × duration)" line (same formula as POST
// /api/rental/rentals + the upcoming /report route, so client and server
// agree). The server is authoritative: it recomputes both fields from the
// new dates before persisting.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CalendarClock, AlertTriangle } from 'lucide-react'
import {
  formatDZD, toNum, computeDurationDays, formatDateFr,
} from '@/components/rental/booking/types'

export type ReportResult = {
  rental: {
    id: string; contract_number: string | null; status: string
    start_date: string; end_date: string
    start_time: string; end_time: string
    duration_days: number; total_rental_amount: number
  }
  warning: {
    had_conflict: boolean
    conflicts?: { start_date: string; end_date: string }[]
  }
}

type Loaded = {
  rental_vehicle_id:   string
  start_date:          string
  end_date:            string
  start_time:          string
  end_time:            string
  daily_rate_snapshot: number
}

type Availability =
  | { available: true }
  | { available: false; conflicts?: { start_date: string; end_date: string }[] }

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

export default function ReportDialog({
  rentalId, contractNumber, onClose, onReported,
}: {
  rentalId:       string
  contractNumber: string | null
  onClose:        () => void
  onReported:     (r: ReportResult) => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [data, setData]       = useState<Loaded | null>(null)

  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')

  const [availability, setAvailability] = useState<Availability | null>(null)
  const [availLoading, setAvailLoading] = useState(false)

  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  // ── Load current rental ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/rental/rentals/${rentalId}/report`)
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadErr(j?.message ?? j?.error ?? 'Impossible de charger le contrat.')
          setLoading(false); return
        }
        const d: Loaded = {
          rental_vehicle_id:   String(j.rental_vehicle_id ?? ''),
          start_date:          String(j.start_date ?? ''),
          end_date:            String(j.end_date ?? ''),
          start_time:          String(j.start_time ?? '09:00').slice(0, 5),
          end_time:            String(j.end_time ?? '18:00').slice(0, 5),
          daily_rate_snapshot: toNum(j.daily_rate_snapshot),
        }
        setData(d)
        setStartDate(d.start_date)
        setEndDate(d.end_date)
        setStartTime(d.start_time)
        setEndTime(d.end_time)
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoadErr('Erreur réseau.'); setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [rentalId])

  // ── Derived total (live preview — server re-validates) ──────
  const duration = useMemo(
    () => (DATE_RX.test(startDate) && DATE_RX.test(endDate) && endDate >= startDate)
      ? computeDurationDays(startDate, endDate)
      : null,
    [startDate, endDate],
  )
  const newTotal = data && duration != null
    ? Math.max(0, Math.round(data.daily_rate_snapshot * duration))
    : 0
  const datesValid = duration != null && duration > 0

  // ── Debounced availability check (~400 ms) ─────────────────
  useEffect(() => {
    if (!data) return
    if (!datesValid) { setAvailability(null); setAvailLoading(false); return }
    setAvailLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/rental/availability', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            rental_vehicle_id: data.rental_vehicle_id,
            start_date:        startDate,
            end_date:          endDate,
            exclude_rental_id: rentalId,
          }),
        })
        const j = await res.json().catch(() => ({}))
        if (res.ok && typeof j?.available === 'boolean') setAvailability(j as Availability)
        else setAvailability(null)
      } catch {
        setAvailability(null)
      } finally {
        setAvailLoading(false)
      }
    }, 400)
    return () => { clearTimeout(handle); setAvailLoading(false) }
  }, [data, datesValid, startDate, endDate, rentalId])

  const canSubmit = !loading && !busy && !loadErr && datesValid

  async function submit() {
    if (!canSubmit) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/rental/rentals/${rentalId}/report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          start_date: startDate,
          end_date:   endDate,
          ...(startTime ? { start_time: startTime } : {}),
          ...(endTime   ? { end_time:   endTime   } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setErr(j?.message ?? j?.error ?? 'Report échoué.')
        setBusy(false); return
      }
      onReported(j as ReportResult)
      // Parent unmounts the dialog on success — keep busy until then.
    } catch {
      setErr('Erreur réseau. Réessayez.'); setBusy(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  const hasConflict = availability?.available === false
  const conflicts = (availability && availability.available === false) ? (availability.conflicts ?? []) : []

  return (
    <div onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Reporter le contrat" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}>
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <CalendarClock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Reporter le contrat
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {contractNumber ? <bdi className="font-medium text-[var(--text-primary)]">{contractNumber}</bdi> : 'Ce contrat'} passera en « Reporté » avec les nouvelles dates. Le total est recalculé à partir du tarif/jour enregistré.
        </p>

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        )}
        {!loading && loadErr && <p className="mt-4 text-xs" style={{ color: '#fb7185' }}>{loadErr}</p>}

        {!loading && data && (
          <>
            {/* Dates */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Date début</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Date fin</label>
                <input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} style={inputStyle} />
              </div>
            </div>

            {/* Times */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Heure début (optionnel)</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Heure fin (optionnel)</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} style={inputStyle} />
              </div>
            </div>

            {/* Derived total */}
            <div className="mt-4 rounded-xl p-3 flex items-center justify-between"
              style={{ background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {datesValid ? `Durée : ${duration} j` : 'Choisissez de nouvelles dates'}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                <bdi>Nouveau total : {formatDZD(newTotal)}</bdi>
              </span>
            </div>

            {/* Availability — non-blocking */}
            {datesValid && (
              <div className="mt-3">
                {availLoading && (
                  <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> Vérification de la disponibilité…
                  </p>
                )}
                {!availLoading && hasConflict && (
                  <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(245,158,11,0.10)', boxShadow: 'inset 0 0 0 1.5px rgba(245,158,11,0.40)', color: '#fbbf24' }}>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Le véhicule est déjà réservé sur ces dates.
                    </p>
                    <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Vous pouvez quand même reporter : un contrat « Reporté » ne bloque pas le véhicule.
                    </p>
                    {conflicts.length > 0 && (
                      <ul className="mt-2 space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {conflicts.slice(0, 4).map((c, i) => (
                          <li key={`${c.start_date}-${c.end_date}-${i}`} className="text-[11px] tabular-nums">
                            • {formatDateFr(c.start_date)} → {formatDateFr(c.end_date)}
                          </li>
                        ))}
                        {conflicts.length > 4 && (
                          <li className="text-[11px]" style={{ color: 'var(--text-muted)' }}>+ {conflicts.length - 4} autre(s)…</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {!availLoading && availability?.available === true && (
                  <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}>
                    ✓ Véhicule disponible sur ces dates.
                  </p>
                )}
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
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Reporter
          </button>
        </div>
      </div>
    </div>
  )
}
