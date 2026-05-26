'use client'
// ─────────────────────────────────────────────────────────────────────
// ContractDetail — full rental contract view + edit + payments.
// ─────────────────────────────────────────────────────────────────────
// Sections: header (status badge + actions), client, véhicule, période,
// financier (canFin only), signature, notes/cancellation, and payments
// (canFin only — list + add form). Status actions and edits both hit the
// extended PATCH /api/rental/rentals/[id]; payments POST /api/rental/payments.
// Money is shown only to owner/manager/super_admin (rental financial guard).
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, MessageCircle, Car as CarIcon, CalendarRange, User,
  CheckCircle2, Flag, XCircle, Pencil, Loader2, PenLine,
  Banknote, Plus, FileSignature, CalendarClock, RotateCcw,
} from 'lucide-react'
import PhotoLightbox from '@/components/ui/PhotoLightbox'
import {
  rentalStatusLabel, rentalStatusColor, formatDZD, toNum,
  RENTAL_ACTION_RESERVE, RENTAL_ACTION_PICKUP,
} from '@/components/rental/booking/types'
import ReserveDialog from '@/components/rental/ReserveDialog'

type ContractTransition = 'confirmed' | 'active' | 'completed' | 'cancelled' | 'reporter'
import { rentalFormatPhoneIntl } from '@/lib/rental/prospects'
import {
  RENTAL_PAYMENT_TYPES, RENTAL_PAYMENT_METHODS,
  rentalPaymentTypeLabel, rentalPaymentMethodLabel, isExtraFeeType,
} from '@/lib/rental/payments'

export type ContractPayment = {
  id: string
  type: string
  amount: number
  method: string
  reference: string | null
  notes: string | null
  receipt_url: string | null   // private storage path; null for cash
  created_at: string
}

/**
 * Open a payment receipt: resolves the private storage path to a 1h signed
 * URL via /api/rental/uploads/read, then opens it in a new tab. Silent on
 * failure (we don't block the page on a flaky signed URL).
 */
async function openReceiptPath(path: string): Promise<void> {
  try {
    const res = await fetch(`/api/rental/uploads/read?path=${encodeURIComponent(path)}`)
    const j = await res.json().catch(() => ({}))
    if (res.ok && j?.url) window.open(j.url, '_blank', 'noopener,noreferrer')
  } catch { /* ignore */ }
}

export type ContractDetailData = {
  id: string
  contract_number: string | null
  status: string
  start_date: string; start_time: string
  end_date: string;   end_time: string
  duration_days: number
  daily_rate_snapshot: number
  total_rental_amount: number
  deposit_amount: number
  notes: string | null
  cancellation_reason: string | null
  signed_at: string | null
  signatureUrl: string | null
  rental_vehicle_id: string
  vehicle: { marque: string; modele: string; annee: number | null; immatriculation: string; daily_rate: number; photos: string[] } | null
  customer: { full_name: string; phone: string; cin_number: string | null; permis_number: string | null; permis_expiry: string | null } | null
  payments: ContractPayment[]
}

type VehicleOpt = { id: string; marque: string; modele: string; annee: number | null; immatriculation: string }

function fmtDate(d: string): string {
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d)
  return Number.isNaN(dt.getTime()) ? d : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(dt)
}

