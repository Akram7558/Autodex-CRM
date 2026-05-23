'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalProspectsList — rental prospects pipeline (mirrors sales suivi UX).
// ─────────────────────────────────────────────────────────────────────
// Grouped tabs (RENTAL_PROSPECT_TABS) for coarse filtering + a per-row
// COLORED suivi <select> (RENTAL_PROSPECT_SUIVI_OPTIONS / *_BADGE_CLASSES),
// plus Call/Message popovers (tel:/sms:/wa.me) — same interaction model as
// the sales Prospects page. Rental-specific content kept: the REASON chip
// (key signal), requested vehicle, desired dates, message.
//
// Changing the dropdown PATCHes /api/rental/prospects/[id] (optimistic;
// revert + toast on error) and the row moves to the matching tab. 'convertie'
// is machine-set (chunk D) — never offered in the dropdown; convertie rows
// show a solid badge + the linked contract number. "Convertir en contrat"
// stays disabled until chunk D. All labels/colors come from
// src/lib/rental/prospects.ts (no hardcoded French/colors here).
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Phone, MessageSquare, MessageCircle, Car as CarIcon, CalendarRange,
  Loader2, FileSignature, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RENTAL_PROSPECT_TABS, RENTAL_PROSPECT_SUIVI_OPTIONS,
  RENTAL_PROSPECT_SUIVI_BADGE_CLASSES, rentalProspectStatusLabel,
  rentalProspectReasonLabel, rentalFormatPhoneIntl,
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

export default function RentalProspectsList({ initialRows }: { initialRows: ProspectRow[] }) {
  const [rows, setRows] = useState<ProspectRow[]>(initialRows)
  const [activeTab, setActiveTab] = useState<string>('nouvelles')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contactPopover, setContactPopover] = useState<{ id: string; kind: 'call' | 'msg' } | null>(null)

  // Close contact popovers on outside click (mirrors sales).
  useEffect(() => {
    if (!contactPopover) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-contact-popover]')) setContactPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [contactPopover])

  const countByTab = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of RENTAL_PROSPECT_TABS) {
      m[t.id] = rows.filter((r) => (t.statuses as readonly string[]).includes(r.status)).length
    }
    return m
  }, [rows])

  const tab = RENTAL_PROSPECT_TABS.find((t) => t.id === activeTab) ?? RENTAL_PROSPECT_TABS[0]
  const visibleRows = rows.filter((r) => (tab.statuses as readonly string[]).includes(r.status))

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

      {/* Grouped tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RENTAL_PROSPECT_TABS.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
              style={active
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {t.label}
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full tabular-nums"
                style={active
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                {countByTab[t.id] ?? 0}
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
                        <ContactActions row={r} popover={contactPopover} setPopover={setContactPopover} />
                        <ConvertButton />
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
                    <ContactActions row={r} popover={contactPopover} setPopover={setContactPopover} />
                    <ConvertButton />
                  </div>
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
          <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">{row.contract_number}</div>
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

// Call + Message popovers (tel: / sms: / wa.me) — mirrors sales.
function ContactActions({
  row, popover, setPopover,
}: {
  row: ProspectRow
  popover: { id: string; kind: 'call' | 'msg' } | null
  setPopover: (p: { id: string; kind: 'call' | 'msg' } | null) => void
}) {
  const intl = rentalFormatPhoneIntl(row.phone)
  const has = !!intl
  const btnCls = 'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const menuCls = 'absolute end-0 top-full mt-2 z-30 w-52 rounded-xl border py-1 text-start shadow-2xl'
  const menuStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border)' } as const
  const itemCls = 'flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-elevated)]'

  return (
    <>
      {/* Call */}
      <div className="relative" data-contact-popover>
        <button
          type="button"
          disabled={!has}
          onClick={() => setPopover(popover?.id === row.id && popover.kind === 'call' ? null : { id: row.id, kind: 'call' })}
          aria-haspopup="menu"
          aria-expanded={popover?.id === row.id && popover.kind === 'call'}
          title={has ? `Appeler ${row.phone}` : 'Pas de numéro'}
          className={btnCls}
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <Phone className="w-4 h-4" />
        </button>
        {has && popover?.id === row.id && popover.kind === 'call' && (
          <div role="menu" className={menuCls} style={menuStyle}>
            <a href={`tel:${intl!.tel}`} onClick={() => setPopover(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Appel téléphonique
            </a>
            <a href={`https://wa.me/${intl!.wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setPopover(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Appel WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="relative" data-contact-popover>
        <button
          type="button"
          disabled={!has}
          onClick={() => setPopover(popover?.id === row.id && popover.kind === 'msg' ? null : { id: row.id, kind: 'msg' })}
          aria-haspopup="menu"
          aria-expanded={popover?.id === row.id && popover.kind === 'msg'}
          title={has ? `Message à ${row.phone}` : 'Pas de numéro'}
          className={btnCls}
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <MessageSquare className="w-4 h-4" />
        </button>
        {has && popover?.id === row.id && popover.kind === 'msg' && (
          <div role="menu" className={menuCls} style={menuStyle}>
            <a href={`sms:${intl!.tel}`} onClick={() => setPopover(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageSquare className="w-4 h-4 text-sky-600 dark:text-sky-400" /> SMS
            </a>
            <a href={`https://wa.me/${intl!.wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setPopover(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> WhatsApp
            </a>
          </div>
        )}
      </div>
    </>
  )
}

// Convert-to-contract — wired in chunk D.
function ConvertButton() {
  return (
    <span title="Bientôt (chunk D)">
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold opacity-50 cursor-not-allowed"
        style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
      >
        <FileSignature className="w-3.5 h-3.5" /> Convertir
      </button>
    </span>
  )
}
