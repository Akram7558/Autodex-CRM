'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  type Lead,
  type LeadSuivi,
  type Vehicle,
  LEAD_SUIVI_LABELS,
  LEAD_SUIVI_VALUES,
  WILAYAS_58,
} from '@/lib/types'
import {
  KANBAN_SOURCES,
  SOURCE_ICONS,
} from '@/components/AddLeadModal'

type EditForm = {
  full_name: string
  phone: string
  email: string
  wilaya: string
  source: string
  suivi: LeadSuivi | ''
  notes: string
  vehicle_id: string
  rdv_date: string // datetime-local format: YYYY-MM-DDTHH:MM
}

function vehicleLabel(v: Vehicle): string {
  const parts = [v.brand, v.model, v.year ? String(v.year) : ''].filter(Boolean)
  let head = parts.join(' ')
  if (v.reference) head = `${head} · ${v.reference}`
  if (v.price_dzd != null) {
    const price = new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(v.price_dzd)
    return `${head} · ${price} DZD`
  }
  return head
}

// ── datetime-local helpers ─────────────────────────────────────────
// <input type="datetime-local"> uses "YYYY-MM-DDTHH:MM" with no tz.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
function localInputToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

export function EditLeadModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [leadsById, setLeadsById] = useState<Record<string, { id: string; full_name: string }>>({})

  useEffect(() => {
    if (!lead) { setForm(null); return }
    setForm({
      full_name:  lead.full_name ?? '',
      phone:      lead.phone ?? '',
      email:      lead.email ?? '',
      wilaya:     lead.wilaya ?? '',
      source:     lead.source,
      suivi:      (lead.suivi ?? '') as LeadSuivi | '',
      notes:      lead.notes ?? '',
      vehicle_id: lead.vehicle_id ?? '',
      rdv_date:   isoToLocalInput(lead.rdv_date ?? null),
    })
    setError('')
  }, [lead])

  // Lazy-load the vehicle list and a quick lead-name index used by the
  // "déjà réservé par X" warnings.
  useEffect(() => {
    if (!lead) return
    supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setVehicles((data ?? []) as Vehicle[]))
    supabase
      .from('leads')
      .select('id, full_name')
      .then(({ data }) => {
        const map: Record<string, { id: string; full_name: string }> = {}
        for (const l of (data ?? []) as { id: string; full_name: string }[]) {
          map[l.id] = l
        }
        setLeadsById(map)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id])

  function set<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !form) return
    if (!form.full_name.trim()) { setError('Le nom complet est requis.'); return }

    const isRdv      = form.suivi === 'rdv_planifie'
    const isVendu    = form.suivi === 'vendu'
    const needsVehicle = isRdv || isVendu

    if (needsVehicle && !form.vehicle_id) {
      setError(isRdv
        ? 'Sélectionnez le véhicule concerné par le RDV.'
        : 'Sélectionnez le véhicule vendu.')
      return
    }
    if (isRdv && !form.rdv_date) {
      setError('Choisissez la date et l\u2019heure du RDV.')
      return
    }

    // Global confirmation: any time suivi actually changes, ask the user.
    const previousSuivi = (lead.suivi ?? null) as LeadSuivi | null
    const nextSuivi     = (form.suivi || null) as LeadSuivi | null
    if (previousSuivi !== nextSuivi) {
      const newLabel = nextSuivi ? LEAD_SUIVI_LABELS[nextSuivi] : 'Aucun'
      if (!confirm(`Êtes-vous sûr de vouloir changer le suivi en ${newLabel} ?`)) return
    }

    // Block double-booking. A vehicle that's already reserved or sold by
    // another lead can never be picked here. (The dropdown also excludes
    // these — this is a defense-in-depth check.)
    if (needsVehicle) {
      const target = vehicles.find((v) => v.id === form.vehicle_id)
      if (target && (target.status === 'reserved' || target.status === 'sold')) {
        const ownerId = target.reserved_by_lead_id
        const blockedByOther = ownerId && ownerId !== lead.id
        if (blockedByOther) {
          const owner = ownerId ? leadsById[ownerId]?.full_name : null
          setError(
            target.status === 'reserved'
              ? `Ce véhicule est déjà réservé${owner ? ` par ${owner}` : ''}.`
              : `Ce véhicule a déjà été vendu${owner ? ` à ${owner}` : ''}.`
          )
          return
        }
      }
    }

    setSaving(true); setError('')

    const linkedVehicleId = needsVehicle ? form.vehicle_id : null
    const rdvIso = isRdv ? localInputToIso(form.rdv_date) : null

    const payload: Record<string, unknown> = {
      full_name:  form.full_name.trim(),
      phone:      form.phone.trim() || null,
      email:      form.email.trim() || null,
      wilaya:     form.wilaya || null,
      source:     form.source,
      suivi:      form.suivi || null,
      notes:      form.notes.trim() || null,
      vehicle_id: linkedVehicleId,
      rdv_date:   rdvIso,
    }

    let { error: err } = await supabase.from('leads').update(payload).eq('id', lead.id)

    // Fallback: legacy schema (no rdv_date column — pre migration_08).
    if (err && /rdv_date/i.test(err.message)) {
      const { rdv_date: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('leads').update(stripped).eq('id', lead.id)
      err = retry.error
      if (!err) {
        setSaving(false)
        setError('Lead mis à jour — exécutez migration_08_leads_rdv_date.sql pour activer la date du RDV.')
        setTimeout(() => { onSaved(); onClose() }, 2500)
        return
      }
    }
    // Fallback: legacy schema (no suivi column — pre migration_07).
    if (err && /suivi/i.test(err.message)) {
      const { suivi: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('leads').update(stripped).eq('id', lead.id)
      err = retry.error
      if (!err) {
        setSaving(false)
        setError('Lead mis à jour — exécutez migration_07_leads_suivi.sql pour activer le champ Suivi.')
        setTimeout(() => { onSaved(); onClose() }, 2500)
        return
      }
    }
    // Fallback: legacy schema (no vehicle_id column — pre migration_06).
    if (err && /vehicle_id/i.test(err.message)) {
      const { vehicle_id: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('leads').update(stripped).eq('id', lead.id)
      err = retry.error
      if (!err) {
        setSaving(false)
        setError('Lead mis à jour — exécutez migration_06_leads_vehicle_id.sql pour activer le lien véhicule.')
        setTimeout(() => { onSaved(); onClose() }, 2500)
        return
      }
    }

    if (err) { setSaving(false); setError(err.message); return }

    // ── Vehicle status cascade ────────────────────────────────────
    // Free the previously-linked vehicle if we're unlinking it or moving
    // to a different one. We only release vehicles whose reserved_by_lead_id
    // points at *this* lead — never touch vehicles claimed by someone else.
    const previousVehicleId = lead.vehicle_id ?? null
    if (previousVehicleId && previousVehicleId !== linkedVehicleId) {
      const prev = vehicles.find((v) => v.id === previousVehicleId)
      if (prev && prev.reserved_by_lead_id === lead.id) {
        const { error: vErr } = await supabase
          .from('vehicles')
          .update({ status: 'available', reserved_by_lead_id: null })
          .eq('id', previousVehicleId)
        if (vErr) console.warn('[EditLeadModal] failed to free previous vehicle:', vErr.message)
      }
    }

    // Apply the new status: rdv_planifie → reserved, vendu → sold.
    if (linkedVehicleId) {
      const nextStatus: 'reserved' | 'sold' | null =
        isVendu ? 'sold' : isRdv ? 'reserved' : null
      if (nextStatus) {
        const { error: vErr } = await supabase
          .from('vehicles')
          .update({ status: nextStatus, reserved_by_lead_id: lead.id })
          .eq('id', linkedVehicleId)
        if (vErr) console.warn('[EditLeadModal] failed to cascade vehicle status:', vErr.message)
      }
    }

    // Audit trail: log a new activity when an RDV / sale is scheduled or moved.
    if (linkedVehicleId && (isRdv || isVendu)) {
      const linked = vehicles.find((v) => v.id === linkedVehicleId)
      if (linked) {
        const label = [linked.brand, linked.model, linked.year ? String(linked.year) : '']
          .filter(Boolean).join(' ')
        const vehicleChanged = (lead.vehicle_id ?? null) !== linkedVehicleId
        const rdvChanged     = (lead.rdv_date ?? null) !== rdvIso
        const suiviChanged   = (lead.suivi ?? null) !== form.suivi
        if (vehicleChanged || rdvChanged || suiviChanged) {
          if (isRdv) {
            const when = rdvIso
              ? new Date(rdvIso).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })
              : ''
            await supabase.from('activities').insert([{
              lead_id: lead.id,
              type:    'meeting',
              title:   `RDV planifié pour ${label}`,
              body:    `${lead.full_name} · ${label}${when ? ` · ${when}` : ''}`,
              done:    false,
            }])
          } else if (isVendu) {
            await supabase.from('activities').insert([{
              lead_id: lead.id,
              type:    'status_change',
              title:   `Vente conclue : ${label}`,
              body:    `${lead.full_name} · ${label}`,
              done:    true,
            }])
          }
        }
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!lead || !form) return null

  const isRdv   = form.suivi === 'rdv_planifie'
  const isVendu = form.suivi === 'vendu'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Modifier le prospect</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{lead.full_name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Source */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Source</label>
            <div className="flex flex-wrap gap-2">
              {KANBAN_SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('source', s.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.source === s.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}
                >
                  <span>{SOURCE_ICONS[s.value]}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Suivi — independent follow-up tracker */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Suivi</label>
            <select
              value={form.suivi}
              onChange={(e) => set('suivi', e.target.value as LeadSuivi | '')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
            >
              <option value="">— Aucun —</option>
              {LEAD_SUIVI_VALUES.map((s) => (
                <option key={s} value={s}>{LEAD_SUIVI_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* RDV / Vendu vehicle picker */}
          {(isRdv || isVendu) && (() => {
            // Only available vehicles can be picked, plus the one currently
            // linked to this lead (so re-saving doesn't break).
            const selectableVehicles = vehicles.filter((v) =>
              v.status === 'available' || v.id === lead.vehicle_id
            )
            const picked = vehicles.find((v) => v.id === form.vehicle_id) ?? null
            const blockedByOther =
              picked &&
              (picked.status === 'reserved' || picked.status === 'sold') &&
              picked.reserved_by_lead_id &&
              picked.reserved_by_lead_id !== lead.id
            const blockerName = blockedByOther && picked.reserved_by_lead_id
              ? leadsById[picked.reserved_by_lead_id]?.full_name ?? null
              : null
            const wrapColor = isVendu
              ? 'border-rose-200 dark:border-rose-700/40 bg-rose-50/40 dark:bg-rose-500/5'
              : 'border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/40 dark:bg-emerald-500/5'
            return (
              <div className={`grid grid-cols-1 gap-4 rounded-xl border p-4 ${wrapColor}`}>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Véhicule concerné *
                  </label>
                  <select
                    value={form.vehicle_id}
                    onChange={(e) => set('vehicle_id', e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
                  >
                    <option value="">— Sélectionner un véhicule —</option>
                    {selectableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                    ))}
                  </select>
                  {blockedByOther && picked && (
                    <p className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      {picked.status === 'reserved'
                        ? `Ce véhicule est déjà réservé${blockerName ? ` par ${blockerName}` : ''}.`
                        : `Ce véhicule a déjà été vendu${blockerName ? ` à ${blockerName}` : ''}.`}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {isVendu
                      ? 'Le véhicule sera automatiquement marqué « Vendu ».'
                      : 'Le véhicule sera automatiquement marqué « Réservé ».'}
                  </p>
                </div>
                {isRdv && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Date du RDV *
                    </label>
                    <input
                      type="datetime-local"
                      value={form.rdv_date}
                      onChange={(e) => set('rdv_date', e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Quand le client doit-il venir au showroom ?
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nom complet *</label>
            <input
              dir="auto"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="ex. Karim Benali"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Téléphone</label>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="0555 XX XX XX"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ex. karim@email.dz"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>
          </div>

          {/* Wilaya */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Wilaya</label>
            <select
              value={form.wilaya}
              onChange={(e) => set('wilaya', e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
            >
              <option value="">— Choisir —</option>
              {WILAYAS_58.map((w, i) => (
                <option key={w} value={w}>{String(i + 1).padStart(2, '0')} · {w}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              placeholder="Observations, demande spécifique…"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition resize-none"
            />
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60 font-medium"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
