'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalCustomerDetail — single-customer page.
// ─────────────────────────────────────────────────────────────────────
// Profile header · KPI tiles · CIN + Permis documents (with signed
// read-URL resolution on demand) · rental history table.
// Edit / Blacklist / Delete actions live in the top action bar.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Pencil, Trash2, ShieldX, ShieldCheck, MessageCircle, FileText, MapPin,
  CalendarClock, Mail, X, ExternalLink, Camera,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import RentalCustomerFormModal, { type CustomerInitial } from '@/components/rental/RentalCustomerFormModal'
import { rentalStatusLabel } from '@/components/rental/booking/types'

type Vehicle = { marque: string; modele: string; annee: number | null; immatriculation: string | null }

type Rental = {
  id:                  string
  contract_number:     string | null
  status:              string
  start_date:          string
  end_date:            string
  duration_days:       number
  total_rental_amount: number
  rental_vehicle:      Vehicle | Vehicle[] | null
}

type Customer = CustomerInitial & {
  showroom_id:      string
  blacklisted:      boolean
  blacklist_reason: string | null
  total_rentals:    number
  total_spent:      number
  created_at:       string
}

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '0'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

function digitsOnly(p: string): string { return p.replace(/\D/g, '') }

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((s) => s.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Vehicle column in the joined select can come back as either a row
// or a single-element array depending on supabase-js version.
function flattenVehicle(v: Vehicle | Vehicle[] | null): Vehicle | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Colors only — the display label comes from rentalStatusLabel() so all
// status text lives in one place (src/components/rental/booking/types.ts).
const STATUS_STYLES: Record<string, { bg: string; fg: string; ring: string }> = {
  draft:     { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', ring: 'rgba(148,163,184,0.35)' },
  confirmed: { bg: 'rgba(59,130,246,0.12)',  fg: '#60a5fa', ring: 'rgba(59,130,246,0.35)' },
  active:    { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  completed: { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  overdue:   { bg: 'rgba(245,158,11,0.14)',  fg: '#fbbf24', ring: 'rgba(245,158,11,0.40)' },
  cancelled: { bg: 'rgba(244,63,94,0.12)',   fg: '#fb7185', ring: 'rgba(244,63,94,0.40)' },
}

export default function RentalCustomerDetail({
  customer: initial, rentals, canEdit, canDelete,
}: {
  customer:  Customer
  rentals:   Rental[]
  canEdit:   boolean
  canDelete: boolean
}) {
  const [customer, setCustomer] = useState<Customer>(initial)
  const [editOpen, setEditOpen] = useState(false)
  const [blacklistModal, setBlacklistModal] = useState(false)
  const [deleteModal, setDeleteModal]       = useState(false)
  const [busy, setBusy]                     = useState(false)
  const [toast, setToast]                   = useState<string | null>(null)
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2500) }

  // Resolve signed read URLs for the CIN + Permis files. The bucket
  // is private — paths in the row aren't directly viewable.
  const [cinUrl,    setCinUrl]    = useState<string | null>(null)
  const [permisUrl, setPermisUrl] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      if (customer.cin_photo_url) {
        const { data } = await supabase.storage.from('rental-documents')
          .createSignedUrl(customer.cin_photo_url, 60 * 10)
        setCinUrl(data?.signedUrl ?? null)
      } else setCinUrl(null)
      if (customer.permis_photo_url) {
        const { data } = await supabase.storage.from('rental-documents')
          .createSignedUrl(customer.permis_photo_url, 60 * 10)
        setPermisUrl(data?.signedUrl ?? null)
      } else setPermisUrl(null)
    })()
  }, [customer.cin_photo_url, customer.permis_photo_url])

  const lastRental = useMemo<Rental | null>(() => rentals[0] ?? null, [rentals])
  const memberSince = useMemo(
    () => formatDistanceToNow(new Date(customer.created_at), { addSuffix: true, locale: fr }),
    [customer.created_at],
  )
  // permisExpired depends on `new Date()` — defer to a post-mount
  // useEffect so the server's "today" and the client's "today" can't
  // disagree across midnight and trigger React #418.
  const [permisExpired, setPermisExpired] = useState(false)
  useEffect(() => {
    if (!customer.permis_expiry) { setPermisExpired(false); return }
    const expiry = new Date(customer.permis_expiry + 'T00:00:00')
    setPermisExpired(expiry < new Date(new Date().toDateString()))
  }, [customer.permis_expiry])

  const onSaved = useCallback((updated: { id: string; full_name: string }) => {
    // Refetch the full payload so denormalised counters refresh.
    void (async () => {
      const r = await fetch(`/api/rental/customers/${updated.id}`)
      const j = await r.json().catch(() => ({}))
      if (j?.customer) setCustomer(j.customer as Customer)
      setEditOpen(false)
      flash('Client mis à jour')
    })()
  }, [])

  async function toggleBlacklist(reason: string | null) {
    setBusy(true)
    const url = `/api/rental/customers/${customer.id}/blacklist`
    const res = customer.blacklisted
      ? await fetch(url, { method: 'DELETE' })
      : await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ reason: reason ?? '' }),
        })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { flash(j?.error ?? 'Erreur.'); return }
    setCustomer(j.customer as Customer)
    setBlacklistModal(false)
    flash(j.customer.blacklisted ? 'Client blacklisté' : 'Blacklist levé')
  }

  async function deleteCustomer() {
    setBusy(true)
    const res = await fetch(`/api/rental/customers/${customer.id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      if (j?.error === 'customer_has_rentals') {
        flash('Impossible : le client a des contrats actifs.')
      } else {
        flash(j?.error ?? 'Erreur de suppression.')
      }
      return
    }
    window.location.href = '/dashboard/location/clients'
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* ── Profile header ──────────────────────────────────────── */}
      <div
        className="glass-card rounded-2xl p-6 md:p-8"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <span
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                color: 'var(--accent)',
              }}
            >
              {initialsOf(customer.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {customer.full_name}
                </h1>
                {customer.blacklisted && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: 'rgba(244,63,94,0.14)', color: '#fb7185' }}
                    title={customer.blacklist_reason ?? ''}
                  >
                    <ShieldX className="w-3 h-3" /> Blacklisté
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                <a
                  href={`https://wa.me/${digitsOnly(customer.phone)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <bdi>{customer.phone}</bdi>
                </a>
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-white truncate max-w-[280px]"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    {customer.email}
                  </a>
                )}
                {customer.wilaya && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {customer.wilaya}
                  </span>
                )}
              </div>
              {customer.blacklisted && customer.blacklist_reason && (
                <p
                  className="mt-3 px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: 'rgba(244,63,94,0.08)',
                    border: '1px solid rgba(244,63,94,0.25)',
                    color: '#fb7185',
                  }}
                >
                  <strong>Raison : </strong>{customer.blacklist_reason}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <Pencil className="w-3.5 h-3.5" /> Modifier
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => customer.blacklisted ? toggleBlacklist(null) : setBlacklistModal(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
                style={
                  customer.blacklisted
                    ? { background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981' }
                    : { background: 'rgba(244,63,94,0.10)',  border: '1px solid rgba(244,63,94,0.35)',  color: '#fb7185' }
                }
              >
                {customer.blacklisted
                  ? <><ShieldCheck className="w-3.5 h-3.5" /> Lever blacklist</>
                  : <><ShieldX     className="w-3.5 h-3.5" /> Blacklister</>}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => rentals.length > 0
                  ? flash('Client a des contrats — impossible à supprimer')
                  : setDeleteModal(true)}
                disabled={busy}
                title={rentals.length > 0 ? 'Client a des contrats — impossible à supprimer' : ''}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: rentals.length > 0 ? 'var(--text-muted)' : '#fb7185',
                  opacity: rentals.length > 0 ? 0.6 : 1,
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            )}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total locations" value={<bdi className="tabular-nums">{customer.total_rentals}</bdi>} />
          <Kpi label="Total dépensé"  value={<><bdi className="tabular-nums">{formatDzd(customer.total_spent)}</bdi> <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>DA</span></>} />
          <Kpi label="Membre depuis"  value={memberSince} small />
          <Kpi
            label="Dernière location"
            value={lastRental ? format(new Date(lastRental.start_date), 'd MMM yyyy', { locale: fr }) : '—'}
            small
          />
        </div>
      </div>

      {/* ── Documents ──────────────────────────────────────────── */}
      <section
        className="glass-card rounded-2xl p-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          Documents officiels
        </h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DocumentTile
            label="CIN"
            number={customer.cin_number}
            url={cinUrl}
            placeholder="Aucune CIN enregistrée"
            canEdit={canEdit}
            onEdit={() => setEditOpen(true)}
          />
          <DocumentTile
            label="Permis"
            number={customer.permis_number}
            url={permisUrl}
            placeholder="Aucun permis enregistré"
            footer={
              customer.permis_expiry ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: permisExpired ? '#fb7185' : 'var(--text-secondary)' }}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Expire le {format(new Date(customer.permis_expiry + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
                  {permisExpired && (
                    <span
                      className="ms-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: 'rgba(244,63,94,0.16)', color: '#fb7185' }}
                    >
                      Expiré
                    </span>
                  )}
                </span>
              ) : null
            }
            canEdit={canEdit}
            onEdit={() => setEditOpen(true)}
          />
        </div>
      </section>

      {/* ── History ────────────────────────────────────────────── */}
      <section
        className="glass-card rounded-2xl overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            Historique des locations
          </h2>
        </div>
        {rentals.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="w-9 h-9 mx-auto" style={{ color: 'var(--text-muted)' }} />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Aucune location enregistrée pour ce client.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-white/[0.02] border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 text-start">Contrat</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 text-start">Véhicule</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 text-start">Dates</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 text-start">Statut</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 text-end">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {rentals.map((r) => {
                  const veh = flattenVehicle(r.rental_vehicle)
                  const style = STATUS_STYLES[r.status] ?? STATUS_STYLES.draft
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors duration-150">
                      <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">
                        <Link
                          href={`/dashboard/location/contrats/${r.id}`}
                          className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                          <bdi>{r.contract_number ?? '—'}</bdi>
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-zinc-700 dark:text-zinc-200">
                        {veh ? (
                          <>
                            <bdi>{veh.marque} {veh.modele}</bdi>
                            {veh.annee && <span className="text-zinc-500 dark:text-zinc-400"> · <bdi>{veh.annee}</bdi></span>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        <bdi>{format(new Date(r.start_date + 'T00:00:00'), 'd MMM', { locale: fr })}</bdi>
                        {' → '}
                        <bdi>{format(new Date(r.end_date   + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}</bdi>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1"
                          style={{ background: style.bg, color: style.fg, boxShadow: `inset 0 0 0 1px ${style.ring}` }}
                        >
                          {rentalStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        <bdi>{formatDzd(r.total_rental_amount)} DA</bdi>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {editOpen && (
        <RentalCustomerFormModal
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSaved={onSaved}
        />
      )}

      {blacklistModal && (
        <BlacklistModal
          onClose={() => setBlacklistModal(false)}
          onConfirm={(reason) => toggleBlacklist(reason)}
          busy={busy}
        />
      )}

      {deleteModal && (
        <ConfirmModal
          title="Supprimer ce client ?"
          body={`${customer.full_name} sera supprimé définitivement. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          danger
          busy={busy}
          onCancel={() => setDeleteModal(false)}
          onConfirm={deleteCustomer}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 end-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

function Kpi({
  label, value, small,
}: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className={small ? 'mt-1 text-sm font-semibold' : 'mt-1 text-xl font-bold'}
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

function DocumentTile({
  label, number, url, placeholder, footer, canEdit, onEdit,
}: {
  label:        string
  number:       string | null
  url:          string | null
  placeholder:  string
  footer?:      React.ReactNode
  canEdit:      boolean
  onEdit:       () => void
}) {
  return (
    <div
      className="rounded-xl p-4 flex gap-3"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
           style={{ background: 'var(--bg-surface)' }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <Camera className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
          {number ? <bdi>{number}</bdi> : <span className="text-zinc-500 dark:text-zinc-400">{placeholder}</span>}
        </p>
        {footer && <p className="mt-1">{footer}</p>}
        <div className="mt-2 flex items-center gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium inline-flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
            >
              Ouvrir <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs font-medium inline-flex items-center gap-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Pencil className="w-3 h-3" /> Remplacer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function BlacklistModal({
  onClose, onConfirm, busy,
}: { onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Blacklister ce client</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Indiquez la raison pour laquelle ce client est blacklisté. Cette note sera visible par toute votre équipe.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="ex. Retour véhicule en mauvais état, dégradations non-payées…"
            className="w-full px-3 py-2 rounded-lg text-sm transition resize-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => valid && onConfirm(reason.trim())}
              disabled={!valid || busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: '#e11d48', boxShadow: '0 6px 22px -8px rgba(244,63,94,0.45)' }}
            >
              <ShieldX className="w-4 h-4" /> Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({
  title, body, confirmLabel, danger, busy, onCancel, onConfirm,
}: {
  title:        string
  body:         string
  confirmLabel: string
  danger?:      boolean
  busy:         boolean
  onCancel:     () => void
  onConfirm:    () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 inline-flex items-center gap-1.5"
            style={danger
              ? { background: '#e11d48', boxShadow: '0 6px 22px -8px rgba(244,63,94,0.45)' }
              : { background: 'var(--accent)' }}
          >
            <Trash2 className="w-4 h-4" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
