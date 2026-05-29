'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalProspectsList — rental prospects pipeline (mirrors sales suivi UX).
// ─────────────────────────────────────────────────────────────────────
// A single status filter <select> (Tentative 1/2/3 grouped as "Tentatives")
// over the full row set + a per-row COLORED suivi <select>
// (RENTAL_PROSPECT_SUIVI_OPTIONS / *_BADGE_CLASSES), plus Call/Message
// popovers (tel:/sms:/wa.me) — same interaction model as
// the sales Prospects page. Rental-specific content kept: the REASON chip
// (key signal), requested vehicle, desired dates, message.
//
// Changing the per-row suivi dropdown PATCHes /api/rental/prospects/[id]
// (optimistic; revert + toast on error). That dropdown holds the relance
// statuses only (nouvelle / tentative_1-3 / reporter / perdue). "RDV planifié"
// is a SEPARATE per-row action button (Chantier 5): it opens a confirmation
// modal, then POSTs /api/rental/prospects/[id]/schedule which MOVES the
// prospect into Contrats (auto-creates a draft when the vehicle + dates are
// known, or opens the booking wizard otherwise) and redirects there. rdv_planifie
// and convertie prospects are filtered out of this list server-side (so the
// row vanishes once scheduled, and there is no manual "Convertir en contrat"
// button). All labels/colors come from src/lib/rental/prospects.ts.
// ─────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Car as CarIcon, CalendarRange, CalendarCheck, Loader2, Inbox,
} from 'lucide-react'
import ContactButtons from '@/components/rental/ContactButtons'
import ChangeVehicleDialog from '@/components/rental/ChangeVehicleDialog'
import { cn } from '@/lib/utils'
import {
  RENTAL_PROSPECT_SUIVI_OPTIONS,
  RENTAL_PROSPECT_SUIVI_BADGE_CLASSES, rentalProspectStatusLabel,
  rentalProspectReasonLabel,
  type RentalProspectStatus,
} from '@/lib/rental/prospects'
import { formatDateFr } from '@/components/rental/booking/types'

export type ProspectRow = {
  id:                  string
  full_name:           string
  phone:               string
  desired_start_date:  string | null
  desired_end_date:    string | null
  reason:              string
  reason_other:        string | null
  message:             string | null
  status:              string
  converted_rental_id: string | null
  rental_vehicle_id:   string | null
  created_at:          string
  vehicle:  { marque: string; modele: string; annee: number | null } | null
  contract_number: string | null
}

const REASON_COLORS: Record<string, { bg: string; fg: string; ring: string }> = {
  mariage:       { bg: 'rgba(236,72,153,0.12)', fg: '#ec4899', ring: 'rgba(236,72,153,0.35)' },
  long_trajet:   { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa', ring: 'rgba(59,130,246,0.35)' },
  professionnel: { bg: 'rgba(99,102,241,0.12)', fg: '#818cf8', ring: 'rgba(99,102,241,0.35)' },
  remplacement:  { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', ring: 'rgba(245,158,11,0.35)' },
  tourisme:      { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  evenement:     { bg: 'rgba(168,85,247,0.12)', fg: '#a855f7', ring: 'rgba(168,85,247,0.35)' },
  essai:         { bg: 'rgba(14,165,233,0.12)', fg: '#38bdf8', ring: 'rgba(14,165,233,0.35)' },
  autre:         { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', ring: 'rgba(148,163,184,0.35)' },
}

function reasonText(r: ProspectRow): string {
  return r.reason === 'autre' && r.reason_other ? r.reason_other : rentalProspectReasonLabel(r.reason)
}
function ReasonChip({ r }: { r: ProspectRow }) {
  const c = REASON_COLORS[r.reason] ?? REASON_COLORS.autre
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}>
      {reasonText(r)}
    </span>
  )
}
function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d)
}
function Dates({ r }: { r: ProspectRow }) {
  if (!r.desired_start_date && !r.desired_end_date) {
    return <span className="text-[var(--text-muted)]">Dates non précisées</span>
  }
  return <span>{formatDateFr(r.desired_start_date ?? '')} → {formatDateFr(r.desired_end_date ?? '')}</span>
}

