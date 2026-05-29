'use client'
// ─────────────────────────────────────────────────────────────────────
// ContractExpandPanel — the body revealed when a contract row is expanded
// (Chantier 2 step 2). Shows client + vehicle + period always; the finance
// summary + payment history (with 📎 receipt links) + a "Changer véhicule"
// shortcut only for financial viewers. All money math goes through the
// shared computeRentalFinance helper.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Car as CarIcon, User, CalendarRange, Banknote, Receipt, History,
  FilePlus, Tag, ShieldCheck, CalendarClock, Repeat, Calendar, Wallet, XCircle, FileText,
  type LucideIcon,
} from 'lucide-react'
import { formatDZD, formatDateFr } from '@/components/rental/booking/types'
import { computeRentalFinance } from '@/lib/rental/finance'
import { rentalPaymentTypeLabel, rentalPaymentMethodLabel } from '@/lib/rental/payments'
import ContactButtons from '@/components/rental/ContactButtons'
import ReceiptLink from '@/components/rental/ReceiptLink'
import DownloadContractButton from '@/components/rental/DownloadContractButton'
import type { ActivityRow, ContractRow } from '@/components/rental/RentalContractsList'

const VEHICLE_CHANGEABLE = new Set(['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter', 'confirmed'])

export default function ContractExpandPanel({
  row, canFin, onChangeVehicle,
}: {
  row:             ContractRow
  canFin:          boolean
  onChangeVehicle: () => void
}) {
  const canChangeVehicle = VEHICLE_CHANGEABLE.has(row.status)
  const startT = (row.start_time ?? '').slice(0, 5)
  const endT   = (row.end_time ?? '').slice(0, 5)

  return (
    <div className="px-4 py-4 sm:px-6" style={{ background: 'var(--bg-elevated)' }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Client */}
        <Block icon={<User className="w-3.5 h-3.5" />} title="Client">
          <div className="text-sm font-medium text-[var(--text-primary)]">{row.customer?.full_name ?? '—'}</div>
          {row.customer?.phone && (
            <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{row.customer.phone}</div>
          )}
          {row.customer?.phone && (
            <div className="mt-2"><ContactButtons phone={row.customer.phone} /></div>
          )}
        </Block>

        {/* Véhicule */}
        <Block icon={<CarIcon className="w-3.5 h-3.5" />} title="Véhicule">
          <div className="text-sm text-[var(--text-primary)]">
            {row.vehicle ? <bdi>{row.vehicle.marque} {row.vehicle.modele}{row.vehicle.annee ? ` · ${row.vehicle.annee}` : ''}</bdi> : '—'}
          </div>
          {row.vehicle?.immatriculation && (
            <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{row.vehicle.immatriculation}</div>
          )}
          {canChangeVehicle && (
            <button
              type="button"
              onClick={onChangeVehicle}
              className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              <CarIcon className="w-3.5 h-3.5" /> Changer véhicule
            </button>
          )}
        </Block>

        {/* Période */}
        <Block icon={<CalendarRange className="w-3.5 h-3.5" />} title="Période">
          <div className="text-sm text-[var(--text-primary)]">
            {formatDateFr(row.start_date)} → {formatDateFr(row.end_date)}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {row.duration_days} jour{row.duration_days > 1 ? 's' : ''}
            {(startT || endT) ? ` · ${startT} → ${endT}` : ''}
          </div>
        </Block>
      </div>

      {canFin ? (
        <>
          <FinanceAndPayments row={row} />
          <ActivityTimeline activities={row.activities} />
        </>
      ) : (
        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Détails financiers réservés au gérant.
        </p>
      )}

      {/* PDF download — every status / every role that can view the contract. */}
      <div className="mt-4">
        <DownloadContractButton rentalId={row.id} contractNumber={row.contract_number} variant="subtle" />
      </div>
    </div>
  )
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>{title}
      </p>
      {children}
    </div>
  )
}

