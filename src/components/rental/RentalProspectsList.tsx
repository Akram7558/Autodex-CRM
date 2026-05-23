'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalProspectsList — dashboard pipeline for public rental requests.
// ─────────────────────────────────────────────────────────────────────
// Status tabs (from RENTAL_PROSPECT_STATUSES) + per-row transitions:
//   nouvelle  → Marquer contactée / Marquer perdue
//   contactee → Convertir en contrat (DISABLED — chunk D) / Marquer perdue
//   perdue    → Rouvrir
//   convertie → terminal (shows the linked contract number when available)
// Transitions hit PATCH /api/rental/prospects/[id]; the row updates
// locally and moves to the right tab. Reason is the key business signal —
// shown as a prominent colored chip. Labels come from the shared helpers
// (no hardcoded French). Desktop = table; mobile = stacked cards.
// ─────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  Phone, MessageCircle, Car as CarIcon, CalendarRange, Loader2,
  CheckCircle2, XCircle, RotateCcw, FileSignature, Inbox,
} from 'lucide-react'
import {
  RENTAL_PROSPECT_STATUSES, rentalProspectReasonLabel,
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
const STATUS_COLORS: Record<string, { bg: string; fg: string; ring: string }> = {
  nouvelle:  { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa', ring: 'rgba(59,130,246,0.35)' },
  contactee: { bg: 'rgba(245,158,11,0.14)', fg: '#fbbf24', ring: 'rgba(245,158,11,0.40)' },
  convertie: { bg: 'rgba(16,185,129,0.14)', fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  perdue:    { bg: 'rgba(244,63,94,0.12)',  fg: '#fb7185', ring: 'rgba(244,63,94,0.40)' },
}

function digitsOnly(p: string): string { return (p ?? '').replace(/\D/g, '') }
function shortDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d)
}
function reasonText(r: ProspectRow): string {
  return r.reason === 'autre' && r.reason_other ? r.reason_other : rentalProspectReasonLabel(r.reason)
}
function ReasonChip({ r }: { r: ProspectRow }) {
  const c = REASON_COLORS[r.reason] ?? REASON_COLORS.autre
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      {reasonText(r)}
    </span>
  )
}
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.nouvelle
  const label = RENTAL_PROSPECT_STATUSES.find((x) => x.code === status)?.label ?? status
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      {label}
    </span>
  )
}
function Dates({ r }: { r: ProspectRow }) {
  if (!r.desired_start_date && !r.desired_end_date) {
    return <span className="text-[var(--text-muted)]">Dates non précisées</span>
  }
  return <span>{formatDateFr(r.desired_start_date ?? '')} → {formatDateFr(r.desired_end_date ?? '')}</span>
}

export default function RentalProspectsList({ initialRows }: { initialRows: ProspectRow[] }) {
  const [rows, setRows] = useState<ProspectRow[]>(initialRows)
  const [activeStatus, setActiveStatus] = useState<string>('nouvelle')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of RENTAL_PROSPECT_STATUSES) m[s.code] = rows.filter((r) => r.status === s.code).length
    return m
  }, [rows])

  const visibleRows = rows.filter((r) => r.status === activeStatus)

  async function transition(row: ProspectRow, status: 'nouvelle' | 'contactee' | 'perdue') {
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
        setError(j?.message ?? j?.error ?? 'Action échouée.')
        return
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: j.prospect.status } : r)))
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setBusyId(null)
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

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RENTAL_PROSPECT_STATUSES.map((s) => {
          const active = s.code === activeStatus
          return (
            <button
              key={s.code}
              type="button"
              onClick={() => setActiveStatus(s.code)}
              aria-current={active ? 'page' : undefined}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
              style={active
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {s.label}
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full tabular-nums"
                style={active
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              >
                {countByStatus[s.code] ?? 0}
              </span>
            </button>
          )
        })}
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
          <p className="text-sm font-medium text-[var(--text-primary)]">Aucune demande dans cette catégorie</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <Th>Client</Th><Th>Véhicule</Th><Th>Dates</Th><Th>Motif</Th><Th>Reçu</Th><Th>Statut</Th><Th end>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{r.full_name}</div>
                      <PhoneLink phone={r.phone} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {r.vehicle
                        ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi>
                        : <span className="text-[var(--text-muted)]">Véhicule non précisé</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap"><Dates r={r} /></td>
                    <td className="px-4 py-3">
                      <ReasonChip r={r} />
                      {r.message && (
                        <p className="mt-1.5 text-xs line-clamp-2 max-w-[16rem]" style={{ color: 'var(--text-secondary)' }}>{r.message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">{shortDateTime(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.status === 'convertie' && r.contract_number && (
                        <div className="mt-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">{r.contract_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><div className="flex justify-end"><RowActions row={r} busy={busyId === r.id} onTransition={transition} /></div></td>
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
                    <PhoneLink phone={r.phone} />
                  </div>
                  <StatusBadge status={r.status} />
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
                {r.status === 'convertie' && r.contract_number && (
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">Contrat {r.contract_number}</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{shortDateTime(r.created_at)}</span>
                  <RowActions row={r} busy={busyId === r.id} onTransition={transition} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={'px-4 py-2.5 font-semibold ' + (end ? 'text-end' : 'text-start')}>{children}</th>
}

function PhoneLink({ phone }: { phone: string }) {
  const digits = digitsOnly(phone)
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs tabular-nums hover:text-emerald-600 dark:hover:text-emerald-400"
      style={{ color: 'var(--text-secondary)' }}
    >
      <Phone className="w-3 h-3" /> <bdi>{phone}</bdi>
    </a>
  )
}

function RowActions({
  row, busy, onTransition,
}: {
  row: ProspectRow
  busy: boolean
  onTransition: (row: ProspectRow, status: 'nouvelle' | 'contactee' | 'perdue') => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 justify-end">
      {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}

      {row.status === 'nouvelle' && (
        <>
          <ActionBtn onClick={() => onTransition(row, 'contactee')} disabled={busy} tone="primary" icon={<MessageCircle className="w-3.5 h-3.5" />}>
            Marquer contactée
          </ActionBtn>
          <ActionBtn onClick={() => onTransition(row, 'perdue')} disabled={busy} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>
            Perdue
          </ActionBtn>
        </>
      )}

      {row.status === 'contactee' && (
        <>
          {/* Conversion is wired in chunk D. */}
          <span title="Bientôt (chunk D)">
            <ActionBtn onClick={() => {}} disabled tone="primary" icon={<FileSignature className="w-3.5 h-3.5" />}>
              Convertir en contrat
            </ActionBtn>
          </span>
          <ActionBtn onClick={() => onTransition(row, 'perdue')} disabled={busy} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>
            Perdue
          </ActionBtn>
        </>
      )}

      {row.status === 'perdue' && (
        <ActionBtn onClick={() => onTransition(row, 'nouvelle')} disabled={busy} tone="neutral" icon={<RotateCcw className="w-3.5 h-3.5" />}>
          Rouvrir
        </ActionBtn>
      )}

      {row.status === 'convertie' && (
        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#10b981' }}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Convertie
        </span>
      )}
    </div>
  )
}

function ActionBtn({
  children, onClick, disabled, tone, icon,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone: 'primary' | 'danger' | 'neutral'
  icon: React.ReactNode
}) {
  const style =
    tone === 'primary' ? { background: 'var(--accent-subtle)', color: 'var(--accent)' } :
    tone === 'danger'  ? { background: 'rgba(244,63,94,0.12)', color: '#fb7185' } :
                         { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity"
      style={style}
    >
      {icon}{children}
    </button>
  )
}
