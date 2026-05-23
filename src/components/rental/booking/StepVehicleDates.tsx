'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Step 1: vehicle + dates + availability.
// ─────────────────────────────────────────────────────────────────────
// Pick one ACTIVE rental vehicle, choose a start/end date (+ times), and
// get a live AVAILABLE / NOT AVAILABLE verdict from /api/rental/availability
// (debounced). Reports validity up to the shell via `onValidity`.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Car as CarIcon, Check, Loader2, AlertTriangle, CalendarDays } from 'lucide-react'
import { getSignedReadUrl } from '@/lib/rental/storage'
import {
  type BookingAction, type BookingState, type RentalVehicleLite,
  computeDurationDays, formatDateFr, formatDZD, toNum,
} from '@/components/rental/booking/types'

type Avail =
  | { state: 'idle' | 'checking' | 'available' | 'error' }
  | { state: 'unavailable'; conflicts: { start_date: string; end_date: string }[] }

export default function StepVehicleDates({
  state, dispatch, onValidity,
}: {
  state:      BookingState
  dispatch:   (a: BookingAction) => void
  onValidity: (valid: boolean) => void
}) {
  const [vehicles, setVehicles] = useState<RentalVehicleLite[]>([])
  const [loadingVehicles, setLoadingVehicles] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [minDays, setMinDays] = useState(1)
  const [maxDays, setMaxDays] = useState(365)
  const [avail, setAvail] = useState<Avail>({ state: 'idle' })

  const durationDays = computeDurationDays(state.startDate, state.endDate)
  const datesOrderOk = !state.startDate || !state.endDate || state.endDate >= state.startDate
  const durationInRange = durationDays != null && durationDays >= minDays && durationDays <= maxDays

  // ── Load active vehicles + settings (min/max days) ──────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingVehicles(true)
      setLoadError(null)
      try {
        const [vRes, sRes] = await Promise.all([
          fetch('/api/rental/vehicles?is_active=true'),
          fetch('/api/rental/settings'),
        ])
        const vJson = await vRes.json().catch(() => ({}))
        const sJson = await sRes.json().catch(() => ({}))
        if (cancelled) return
        if (!vRes.ok) { setLoadError(vJson?.error ?? 'Erreur de chargement des véhicules.'); setVehicles([]) }
        else {
          // Supabase returns numeric columns as strings — normalize them to
          // numbers here so deposit/rates carry through the wizard correctly.
          const rows = ((vJson.vehicles ?? []) as RentalVehicleLite[])
            .filter((v) => v.is_active)
            .map((v) => ({
              ...v,
              daily_rate:     toNum(v.daily_rate),
              weekly_rate:    v.weekly_rate == null ? null : toNum(v.weekly_rate),
              monthly_rate:   v.monthly_rate == null ? null : toNum(v.monthly_rate),
              deposit_amount: toNum(v.deposit_amount),
            }))
          setVehicles(rows)
        }
        if (sRes.ok && sJson?.settings) {
          setMinDays(Number(sJson.settings.min_rental_days ?? 1) || 1)
          setMaxDays(Number(sJson.settings.max_rental_days ?? 365) || 365)
        }
      } catch {
        if (!cancelled) { setLoadError('Erreur réseau.'); setVehicles([]) }
      } finally {
        if (!cancelled) setLoadingVehicles(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Availability check (debounced) ──────────────────────────
  const vehicleId = state.vehicle?.id ?? null
  const canCheck = !!vehicleId && durationDays != null && datesOrderOk && durationInRange

  useEffect(() => {
    if (!canCheck) { setAvail({ state: 'idle' }); return }
    const ac = new AbortController()
    setAvail({ state: 'checking' })
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/rental/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rental_vehicle_id: vehicleId,
            start_date: state.startDate,
            end_date: state.endDate,
          }),
          signal: ac.signal,
        })
        const j = await res.json().catch(() => ({}))
        if (ac.signal.aborted) return
        if (!res.ok) { setAvail({ state: 'error' }); return }
        if (j.available) setAvail({ state: 'available' })
        else setAvail({ state: 'unavailable', conflicts: j.conflicts ?? [] })
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setAvail({ state: 'error' })
      }
    }, 400)
    return () => { ac.abort(); clearTimeout(t) }
  }, [vehicleId, state.startDate, state.endDate, canCheck])

  // ── Report validity to the shell ────────────────────────────
  useEffect(() => {
    onValidity(!!vehicleId && durationInRange && datesOrderOk && avail.state === 'available')
  }, [vehicleId, durationInRange, datesOrderOk, avail.state, onValidity])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      {/* ── Vehicle picker ──────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Choisir un véhicule
        </h3>

        {loadingVehicles ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="glass-card h-[160px] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <p className="text-sm" style={{ color: '#fb7185' }}>{loadError}</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Aucun véhicule actif. Ajoutez un véhicule à la flotte d&apos;abord.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicles.map((v) => {
              const selected = state.vehicle?.id === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_VEHICLE', vehicle: v })}
                  aria-pressed={selected}
                  className="text-start rounded-2xl overflow-hidden transition-all duration-150 motion-reduce:transition-none"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1.5px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
                    boxShadow: selected ? '0 10px 30px -16px var(--accent-glow)' : 'none',
                  }}
                >
                  <VehicleThumb path={v.photos_urls?.[0] ?? null} selected={selected} />
                  <div className="p-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {v.marque} {v.modele} <span className="text-[var(--text-secondary)] font-normal">· {v.annee}</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">{v.immatriculation}</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] mt-1">{formatDZD(v.daily_rate)} <span className="text-[11px] font-normal text-[var(--text-secondary)]">/ jour</span></p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Dates ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Dates de location
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateField
            label="Début"
            date={state.startDate} time={state.startTime} min={today}
            onDate={(d) => dispatch({ type: 'SET_DATES', patch: { startDate: d } })}
            onTime={(t) => dispatch({ type: 'SET_DATES', patch: { startTime: t } })}
          />
          <DateField
            label="Fin"
            date={state.endDate} time={state.endTime} min={state.startDate || today}
            onDate={(d) => dispatch({ type: 'SET_DATES', patch: { endDate: d } })}
            onTime={(t) => dispatch({ type: 'SET_DATES', patch: { endTime: t } })}
          />
        </div>

        {/* Inline validation */}
        <div className="mt-2 space-y-1 text-xs">
          {!datesOrderOk && (
            <p style={{ color: '#fb7185' }}>La date de fin doit être postérieure ou égale au début.</p>
          )}
          {durationDays != null && datesOrderOk && durationDays < minDays && (
            <p style={{ color: '#fb7185' }}>Durée minimale : {minDays} jour{minDays > 1 ? 's' : ''}.</p>
          )}
          {durationDays != null && datesOrderOk && durationDays > maxDays && (
            <p style={{ color: '#fb7185' }}>Durée maximale : {maxDays} jours.</p>
          )}
          {durationDays != null && durationInRange && (
            <p style={{ color: 'var(--text-secondary)' }}>
              Durée : <span className="font-semibold text-[var(--text-primary)]">{durationDays} jour{durationDays > 1 ? 's' : ''}</span>
            </p>
          )}
        </div>
      </section>

      {/* ── Availability verdict ────────────────────────────── */}
      {state.vehicle && durationInRange && datesOrderOk && (
        <section>
          {avail.state === 'checking' && (
            <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Vérification de la disponibilité…
            </div>
          )}
          {avail.state === 'available' && (
            <div className="flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.35)' }}>
              <Check className="w-4 h-4" /> Disponible pour ces dates
            </div>
          )}
          {avail.state === 'unavailable' && (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
              <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Indisponible pour ces dates</p>
              {avail.conflicts.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {avail.conflicts.map((c, i) => (
                    <li key={i}>Déjà réservé : {formatDateFr(c.start_date)} → {formatDateFr(c.end_date)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {avail.state === 'error' && (
            <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
              style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185' }}>
              <AlertTriangle className="w-4 h-4" /> Erreur lors de la vérification. Réessayez.
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ─── Vehicle thumbnail (private bucket → signed read URL) ────────────
function VehicleThumb({ path, selected }: { path: string | null; selected: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); return }
    ;(async () => {
      const u = await getSignedReadUrl(path)
      if (!cancelled) setUrl(u)
    })()
    return () => { cancelled = true }
  }, [path])

  return (
    <div
      className="relative aspect-[16/10] overflow-hidden"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 4%, transparent))' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <CarIcon className="w-9 h-9" style={{ color: 'var(--accent)', opacity: 0.45 }} />
        </div>
      )}
      {selected && (
        <span className="absolute top-2 end-2 inline-flex items-center justify-center w-6 h-6 rounded-full"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          <Check className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  )
}

// ─── Date + time field ──────────────────────────────────────────────
function DateField({
  label, date, time, min, onDate, onTime,
}: {
  label: string
  date: string
  time: string
  min: string
  onDate: (d: string) => void
  onTime: (t: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          min={min}
          onChange={(e) => onDate(e.target.value)}
          className="flex-1 min-w-0 h-10 px-3 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          aria-label={`Heure ${label.toLowerCase()}`}
          className="w-28 h-10 px-3 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>
    </div>
  )
}
