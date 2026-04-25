'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { WILAYAS_58 } from '@/lib/types'

export const SOURCE_ICONS: Record<string, string> = {
  facebook: '📘', instagram: '📷', whatsapp: '💬',
  telephone: '📞', 'walk-in': '🚶', phone: '📞',
  social: '📱', website: '🌐', referral: '👥',
}

export const KANBAN_SOURCES = [
  { value: 'facebook',  label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'telephone', label: 'Téléphone' },
  { value: 'walk-in',   label: 'Walk-in (Showroom)' },
]

export const CAR_MODELS = [
  'Geely Emgrand', 'Geely Coolray', 'Geely Atlas Pro',
  'Chery Tiggo 4', 'Chery Tiggo 7', 'Chery Arrizo 6',
  'Fiat 500X', 'Fiat Tipo',
  'Renault Symbol', 'Renault Sandero',
  'DFSK Glory 500', 'DFSK Glory 580',
]

export type AddForm = {
  full_name: string; phone: string; wilaya: string
  model_wanted: string; budget_dzd: string; source: string; notes: string
}

export function AddLeadModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void
}) {
  const empty: AddForm = {
    full_name: '', phone: '', wilaya: '', model_wanted: '',
    budget_dzd: '', source: 'facebook', notes: '',
  }
  const [form, setForm]     = useState<AddForm>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k: keyof AddForm, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Le nom complet est requis.'); return }
    setSaving(true); setError('')

    const LEGACY_SOURCE: Record<string, string> = {
      facebook:  'social',
      instagram: 'social',
      whatsapp:  'phone',
      telephone: 'phone',
      'walk-in': 'walk-in',
    }

    const basePayload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone:     form.phone  || null,
      wilaya:    form.wilaya || null,
      source:    form.source,
      status:    'new',
      notes:     form.notes  || null,
    }
    if (form.model_wanted.trim()) basePayload.model_wanted = form.model_wanted.trim()
    if (form.budget_dzd.trim()) {
      const n = parseFloat(form.budget_dzd.replace(/[\s\u00a0]/g, ''))
      if (!Number.isNaN(n)) basePayload.budget_dzd = n
    }

    let payload = { ...basePayload }
    let { error: err } = await supabase.from('leads').insert([payload])
    let fallbackUsed = false

    if (err && /model_wanted|budget_dzd/i.test(err.message)) {
      payload = { ...basePayload }
      delete payload.model_wanted
      delete payload.budget_dzd
      const retry = await supabase.from('leads').insert([payload])
      err = retry.error
      fallbackUsed = true
    }

    if (err && /source_check/i.test(err.message)) {
      const mapped = LEGACY_SOURCE[form.source] ?? 'walk-in'
      payload = { ...payload, source: mapped }
      const retry = await supabase.from('leads').insert([payload])
      err = retry.error
      fallbackUsed = true
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    if (fallbackUsed) {
      setError('Lead créé — exécutez migration_01_kanban.sql dans Supabase pour activer toutes les fonctionnalités.')
      setTimeout(() => { setForm(empty); onSaved(); onClose() }, 2500)
      return
    }
    setForm(empty)
    onSaved(); onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Nouveau lead</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ajouté en colonne « Nouveau »</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Source *</label>
            <div className="flex flex-wrap gap-2">
              {KANBAN_SOURCES.map(s => (
                <button key={s.value} type="button" onClick={() => set('source', s.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.source === s.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}>
                  <span>{SOURCE_ICONS[s.value]}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nom complet *</label>
            <input dir="auto" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="ex. Karim Benali"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Téléphone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="0555 XX XX XX"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Wilaya</label>
              <select value={form.wilaya} onChange={e => set('wilaya', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition bg-background text-foreground">
                <option value="">— Choisir —</option>
                {WILAYAS_58.map((w, i) => (
                  <option key={w} value={w}>{String(i + 1).padStart(2, '0')} · {w}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Modèle souhaité</label>
              <input list="models-list" value={form.model_wanted} onChange={e => set('model_wanted', e.target.value)}
                placeholder="ex. Geely Coolray"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
              <datalist id="models-list">
                {CAR_MODELS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Budget (DA)</label>
              <input value={form.budget_dzd} onChange={e => set('budget_dzd', e.target.value)}
                placeholder="ex. 4500000"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              placeholder="Observations, demande spécifique…"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition">
            Annuler
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60 font-medium">
            {saving ? 'Enregistrement…' : 'Créer le lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