function FinanceAndPayments({ row }: { row: ContractRow }) {
  const payments = row.payments ?? []
  const f = computeRentalFinance({ total: row.total_rental_amount, deposit: row.deposit_amount, payments })

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Résumé financier */}
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          <Banknote className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Résumé financier
        </p>
        <FinLine label="Loyer — total">{formatDZD(f.totalLoyer)}</FinLine>
        <FinLine label="Loyer — payé">{formatDZD(f.payeLoyer)}</FinLine>
        <FinLine label="Loyer — restant" tone={f.resteLoyer > 0 ? 'amber' : 'emerald'}>{formatDZD(f.resteLoyer)}</FinLine>
        <div className="my-1.5 border-t" style={{ borderColor: 'var(--border)' }} />
        <FinLine label="Caution — requise">{formatDZD(f.cautionAttendue)}</FinLine>
        <FinLine label="Caution — perçue">{formatDZD(f.cautionPercue)}</FinLine>
        <FinLine label="Caution — restante" tone={f.cautionRestante > 0 ? 'amber' : 'emerald'}>{formatDZD(f.cautionRestante)}</FinLine>
        {f.totalFrais > 0 && (
          <>
            <div className="my-1.5 border-t" style={{ borderColor: 'var(--border)' }} />
            <FinLine label="Frais supplémentaires">{formatDZD(f.totalFrais)}</FinLine>
          </>
        )}
      </div>

      {/* Historique des paiements */}
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          <Receipt className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Historique des paiements
        </p>
        {payments.length === 0 ? (
          <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Aucun paiement enregistré.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((p, i) => (
              <li key={p.id ?? `${p.created_at}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="text-[var(--text-primary)]">{rentalPaymentTypeLabel(p.type)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' · '}{rentalPaymentMethodLabel(p.method)}{' · '}{formatDateFr(p.created_at)}{p.reference ? ` · ${p.reference}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <bdi className="tabular-nums" style={{ color: p.type === 'refund' ? '#fb7185' : 'var(--text-primary)' }}>
                    {p.type === 'refund' ? '− ' : ''}{formatDZD(p.amount)}
                  </bdi>
                  {p.receipt_url && <ReceiptLink path={p.receipt_url} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FinLine({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'amber' | 'emerald' }) {
  const color = tone === 'amber' ? '#fbbf24' : tone === 'emerald' ? '#10b981' : 'var(--text-primary)'
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <bdi className="tabular-nums font-semibold" style={{ color }}>{children}</bdi>
    </div>
  )
}

// ── Activity timeline (Chantier 3) ────────────────────────────────────
// Per-type icon + tint. Tints mirror RENTAL_STATUS_COLORS (active=emerald,
// reporter=violet, cancelled=rose, confirmed=blue, overdue=amber) so the log
// reads with the same palette as the status badges. Types without a tint
// (created / status_change / vehicle_changed / dates_changed) fall back to
// the neutral accent.
const ACTIVITY_ICON: Record<string, LucideIcon> = {
  created:         FilePlus,
  status_change:   Tag,
  reserved:        ShieldCheck,
  picked_up:       CarIcon,
  reported:        CalendarClock,
  vehicle_changed: Repeat,
  dates_changed:   Calendar,
  payment:         Wallet,
  cancelled:       XCircle,
}
const ACTIVITY_TINT: Record<string, { bg: string; fg: string }> = {
  reserved:  { bg: 'rgba(16,185,129,0.14)', fg: '#10b981' },
  reported:  { bg: 'rgba(168,85,247,0.14)', fg: '#c084fc' },
  cancelled: { bg: 'rgba(244,63,94,0.14)',  fg: '#fb7185' },
  picked_up: { bg: 'rgba(59,130,246,0.14)', fg: '#60a5fa' },
  payment:   { bg: 'rgba(245,158,11,0.14)', fg: '#fbbf24' },
}
const ACTIVITY_CAP = 20

// created_at is a UTC timestamptz. Render the Algiers wall-clock (UTC+1, no
// DST — same convention as lib/rental/agenda.ts): shift +1h then format the
// date via the shared formatDateFr + append HH:MM. Derived from the ISO
// string (not the runtime TZ) so SSR and the client agree (no hydration drift).
function formatActivityWhen(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return formatDateFr(ts.slice(0, 10))
  const algiers = new Date(d.getTime() + 60 * 60 * 1000).toISOString()
  return `${formatDateFr(algiers.slice(0, 10))} ${algiers.slice(11, 16)}`
}

function ActivityTimeline({ activities }: { activities?: ActivityRow[] }) {
  const [showAll, setShowAll] = useState(false)
  const items = activities ?? []
  const shown = showAll ? items : items.slice(0, ACTIVITY_CAP)

  return (
    <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        <History className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Historique d&apos;activité
      </p>
      {items.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Aucune activité enregistrée.</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((a) => <ActivityLine key={a.id} a={a} />)}
          </ul>
          {items.length > ACTIVITY_CAP && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              {showAll ? 'Voir moins' : `Voir plus (${items.length - ACTIVITY_CAP})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ActivityLine({ a }: { a: ActivityRow }) {
  const Icon = ACTIVITY_ICON[a.type] ?? FileText
  const tint = ACTIVITY_TINT[a.type] ?? { bg: 'var(--accent-subtle)', fg: 'var(--accent)' }
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0 mt-0.5"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--text-primary)] break-words">{a.title}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          par {a.actor?.full_name ?? 'Système'} · {formatActivityWhen(a.created_at)}
        </p>
        {a.body && (
          <p className="text-[11px] mt-0.5 break-words" style={{ color: 'var(--text-secondary)' }}>{a.body}</p>
        )}
      </div>
    </li>
  )
}
