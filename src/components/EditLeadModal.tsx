'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  type Lead,
  type LeadSuivi,
  type Vehicle,
  LEAD_STATUS_LABELS,
  LEAD_SUIVI_LABELS,
  LEAD_SUIVI_VALUES,
  WILAYAS_58,
} from '@/lib/types'
import {
  KANBAN_SOURCES,
  SOURCE_ICONS,
  CAR_MODELS,
} from '@/components/AddLeadModal'

type EditForm = {
  full_name: string
  phone: string
  email: string
  wilaya: string
  model_wanted: string
  source: string
  status: Lead['status']
  suivi: LeadSuivi | ''
  notes: string
  vehicle_id: string
}

// Statuses that require linking a specific vehicle (for accounting / reports).
const VEHICLE_LINK_STATUSES: Lead['status'][] = ['qualified', 'proposal', 'won']

// Activity title + type per linked-vehicle status. Each save with a link
// produces a new entry — never overwriting — so we keep a full audit trail.
function activityForStatus(
  status: Lead['status'],
  vehicleLabel: string
): { type: 'meeting' | 'status_change'; title: string } | null {
  switch (status) {
    case 'qualified':
      return { type: 'meeting',       title: `RDV planifié pour ${vehicleLabel}` }
    case 'proposal':
      return { type: 'status_change', title: `Offre faite sur ${vehicleLabel}` }
    case 'won':
      return { type: 'status_change', title: `Vente conclue : ${vehicleLabel}` }
    default:
      return null
  }
}

function vehicleLabel(v: Vehicle): string {
  const parts = [v.brand, v.model, v.year ? String(v.year) : ''].filter(Boolean)
  const head = parts.join(' ')
  if (v.price_dzd != null) {
    const price = new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(v.price_dzd)
    return `${head} · ${price} DZD`
  }
  return head
}

const STATUS_OPTIONS: Lead['status'][] = [
  'new', 'contacted', 'qualified', 'proposal', 'won', 'lost',
]

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

  useEffect(() => {
    if (!lead) { setForm(null); return }
    setForm({
      full_name:    lead.full_name ?? '',
      phone:        lead.phone ?? '',
      email:        lead.email ?? '',
      wilaya:       lead.wilaya ?? '',
      model_wanted: lead.model_wanted ?? '',
      source:       lead.source,
      status:       lead.status,
      suivi:        (lead.suivi ?? '') as LeadSuivi | '',
      notes:        lead.notes ?? '',
      vehicle_id:   lead.vehicle_id ?? '',
    })
    setError('')
  }, [lead])

  // Lazy-load the vehicle list the first time the user opens the modal.
  useEffect(() => {
    if (!lead) return
    if (vehicles.length > 0) return
    supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setVehicles((data ?? []) as Vehicle[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead])

  function set<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !form) return
    if (!form.full_name.trim()) { setError('Le nom complet est requis.'); return }

    const needsVehicle = VEHICLE_LINK_STATUSES.includes(form.status)
    if (needsVehicle && !form.vehicle_id) {
      setError('Sélectionnez le véhicule concerné par cette offre / vente.')
      return
    }
    setSaving(true); setError('')

    const linkedVehicleId = needsVehicle ? form.vehicle_id : null

    const payload: Record<string, unknown> = {
      full_name:  form.full_name.trim(),
      phone:      form.phone.trim() || null,
      email:      form.email.trim() || null,
      wilaya:     form.wilaya || null,
      source:     form.source,
      status:     form.status,
      suivi:      form.suivi || null,
      notes:      form.notes.trim() || null,
      vehicle_id: linkedVehicleId,
    }
    // Optional kanban field — only send when present so we don't fail on legacy schemas.
    if (form.model_wanted.trim()) payload.model_wanted = form.model_wanted.trim()
    else payload.model_wanted = null

    let { error: err } = await supabase.from('leads').update(payload).eq('id', lead.id)

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

    // Fallback: legacy schema (no model_wanted column).
    if (err && /model_wanted/i.test(err.message)) {
      const { model_wanted: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('leads').update(stripped).eq('id', lead.id)
      err = retry.error
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

    // Audit trail: when a vehicle is linked under one of the tracked statuses,
    // log a NEW activity each time the link or the status moves. Re-saving
    // without changing either is a no-op so we don't spam the timeline.
    if (linkedVehicleId && needsVehicle) {
      const linked = vehicles.find((v) => v.id === linkedVehicleId)
      if (linked) {
        const vehicleLabel = [linked.brand, linked.model, linked.year ? String(linked.year) : '']
          .filter(Boolean)
          .join(' ')
        const meta = activityForStatus(form.status, vehicleLabel)
        const statusChanged   = lead.status !== form.status
        const vehicleChanged  = (lead.vehicle_id ?? null) !== linkedVehicleId
        if (meta && (statusChanged || vehicleChanged)) {
          const { error: actErr } = await supabase.from('activities').insert([{
            lead_id: lead.id,
            type:    meta.type,
            title:   meta.title,
            body:    `${lead.full_name} · ${vehicleLabel}`,
            done:    true,
          }])
          if (actErr) {
            console.warn('[EditLeadModal] failed to log activity:', actErr.message)
          }
        }
      }
    }

    // Cascade: a confirmed sale flips the linked vehicle's status to 'sold'.
    // For 'proposal' (offre faite) and 'qualified' (RDV planifié) we keep
    // the vehicle as-is — the dedicated reservation flow on the vehicles
    // page handles the 'reserved' transition.
    if (linkedVehicleId && form.status === 'won') {
      const { error: vErr } = await supabase
        .from('vehicles')
        .update({ status: 'sold' })
        .eq('id', linkedVehicleId)
      if (vErr) {
        console.warn('[EditLeadModal] failed to mark vehicle sold:', vErr.message)
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!lead || !form) return null

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

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Statut</label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as Lead['status'])}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
              ))}
            </select>
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

          {/* Véhicule concerné — only for "Offre faite" / "Vendu" */}
          {VEHICLE_LINK_STATUSES.includes(form.status) && (
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
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {form.status === 'won'
                  ? 'Le véhicule sera automatiquement marqué comme « Vendu ».'
                  : 'Le véhicule conservera son statut actuel. Une activité sera enregistrée dans l\u2019historique.'}
              </p>
            </div>
          )}

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

          {/* Vehicle + Wilaya */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Véhicule souhaité</label>
              <input
                list="edit-models-list"
                value={form.model_wanted}
                onChange={(e) => set('model_wanted', e.target.value)}
                placeholder="ex. Geely Coolray"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
              <datalist id="edit-models-list">
                {CAR_MODELS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
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
