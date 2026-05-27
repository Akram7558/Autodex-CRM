'use client'
// ─────────────────────────────────────────────────────────────────────
// ContractSuiviControl — colored <select> for the "À confirmer" relance
// sub-statuses (Chantier 1).
// ─────────────────────────────────────────────────────────────────────
// Renders the current contract status as a native <select> the loueur can
// change directly, mirroring the prospects SuiviControl pattern. Selectable
// options come from RENTAL_CONTRACT_SUIVI_OPTIONS (draft + tentative_1/2/3).
// When the current status is 'reporter' (set only by POST /report), it is
// shown as a DISABLED HEAD entry above the regular options — same pattern
// the prospects suivi uses for 'rdv_planifie' — so the user can switch back
// to draft/tentative_X but can't re-select "Reporté" from the dropdown (a
// Reporter requires new dates → the Reporter action button + /report).
//
// The parent (RentalContractsList / ContractDetail) owns the PATCH call and
// the optimistic-revert dance. This component just renders + emits onChange.
// ─────────────────────────────────────────────────────────────────────

import {
  rentalStatusColor, rentalStatusLabel,
  RENTAL_CONTRACT_SUIVI_OPTIONS, RENTAL_CONTRACT_SUIVI_SET,
} from '@/components/rental/booking/types'

export default function ContractSuiviControl({
  value, busy, onChange,
}: {
  value:    string
  busy:     boolean
  onChange: (newStatus: string) => void
}) {
  const c = rentalStatusColor(value)
  const offList = !RENTAL_CONTRACT_SUIVI_SET.has(value)
  return (
    <div className="relative inline-block">
      <select
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Changer le statut"
        className="appearance-none cursor-pointer pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
      >
        {offList && (
          <option value={value} disabled>{rentalStatusLabel(value)}</option>
        )}
        {RENTAL_CONTRACT_SUIVI_OPTIONS.map((s) => (
          <option key={s} value={s}>{rentalStatusLabel(s)}</option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-70"
        viewBox="0 0 20 20" fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  )
}