// Single status filter over the full row set (the 3 coarse tabs were collapsed
// into this one dropdown). 'tentatives' groups tentative_1/2/3; rdv_planifie +
// convertie never appear (excluded server-side), so the list only ever holds
// nouvelle / tentative_* / reporter / perdue.
const TENTATIVE_SET = new Set<string>(['tentative_1', 'tentative_2', 'tentative_3'])

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '__all__',    label: 'Tous les statuts' },
  { value: 'nouvelle',   label: 'Nouvelle' },
  { value: 'tentatives', label: 'Tentatives' },
  { value: 'reporter',   label: 'Reporter' },
  { value: 'perdue',     label: 'Annulée' },
]

function matchesStatusFilter(status: string, filter: string): boolean {
  if (filter === '__all__')    return true
  if (filter === 'tentatives') return TENTATIVE_SET.has(status)
  return status === filter
}

export default function RentalProspectsList({ initialRows }: { initialRows: ProspectRow[] }) {
  const [rows, setRows] = useState<ProspectRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rdvTarget, setRdvTarget] = useState<ProspectRow | null>(null)
  const [rdvBusy, setRdvBusy] = useState(false)
  const [vehicleTarget, setVehicleTarget] = useState<ProspectRow | null>(null)
  // Single status filter over the whole list. '__all__' = no filter.
  const [statusFilter, setStatusFilter] = useState<string>('__all__')
  const router = useRouter()

  // Per-option counts over the full row set, shown inline in the dropdown.
  const countByFilter = useMemo(() => {
    const m: Record<string, number> = {}
    for (const opt of STATUS_FILTER_OPTIONS) {
      m[opt.value] = rows.filter((r) => matchesStatusFilter(r.status, opt.value)).length
    }
    return m
  }, [rows])

  const visibleRows = rows.filter((r) => matchesStatusFilter(r.status, statusFilter))

  async function changeStatus(row: ProspectRow, status: RentalProspectStatus) {
    const prev = row.status
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r))) // optimistic
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/rental/prospects/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.prospect) {
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: prev } : r))) // revert
        setError(j?.message ?? j?.error ?? 'Mise à jour échouée.')
      }
    } catch {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: prev } : r)))
      setError('Erreur réseau. Réessayez.')
    } finally {
      setBusyId(null)
    }
  }

  // "RDV planifié" is a dedicated ACTION (a per-row button), no longer a suivi
  // status: it opens the confirm modal, which then MOVES the prospect into
  // Contrats via the schedule flow. The relance dropdown handles every other
  // status with the normal optimistic PATCH (changeStatus).
  function openRdv(row: ProspectRow) {
    setError(null)
    setRdvTarget(row)
  }

  async function confirmRdv() {
    if (!rdvTarget) return
    const target = rdvTarget
    setRdvBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/rental/prospects/${target.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j?.message ?? j?.error ?? 'La planification a échoué.')
        setRdvBusy(false)
        setRdvTarget(null)
        return
      }
      // The prospect is now rdv_planifie (moved into Contrats, or awaiting the
      // wizard) — it's filtered out of this list server-side, so drop it from
      // the displayed rows immediately. It vanishes without a hard refresh and
      // won't reappear if the user navigates back.
      setRows((rs) => rs.filter((r) => r.id !== target.id))
      // Auto-created a draft contract → open it. Otherwise → the prefilled
      // wizard. Both navigate away, so we keep the busy state.
      if (j.mode === 'created' && j.rentalId) {
        router.push(`/dashboard/location/contrats/${j.rentalId}`)
        return
      }
      if (j.mode === 'needs_wizard') {
        router.push(`/dashboard/location/contrats/nouveau?from_prospect=${target.id}&rdv=1`)
        return
      }
      setError('Réponse inattendue du serveur.')
      setRdvBusy(false)
      setRdvTarget(null)
    } catch {
      setError('Erreur réseau. Réessayez.')
      setRdvBusy(false)
      setRdvTarget(null)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          <Inbox className="w-3.5 h-3.5" /> Location
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">Demandes de location</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Demandes reçues depuis votre catalogue public.
        </p>
      </div>

      {/* Single status filter over the full row set (replaces the 3 tabs).
          Same dropdown on mobile and desktop. Counts shown inline per option. */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrer par statut"
          className="h-10 px-3 rounded-xl text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} ({countByFilter[opt.value] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3"
          style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
          {error}
        </p>
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <Inbox className="w-7 h-7" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {statusFilter === '__all__' ? 'Aucune demande' : 'Aucune demande pour ce filtre'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-visible"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <Th>Client</Th><Th>Véhicule</Th><Th>Motif</Th><Th>Dates</Th><Th>Suivi</Th><Th>Reçu</Th><Th end>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{r.full_name}</div>
                      <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{r.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {r.vehicle
                        ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi>
                        : <span className="text-[var(--text-muted)]">Véhicule non précisé</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ReasonChip r={r} />
                      {r.message && <p className="mt-1.5 text-xs line-clamp-2 max-w-[14rem]" style={{ color: 'var(--text-secondary)' }}>{r.message}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap"><Dates r={r} /></td>
                    <td className="px-4 py-3"><SuiviControl row={r} busy={busyId === r.id} onChange={changeStatus} /></td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">{shortDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {r.status !== 'perdue' && r.status !== 'convertie' && (
                          <>
                            <ChangeVehicleButton onClick={() => setVehicleTarget(r)} />
                            <RdvButton onClick={() => openRdv(r)} />
                          </>
                        )}
                        <ContactButtons phone={r.phone} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visibleRows.map((r) => (
              <div key={r.id} className="rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">{r.full_name}</div>
                    <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{r.phone}</div>
                  </div>
                  <SuiviControl row={r} busy={busyId === r.id} onChange={changeStatus} />
                </div>
                <div><ReasonChip r={r} /></div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <CarIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  {r.vehicle
                    ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi>
                    : <span className="text-[var(--text-muted)]">Véhicule non précisé</span>}
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <CalendarRange className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} /><Dates r={r} />
                </div>
                {r.message && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.message}</p>}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{shortDate(r.created_at)}</span>
                  <div className="flex items-center gap-2">
                    {r.status !== 'perdue' && r.status !== 'convertie' && (
                      <>
                        <ChangeVehicleButton onClick={() => setVehicleTarget(r)} />
                        <RdvButton onClick={() => openRdv(r)} />
                      </>
                    )}
                    <ContactButtons phone={r.phone} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* "RDV planifié" → confirm, then move the prospect into Contrats. */}
      {rdvTarget && (
        <RdvDialog
          row={rdvTarget}
          busy={rdvBusy}
          onClose={() => setRdvTarget(null)}
          onConfirm={confirmRdv}
        />
      )}

      {/* Change-vehicle dialog (Chantier 2) — PATCHes rental_vehicle_id on the prospect. */}
      {vehicleTarget && (
        <ChangeVehicleDialog
          kind="prospect"
          id={vehicleTarget.id}
          currentVehicleId={vehicleTarget.rental_vehicle_id}
          currentVehicleLabel={vehicleTarget.vehicle
            ? `${vehicleTarget.vehicle.marque} ${vehicleTarget.vehicle.modele}${vehicleTarget.vehicle.annee ? ` · ${vehicleTarget.vehicle.annee}` : ''}`
            : null}
          onClose={() => setVehicleTarget(null)}
          onSaved={(result) => {
            const j = result as { prospect?: {
              id: string; rental_vehicle_id: string | null
              rental_vehicle: { marque: string; modele: string; annee: number | null }
                | { marque: string; modele: string; annee: number | null }[]
                | null
            } }
            const p = j?.prospect
            if (!p) { setVehicleTarget(null); return }
            const embed = Array.isArray(p.rental_vehicle) ? p.rental_vehicle[0] : p.rental_vehicle
            const newVehicle = embed
              ? { marque: embed.marque, modele: embed.modele, annee: embed.annee ?? null }
              : null
            setRows((rs) => rs.map((r) => (r.id === p.id
              ? { ...r, rental_vehicle_id: p.rental_vehicle_id, vehicle: newVehicle }
              : r)))
            setVehicleTarget(null)
          }}
        />
      )}
    </div>
  )
}

function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={'px-4 py-2.5 font-semibold ' + (end ? 'text-end' : 'text-start')}>{children}</th>
}