export default function ContractDetail({ data, canFin, depositMinPercent = 5 }: { data: ContractDetailData; canFin: boolean; depositMinPercent?: number }) {
  const router = useRouter()
  const [d, setD] = useState<ContractDetailData>(data)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)

  const sc = rentalStatusColor(d.status)
  const phone = d.customer ? rentalFormatPhoneIntl(d.customer.phone) : null
  const canReserve   = d.status === 'draft' && canFin   // Réserver records the deposit → financial only
  const canPickup    = d.status === 'confirmed'         // "Voiture récupérée" → active
  const canReprogram = d.status === 'reporter'
  const canComplete  = d.status === 'active' || d.status === 'overdue'
  const canReporter  = d.status === 'draft' || d.status === 'confirmed' || d.status === 'overdue'
  const canCancel    = d.status !== 'completed' && d.status !== 'cancelled'

  async function transition(status: ContractTransition, cancellation_reason?: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/rental/rentals/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(cancellation_reason ? { cancellation_reason } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) { setError(j?.message ?? j?.error ?? 'Action échouée.'); return }
      setD((cur) => ({ ...cur, status: j.rental.status, cancellation_reason: j.rental.cancellation_reason ?? cur.cancellation_reason }))
      router.refresh()
    } catch { setError('Erreur réseau.') } finally { setBusy(false) }
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/location/contrats"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }} aria-label="Retour aux contrats">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Location · Contrat
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            <bdi>{d.contract_number ?? '—'}</bdi>
          </h1>
        </div>
        <span className="ms-auto inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
          style={{ background: sc.bg, color: sc.fg, boxShadow: `inset 0 0 0 1px ${sc.ring}` }}>
          {rentalStatusLabel(d.status)}
        </span>
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>{error}</p>
      )}

      {/* Status actions + edit */}
      <div className="flex flex-wrap items-center gap-2">
        {canReserve && (
          <Action onClick={() => setReserveOpen(true)} busy={busy} tone="primary" icon={<CheckCircle2 className="w-4 h-4" />}>{RENTAL_ACTION_RESERVE}</Action>
        )}
        {canPickup && (
          <Action onClick={() => transition('active')} busy={busy} tone="primary" icon={<CarIcon className="w-4 h-4" />}>{RENTAL_ACTION_PICKUP}</Action>
        )}
        {canReprogram && (
          <Action onClick={() => transition('confirmed')} busy={busy} tone="primary" icon={<RotateCcw className="w-4 h-4" />}>Reprogrammer</Action>
        )}
        {canComplete && (
          <Action onClick={() => transition('completed')} busy={busy} tone="primary" icon={<Flag className="w-4 h-4" />}>Terminer</Action>
        )}
        {canReporter && (
          <Action onClick={() => transition('reporter')} busy={busy} tone="neutral" icon={<CalendarClock className="w-4 h-4" />}>Reporter</Action>
        )}
        {canCancel && (
          <CancelControl busy={busy} onConfirm={(reason) => transition('cancelled', reason)} />
        )}
        <button type="button" onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <Pencil className="w-3.5 h-3.5" /> {editing ? 'Fermer' : 'Modifier'}
        </button>
      </div>

      {/* Edit panel */}
      {editing && (
        <EditPanel data={d} canFin={canFin} onClose={() => setEditing(false)}
          onSaved={(patch) => { setD((cur) => ({ ...cur, ...patch })); setEditing(false); router.refresh() }} />
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client */}
        <Card title="Client" icon={<User className="w-4 h-4" />}>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{d.customer?.full_name ?? '—'}</div>
          {phone && (
            <div className="flex items-center gap-2 mt-1.5">
              <a href={`tel:${phone.tel}`} className="inline-flex items-center gap-1 text-xs px-2 h-7 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                <Phone className="w-3 h-3" /> Appeler
              </a>
              <a href={`https://wa.me/${phone.wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2 h-7 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{d.customer?.phone}</span>
            </div>
          )}
          {(d.customer?.cin_number || d.customer?.permis_number) && (
            <div className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              {d.customer?.cin_number && <div>CIN : <span className="tabular-nums">{d.customer.cin_number}</span></div>}
              {d.customer?.permis_number && <div>Permis : <span className="tabular-nums">{d.customer.permis_number}</span>{d.customer.permis_expiry ? ` · exp. ${fmtDate(d.customer.permis_expiry)}` : ''}</div>}
            </div>
          )}
        </Card>

        {/* Véhicule */}
        <Card title="Véhicule" icon={<CarIcon className="w-4 h-4" />}>
          <div className="flex items-center gap-3">
            {d.vehicle?.photos?.length ? (
              <button type="button" onClick={() => setLightboxOpen(true)} className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" aria-label="Agrandir">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.vehicle.photos[0]} alt="" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                <CarIcon className="w-7 h-7" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {d.vehicle ? <bdi>{d.vehicle.marque} {d.vehicle.modele}{d.vehicle.annee ? ` · ${d.vehicle.annee}` : ''}</bdi> : '—'}
              </div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.vehicle?.immatriculation}</div>
              {canFin && d.vehicle && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDZD(d.vehicle.daily_rate)} / jour</div>}
            </div>
          </div>
        </Card>

        {/* Période */}
        <Card title="Période" icon={<CalendarRange className="w-4 h-4" />}>
          <div className="text-sm text-[var(--text-primary)]">
            {fmtDate(d.start_date)} <span className="text-[var(--text-muted)] tabular-nums">{d.start_time?.slice(0, 5)}</span>
            {' → '}
            {fmtDate(d.end_date)} <span className="text-[var(--text-muted)] tabular-nums">{d.end_time?.slice(0, 5)}</span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{d.duration_days} jour{d.duration_days > 1 ? 's' : ''}</div>
        </Card>

        {/* Financier (canFin only) */}
        {canFin && (
          <Card title="Financier" icon={<Banknote className="w-4 h-4" />}>
            <Line label="Tarif/jour (snapshot)">{formatDZD(d.daily_rate_snapshot)}</Line>
            <Line label="Total location" strong>{formatDZD(d.total_rental_amount)}</Line>
            <Line label="Caution">{formatDZD(d.deposit_amount)}</Line>
          </Card>
        )}

        {/* Signature */}
        <Card title="Signature" icon={<PenLine className="w-4 h-4" />}>
          {d.signatureUrl ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.signatureUrl} alt="Signature" className="max-h-28 rounded-lg bg-white" />
              {d.signed_at && <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Signé le {fmtDate(d.signed_at)}</div>}
            </div>
          ) : (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Non signé</span>
          )}
        </Card>

        {/* Notes / cancellation */}
        {(d.notes || d.cancellation_reason) && (
          <Card title="Notes" icon={<FileSignature className="w-4 h-4" />}>
            {d.notes && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{d.notes}</p>}
            {d.cancellation_reason && (
              <p className="text-sm mt-2" style={{ color: '#fb7185' }}>Annulation : {d.cancellation_reason}</p>
            )}
          </Card>
        )}
      </div>

      {/* Payments (canFin only) */}
      {canFin && (
        <PaymentsSection
          rentalId={d.id}
          payments={d.payments}
          total={d.total_rental_amount}
          deposit={d.deposit_amount}
          onAdded={(p) => setD((cur) => ({ ...cur, payments: [p, ...cur.payments] }))}
        />
      )}

      {reserveOpen && (
        <ReserveDialog
          rentalId={d.id}
          contractNumber={d.contract_number}
          total={d.total_rental_amount}
          depositAmount={d.deposit_amount}
          minPercent={depositMinPercent}
          onClose={() => setReserveOpen(false)}
          onReserved={(r) => {
            setReserveOpen(false)
            setD((cur) => ({
              ...cur,
              status: r.rental.status,
              payments: [{ ...r.payment, amount: toNum(r.payment.amount) }, ...cur.payments],
            }))
            router.refresh()
          }}
        />
      )}

      {d.vehicle?.photos?.length ? (
        <PhotoLightbox open={lightboxOpen} photos={d.vehicle.photos} startIndex={0} onClose={() => setLightboxOpen(false)} alt={`${d.vehicle.marque} ${d.vehicle.modele}`} />
      ) : null}
    </div>
  )
}

// ─── Layout atoms ───────────────────────────────────────────────────
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>{title}
      </div>
      {children}
    </div>
  )
}
function Line({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className={strong ? 'font-bold tabular-nums' : 'tabular-nums'} style={{ color: 'var(--text-primary)' }}><bdi>{children}</bdi></span>
    </div>
  )
}

function SummaryBox({
  label, value, highlight, badge,
}: {
  label: string
  value: string
  highlight?: boolean
  badge?: { label: string; bg: string; fg: string }
}) {
  return (
    <div className="rounded-xl p-3"
      style={highlight
        ? { background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }
        : { background: 'var(--bg-elevated)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
        <bdi>{value}</bdi>
      </p>
      {badge && (
        <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
          style={{ background: badge.bg, color: badge.fg }}>{badge.label}</span>
      )}
    </div>
  )
}
function Action({ children, onClick, busy, tone, icon }: { children: React.ReactNode; onClick: () => void; busy: boolean; tone: 'primary' | 'danger' | 'neutral'; icon: React.ReactNode }) {
  const style =
    tone === 'primary' ? { background: 'var(--accent-subtle)', color: 'var(--accent)' } :
    tone === 'danger'  ? { background: 'rgba(244,63,94,0.12)', color: '#fb7185' } :
                         { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50" style={style}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}{children}
    </button>
  )
}

function CancelControl({ busy, onConfirm }: { busy: boolean; onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open) {
    return <Action onClick={() => setOpen(true)} busy={busy} tone="danger" icon={<XCircle className="w-4 h-4" />}>Annuler</Action>
  }
  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (optionnel)"
        className="h-9 px-3 rounded-lg text-sm flex-1 min-w-40" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      <button type="button" disabled={busy} onClick={() => onConfirm(reason.trim())}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#e11d48' }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Confirmer
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Retour</button>
    </div>
  )
}

// ─── Edit panel ─────────────────────────────────────────────────────
function EditPanel({
  data, canFin, onClose, onSaved,
}: {
  data: ContractDetailData
  canFin: boolean
  onClose: () => void
  onSaved: (patch: Partial<ContractDetailData>) => void
}) {
  const [notes, setNotes] = useState(data.notes ?? '')
  const [startDate, setStartDate] = useState(data.start_date)
  const [startTime, setStartTime] = useState(data.start_time?.slice(0, 5) ?? '09:00')
  const [endDate, setEndDate] = useState(data.end_date)
  const [endTime, setEndTime] = useState(data.end_time?.slice(0, 5) ?? '18:00')
  const [vehicleId, setVehicleId] = useState(data.rental_vehicle_id)
  const [deposit, setDeposit] = useState(String(data.deposit_amount))
  const [total, setTotal] = useState(String(data.total_rental_amount))
  const [daily, setDaily] = useState(String(data.daily_rate_snapshot))
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Lazy-load active vehicles for the picker.
  useState(() => {
    fetch('/api/rental/vehicles?is_active=true')
      .then((r) => r.json()).then((j) => setVehicles((j.vehicles ?? []) as VehicleOpt[]))
      .catch(() => {})
    return undefined
  })

  async function save() {
    setBusy(true); setErr(null)
    const body: Record<string, unknown> = {}
    if (notes !== (data.notes ?? '')) body.notes = notes
    if (startDate !== data.start_date) body.start_date = startDate
    if (endDate !== data.end_date) body.end_date = endDate
    if (startTime !== data.start_time?.slice(0, 5)) body.start_time = startTime
    if (endTime !== data.end_time?.slice(0, 5)) body.end_time = endTime
    if (vehicleId !== data.rental_vehicle_id) body.rental_vehicle_id = vehicleId
    if (canFin) {
      if (toNum(deposit) !== data.deposit_amount) body.deposit_amount = toNum(deposit)
      if (toNum(total) !== data.total_rental_amount) body.total_rental_amount = toNum(total)
      if (toNum(daily) !== data.daily_rate_snapshot) body.daily_rate_snapshot = toNum(daily)
    }
    if (Object.keys(body).length === 0) { onClose(); return }
    try {
      const res = await fetch(`/api/rental/rentals/${data.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) { setErr(j?.message ?? j?.error ?? 'Enregistrement échoué.'); setBusy(false); return }
      const r = j.rental
      onSaved({
        notes: r.notes ?? null,
        start_date: r.start_date, start_time: r.start_time, end_date: r.end_date, end_time: r.end_time,
        duration_days: toNum(r.duration_days), rental_vehicle_id: r.rental_vehicle_id,
        daily_rate_snapshot: toNum(r.daily_rate_snapshot), total_rental_amount: toNum(r.total_rental_amount), deposit_amount: toNum(r.deposit_amount),
      })
    } catch { setErr('Erreur réseau.'); setBusy(false) }
  }

  const input = 'w-full h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface)', border: '1.5px solid var(--accent)' }}>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Modifier le contrat</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Véhicule">
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={input} style={inputStyle}>
            {!vehicles.some((v) => v.id === vehicleId) && (
              <option value={vehicleId}>{data.vehicle ? `${data.vehicle.marque} ${data.vehicle.modele}` : 'Véhicule actuel'}</option>
            )}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ''} — {v.immatriculation}</option>
            ))}
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Début"><div className="flex gap-2"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} style={inputStyle} /><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-28 h-10 px-3 rounded-lg text-sm" style={inputStyle} /></div></Field>
        <Field label="Fin"><div className="flex gap-2"><input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={input} style={inputStyle} /><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28 h-10 px-3 rounded-lg text-sm" style={inputStyle} /></div></Field>
        {canFin && <Field label="Tarif/jour (DZD)"><input type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} className={input} style={inputStyle} /></Field>}
        {canFin && <Field label="Total (DZD)"><input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className={input} style={inputStyle} /></Field>}
        {canFin && <Field label="Caution (DZD)"><input type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} className={input} style={inputStyle} /></Field>}
      </div>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inputStyle} />
      </Field>
      {err && <p className="text-xs" style={{ color: '#fb7185' }}>{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Annuler</button>
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Enregistrer
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Payments ───────────────────────────────────────────────────────
function PaymentsSection({
  rentalId, payments, total, deposit, onAdded,
}: {
  rentalId: string
  payments: ContractPayment[]
  total: number
  deposit: number
  onAdded: (p: ContractPayment) => void
}) {
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState('rental_payment')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // ── Finance categories (correct math) ───────────────────────────
  // LOYER (rent) — only 'rental_payment' counts against the rental total.
  const totalLoyer = toNum(total)
  const payeLoyer  = payments.filter((p) => p.type === 'rental_payment').reduce((a, p) => a + toNum(p.amount), 0)
  const resteLoyer = Math.max(0, totalLoyer - payeLoyer)

  // FRAIS (additional revenue) — extra_charge/km_excess/late_fee/damage_fee/fuel_charge.
  const fraisLines = payments.filter((p) => isExtraFeeType(p.type))
  const totalFrais = fraisLines.reduce((a, p) => a + toNum(p.amount), 0)

  // CAUTION (held money, NOT revenue). Refunds are counted here as "Rendue"
  // (deposit returned) and are NOT subtracted from loyer/frais — single
  // place to avoid double-counting.
  const cautionAttendue = toNum(deposit)
  const cautionPercue   = payments.filter((p) => p.type === 'deposit').reduce((a, p) => a + toNum(p.amount), 0)
  const cautionRendue   = payments.filter((p) => p.type === 'refund').reduce((a, p) => a + toNum(p.amount), 0)

  const depStatus: { label: string; bg: string; fg: string } =
    cautionPercue === 0
      ? { label: 'Non perçue', bg: 'rgba(148,163,184,0.14)', fg: '#94a3b8' }
      : cautionRendue >= cautionPercue
        ? { label: 'Rendue', bg: 'rgba(59,130,246,0.14)', fg: '#60a5fa' }
        : cautionPercue >= cautionAttendue
          ? { label: 'Perçue', bg: 'rgba(16,185,129,0.14)', fg: '#10b981' }
          : { label: 'Partielle', bg: 'rgba(245,158,11,0.14)', fg: '#fbbf24' }

  async function add() {
    setBusy(true); setErr(null)
    const amt = toNum(amount)
    if (!(amt > 0)) { setErr('Montant invalide.'); setBusy(false); return }
    try {
      const res = await fetch('/api/rental/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rental_id: rentalId, type, amount: amt, method, reference: reference.trim() || null, notes: notes.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.payment) { setErr(j?.error ?? 'Enregistrement échoué.'); setBusy(false); return }
      onAdded({ ...j.payment, amount: toNum(j.payment.amount) })
      setAmount(''); setReference(''); setNotes(''); setAdding(false)
    } catch { setErr('Erreur réseau.') } finally { setBusy(false) }
  }

  const input = 'h-10 px-3 rounded-lg text-sm'
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><Banknote className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Paiements</h3>
        <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
          <Plus className="w-3.5 h-3.5" /> {adding ? 'Fermer' : 'Ajouter'}
        </button>
      </div>

      {/* Summary strip — the key figures the loueur chases */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <SummaryBox label="Reste à payer (loyer)" highlight value={formatDZD(resteLoyer)} />
        <SummaryBox label="Encaissé loyer" value={formatDZD(payeLoyer)} />
        <SummaryBox label="Frais encaissés" value={formatDZD(totalFrais)} />
        <SummaryBox
          label="Caution"
          value={`${formatDZD(cautionPercue)} / ${formatDZD(cautionAttendue)}`}
          badge={depStatus}
        />
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {/* Loyer */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Loyer</p>
          <Line label="Total loyer">{formatDZD(totalLoyer)}</Line>
          <Line label="Payé">{formatDZD(payeLoyer)}</Line>
          <Line label="Reste" strong>{formatDZD(resteLoyer)}</Line>
        </div>
        {/* Caution */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Caution</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ background: depStatus.bg, color: depStatus.fg }}>{depStatus.label}</span>
          </div>
          <Line label="Attendue">{formatDZD(cautionAttendue)}</Line>
          <Line label="Perçue">{formatDZD(cautionPercue)}</Line>
          <Line label="Rendue">{formatDZD(cautionRendue)}</Line>
        </div>
        {/* Frais — only when present */}
        {fraisLines.length > 0 && (
          <div className="rounded-xl p-4 md:col-span-2" style={{ background: 'var(--bg-elevated)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Frais supplémentaires</p>
              <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]"><bdi>{formatDZD(totalFrais)}</bdi></span>
            </div>
            <ul className="space-y-1">
              {fraisLines.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {rentalPaymentTypeLabel(p.type)}
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}> · {rentalPaymentMethodLabel(p.method)} · {fmtDate(p.created_at)}{p.notes ? ` · ${p.notes}` : ''}</span>
                  </span>
                  <bdi className="tabular-nums text-[var(--text-primary)]">{formatDZD(toNum(p.amount))}</bdi>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {adding && (
        <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: 'var(--bg-elevated)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={type} onChange={(e) => setType(e.target.value)} className={input} style={inputStyle}>
              {RENTAL_PAYMENT_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} style={inputStyle}>
              {RENTAL_PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant (DZD)" className={input} style={inputStyle} />
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence (optionnel)" className={input} style={inputStyle} />
          </div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optionnel)" className={'w-full ' + input} style={inputStyle} />
          {err && <p className="text-xs" style={{ color: '#fb7185' }}>{err}</p>}
          <button type="button" onClick={add} disabled={busy} className="inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Enregistrer le paiement
          </button>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Aucun paiement enregistré.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                  <span>
                    {rentalPaymentTypeLabel(p.type)}
                    <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}> · {rentalPaymentMethodLabel(p.method)}</span>
                  </span>
                  {p.receipt_url && (
                    <button
                      type="button"
                      onClick={() => openReceiptPath(p.receipt_url!)}
                      title="Ouvrir le reçu"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider hover:opacity-90"
                      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                    >📎 Reçu</button>
                  )}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {fmtDate(p.created_at)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}
                </div>
              </div>
              <span className="font-semibold tabular-nums" style={{ color: p.type === 'refund' ? '#fb7185' : 'var(--text-primary)' }}>
                <bdi>{p.type === 'refund' ? '− ' : ''}{formatDZD(p.amount)}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
