'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalContractsList — client renderer for the contracts list page.
// ─────────────────────────────────────────────────────────────────────
// Status tabs (from RENTAL_TAB_GROUPS) + per-row quick transitions:
//   draft                      → Réserver (deposit modal) / Reporter / Annuler
//   confirmed                  → Voiture récupérée / Reporter / Annuler
//   active/overdue             → Terminer / Annuler
//   completed/cancelled        → terminal (no actions)
// Plain transitions hit PATCH /api/rental/rentals/[id]; "Réserver" goes through
// the ReserveDialog → POST /reserve (records the deposit then draft→confirmed).
// On success the row's status updates locally so it moves to the right tab.
// Labels + grouping come from the centralized helpers — no hardcoded text.
// Desktop = table; mobile = stacked cards.
// ─────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Flag, XCircle, Loader2, Plus, FileText, Car as CarIcon, User,
  CalendarClock, RotateCcw,
} from 'lucide-react'
import {
  RENTAL_TAB_GROUPS, rentalStatusLabel, rentalStatusColor, formatDZD, formatDateFr,
  RENTAL_FROM_PROSPECT_BADGE, RENTAL_FROM_PROSPECT_TITLE,
  RENTAL_ACTION_RESERVE, RENTAL_ACTION_PICKUP,
} from '@/components/rental/booking/types'
import ContactButtons from '@/components/rental/ContactButtons'
import ReserveDialog from '@/components/rental/ReserveDialog'
import PickupDialog from '@/components/rental/PickupDialog'

type ContractTransition = 'confirmed' | 'active' | 'completed' | 'cancelled' | 'reporter'

export type ContractRow = {
  id:                  string
  contract_number:     string | null
  status:              string
  start_date:          string
  start_time:          string | null
  end_date:            string
  end_time:            string | null
  duration_days:       number
  total_rental_amount: number
  deposit_amount:      number
  created_at:          string
  vehicle:  { marque: string; modele: string; annee: number | null } | null
  customer: { full_name: string; phone: string } | null
  isFromProspect?:     boolean
}

// Small "RDV" pill for contracts that originated from a rental demande.
function RdvBadge() {
  return (
    <span
      title={RENTAL_FROM_PROSPECT_TITLE}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider align-middle"
      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
    >
      <CalendarClock className="w-2.5 h-2.5" />{RENTAL_FROM_PROSPECT_BADGE}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = rentalStatusColor(status)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      {rentalStatusLabel(status)}
    </span>
  )
}