// Colored suivi dropdown — or a solid terminal badge for converted rows.
function SuiviControl({
  row, busy, onChange,
}: {
  row: ProspectRow
  busy: boolean
  onChange: (row: ProspectRow, status: RentalProspectStatus) => void
}) {
  if (row.status === 'convertie') {
    return (
      <div className="space-y-1">
        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border', RENTAL_PROSPECT_SUIVI_BADGE_CLASSES.convertie)}>
          {rentalProspectStatusLabel('convertie')}
        </span>
        {row.contract_number && (
          row.converted_rental_id ? (
            <Link href={`/dashboard/location/contrats/${row.converted_rental_id}`}
              className="block text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline">
              {row.contract_number}
            </Link>
          ) : (
            <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">{row.contract_number}</div>
          )
        )}
      </div>
    )
  }
  const cls = RENTAL_PROSPECT_SUIVI_BADGE_CLASSES[row.status as RentalProspectStatus]
    ?? RENTAL_PROSPECT_SUIVI_BADGE_CLASSES.nouvelle
  return (
    <div className="relative inline-block">
      <select
        value={row.status}
        disabled={busy}
        onChange={(e) => onChange(row, e.target.value as RentalProspectStatus)}
        className={cn(
          'appearance-none cursor-pointer pl-3 pr-7 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60',
          cls,
        )}
      >
        {!RENTAL_PROSPECT_SUIVI_OPTIONS.includes(row.status as RentalProspectStatus) && (
          // Current status isn't a relance option (e.g. a prospect reopened at
          // 'rdv_planifie' after its contract was cancelled) — show it as a
          // disabled leading option so the controlled <select> renders
          // correctly and the user can still move it to a relance status.
          <option value={row.status} disabled>{rentalProspectStatusLabel(row.status)}</option>
        )}
        {RENTAL_PROSPECT_SUIVI_OPTIONS.map((s) => (
          <option key={s} value={s}>{rentalProspectStatusLabel(s)}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-70" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  )
}


// "Changer véhicule" action button (Chantier 2). Secondary visual — accent
// subtle to sit alongside the primary filled-accent RdvButton without
// competing with it. Opens the shared ChangeVehicleDialog.
function ChangeVehicleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Changer véhicule"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
    >
      <CarIcon className="w-3.5 h-3.5" />
      Véhicule
    </button>
  )
}

// Dedicated "RDV planifié" action button (one per row, next to the contact
// buttons). Distinct, filled accent action — opens the confirm modal that
// moves the prospect into Contrats. Label centralized via the status vocab.
function RdvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rentalProspectStatusLabel('rdv_planifie')}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-opacity hover:opacity-90"
      style={{ background: 'var(--accent)' }}
    >
      <CalendarCheck className="w-3.5 h-3.5" />
      {rentalProspectStatusLabel('rdv_planifie')}
    </button>
  )
}

// "RDV planifié" confirmation — confirming MOVES the prospect into Contrats
// (the server auto-creates a draft contract, or the client opens the wizard).
function RdvDialog({
  row, busy, onClose, onConfirm,
}: {
  row: ProspectRow
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirmer le rendez-vous"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Confirmer le rendez-vous</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Confirmer le RDV ? <bdi className="font-medium text-[var(--text-primary)]">{row.full_name}</bdi> passera dans la section Contrats.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
