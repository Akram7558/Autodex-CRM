'use client'
// ─────────────────────────────────────────────────────────────────────
// ContractExpandPanel — the body revealed when a contract row is expanded
// (Chantier 2 step 2). Shows client + vehicle + period always; the finance
// summary + payment history (with 📎 receipt links) + a "Changer véhicule"
// shortcut only for financial viewers. All money math goes through the
// shared computeRentalFinance helper.
// ─────────────────────────────────────────────────────────────────────

import { Car as CarIcon, User, CalendarRange, Banknote, Receipt } from 'lucide-react'
import { formatDZD, formatDateFr } from '@/components/rental/booking/types'
import { computeRentalFinance } from '@/lib/rental/finance'
import { rentalPaymentTypeLabel, rentalPaymentMethodLabel } from '@/lib/rental/payments'
import ContactButtons from '@/components/rental/ContactButtons'
import ReceiptLink from '@/components/rental/ReceiptLink'
import type { ContractRow } from '@/components/rental/RentalContractsList'

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
        <FinanceAndPayments row={row} />
      ) : (
        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Détails financiers réservés au gérant.
        </p>
      )}
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