export default function RentalContractsList({ initialRows, canFin, depositMinPercent = 5 }: { initialRows: ContractRow[]; canFin: boolean; depositMinPercent?: number }) {
  const [rows, setRows] = useState<ContractRow[]>(initialRows)
  const [activeKey, setActiveKey] = useState<string>(RENTAL_TAB_GROUPS[0].key) // default = first tab
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null)
  const [reserveTarget, setReserveTarget] = useState<ContractRow | null>(null)
  const [pickupTarget, setPickupTarget] = useState<ContractRow | null>(null)

  const countByKey = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of RENTAL_TAB_GROUPS) {
      m[g.key] = rows.filter((r) => (g.statuses as readonly string[]).includes(r.status)).length
    }
    return m
  }, [rows])

  const activeGroup = RENTAL_TAB_GROUPS.find((g) => g.key === activeKey) ?? RENTAL_TAB_GROUPS[0]
  const visibleRows = rows.filter((r) => (activeGroup.statuses as readonly string[]).includes(r.status))

  async function transition(row: ContractRow, status: ContractTransition, reason?: string) {
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/rental/rentals/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason ? { cancellation_reason: reason } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setError(j?.message ?? j?.error ?? 'Action échouée.')
        return false
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: j.rental.status } : r)))
      return true
    } catch {
      setError('Erreur réseau. Réessayez.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <FileText className="w-3.5 h-3.5" /> Location
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">Contrats</h1>
        </div>
        <Link
          href="/dashboard/location/contrats/nouveau"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white hover:-translate-y-0.5 transition-transform"
          style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
        >
          <Plus className="w-4 h-4" /> Nouvelle location
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RENTAL_TAB_GROUPS.map((g) => {
          const active = g.key === activeKey
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveKey(g.key)}
              aria-current={active ? 'page' : undefined}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
              style={active
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {g.label}
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full tabular-nums"
                style={active
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              >
                {countByKey[g.key] ?? 0}
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

      {/* Empty state */}
      {visibleRows.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <FileText className="w-7 h-7" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Aucun contrat dans « {activeGroup.label} »</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Les contrats apparaîtront ici selon leur statut.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <Th>Contrat</Th><Th>Véhicule</Th><Th>Client</Th><Th>Période</Th>
                  <Th>Total</Th><Th>Caution</Th><Th>Statut</Th><Th end>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/dashboard/location/contrats/${r.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                          <bdi>{r.contract_number ?? 'Voir'}</bdi>
                        </Link>
                        {r.isFromProspect && <RdvBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {r.vehicle ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi> : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {r.customer ? (
                        <span><span className="text-[var(--text-primary)]">{r.customer.full_name}</span><br /><bdi className="text-xs tabular-nums">{r.customer.phone}</bdi></span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                      {formatDateFr(r.start_date)} → {formatDateFr(r.end_date)}<br />
                      <span className="text-[var(--text-muted)]">{r.duration_days} j</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)] tabular-nums"><bdi>{formatDZD(r.total_rental_amount)}</bdi></td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums"><bdi>{formatDZD(r.deposit_amount)}</bdi></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <ContactButtons phone={r.customer?.phone ?? null} />
                        <RowActions row={r} busy={busyId === r.id} canFin={canFin} onTransition={transition} onReserve={() => setReserveTarget(r)} onPickup={() => setPickupTarget(r)} onCancel={() => setCancelTarget(r)} />
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link href={`/dashboard/location/contrats/${r.id}`} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline truncate">
                      <bdi>{r.contract_number ?? 'Voir'}</bdi>
                    </Link>
                    {r.isFromProspect && <RdvBadge />}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <CarIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  {r.vehicle ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi> : '—'}
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  {r.customer ? <span>{r.customer.full_name} · <bdi className="tabular-nums">{r.customer.phone}</bdi></span> : '—'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatDateFr(r.start_date)} → {formatDateFr(r.end_date)} · {r.duration_days} j
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Total <bdi className="font-semibold text-[var(--text-primary)] tabular-nums">{formatDZD(r.total_rental_amount)}</bdi></span>
                  <span style={{ color: 'var(--text-secondary)' }}>Caution <bdi className="tabular-nums">{formatDZD(r.deposit_amount)}</bdi></span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <ContactButtons phone={r.customer?.phone ?? null} />
                  <RowActions row={r} busy={busyId === r.id} canFin={canFin} onTransition={transition} onReserve={() => setReserveTarget(r)} onPickup={() => setPickupTarget(r)} onCancel={() => setCancelTarget(r)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Cancel confirm dialog */}
      {cancelTarget && (
        <CancelDialog
          row={cancelTarget}
          busy={busyId === cancelTarget.id}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            const ok = await transition(cancelTarget, 'cancelled', reason)
            if (ok) setCancelTarget(null)
          }}
        />
      )}

      {/* Reserve (deposit) dialog — draft → confirmed */}
      {reserveTarget && (
        <ReserveDialog
          rentalId={reserveTarget.id}
          contractNumber={reserveTarget.contract_number}
          total={reserveTarget.total_rental_amount}
          depositAmount={reserveTarget.deposit_amount}
          minPercent={depositMinPercent}
          onClose={() => setReserveTarget(null)}
          onReserved={(r) => {
            setRows((prev) => prev.map((row) => (row.id === reserveTarget.id ? { ...row, status: r.rental.status } : row)))
            setReserveTarget(null)
          }}
        />
      )}

      {/* Pickup (settlement) dialog — confirmed → active */}
      {pickupTarget && (
        <PickupDialog
          rentalId={pickupTarget.id}
          contractNumber={pickupTarget.contract_number}
          onClose={() => setPickupTarget(null)}
          onPickedUp={(r) => {
            setRows((prev) => prev.map((row) => (row.id === pickupTarget.id ? { ...row, status: r.rental.status } : row)))
            setPickupTarget(null)
          }}
        />
      )}
    </div>
  )
}

function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={'px-4 py-2.5 font-semibold ' + (end ? 'text-end' : 'text-start')}>{children}</th>
}

function RowActions({
  row, busy, canFin, onTransition, onReserve, onPickup, onCancel,
}: {
  row: ContractRow
  busy: boolean
  canFin: boolean
  onTransition: (row: ContractRow, status: ContractTransition) => void
  onReserve: () => void
  onPickup: () => void
  onCancel: () => void
}) {
  const s = row.status
  const canReserve   = s === 'draft' && canFin                                    // → confirmed (deposit, financial)
  const canPickup    = s === 'confirmed'                                          // → active ("Voiture récupérée")
  const canReprogram = s === 'reporter'                                           // → confirmed (Reprogrammer)
  const canComplete  = s === 'active' || s === 'overdue'                          // → completed
  const canReporter  = s === 'draft' || s === 'confirmed' || s === 'overdue'      // → reporter
  const canCancel    = s !== 'completed' && s !== 'cancelled'                     // → cancelled

  if (!canReserve && !canPickup && !canReprogram && !canComplete && !canReporter && !canCancel) {
    return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
      {canReserve && (
        <ActionBtn onClick={onReserve} disabled={busy} tone="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
          {RENTAL_ACTION_RESERVE}
        </ActionBtn>
      )}
      {canPickup && (
        <ActionBtn onClick={onPickup} disabled={busy} tone="primary" icon={<CarIcon className="w-3.5 h-3.5" />}>
          {RENTAL_ACTION_PICKUP}
        </ActionBtn>
      )}
      {canReprogram && (
        <ActionBtn onClick={() => onTransition(row, 'confirmed')} disabled={busy} tone="primary" icon={<RotateCcw className="w-3.5 h-3.5" />}>
          Reprogrammer
        </ActionBtn>
      )}
      {canComplete && (
        <ActionBtn onClick={() => onTransition(row, 'completed')} disabled={busy} tone="primary" icon={<Flag className="w-3.5 h-3.5" />}>
          Terminer
        </ActionBtn>
      )}
      {canReporter && (
        <ActionBtn onClick={() => onTransition(row, 'reporter')} disabled={busy} tone="neutral" icon={<CalendarClock className="w-3.5 h-3.5" />}>
          Reporter
        </ActionBtn>
      )}
      {canCancel && (
        <ActionBtn onClick={onCancel} disabled={busy} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>
          Annuler
        </ActionBtn>
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

function CancelDialog({
  row, busy, onClose, onConfirm,
}: {
  row: ContractRow
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Annuler le contrat"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Annuler le contrat</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <bdi>{row.contract_number ?? 'Ce contrat'}</bdi> sera marqué « {rentalStatusLabel('cancelled')} ». Cette action est définitive.
        </p>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mt-4 mb-1.5">Motif (optionnel)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Raison de l'annulation…"
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#e11d48' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Confirmer l&apos;annulation
          </button>
        </div>
      </div>
    </div>
  )
}
