'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  type Lead,
  LEAD_STATUS_LABELS,
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
  notes: string
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
      notes:        lead.notes ?? '',
    })
    setError('')
  }, [lead])

  function set<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !form) return
    if (!form.full_name.trim()) { setError('Le nom complet est requis.'); return }
    setSaving(true); setError('')

    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone:     form.phone.trim() || null,
      email:     form.email.trim() || null,
      wilaya:    form.wilaya || null,
      source:    form.source,
      status:    form.status,
      notes:     form.notes.trim() || null,
    }
    // Optional kanban field — only send when present so we don't fail on legacy schemas.
    if (form.model_wanted.trim()) payload.model_wanted = form.model_wanted.trim()
    else payload.model_wanted = null

    let { error: err } = await supabase.from('leads').update(payload).eq('id', lead.id)

    // Fallback: legacy schema (no model_wanted column).
    if (err && /model_wanted/i.test(err.message)) {
      const { model_wanted: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('leads').update(stripped).eq('id', lead.id)
      err = retry.error
    }

    setSaving(false)
    if (err) { setError(err.message); return }
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
