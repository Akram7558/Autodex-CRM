'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalVehicleFormModal — create / edit rental_vehicles.
// ─────────────────────────────────────────────────────────────────────
// POSTs to /api/rental/vehicles or PATCHes /api/rental/vehicles/[id].
// On 403 with plan_limit_reached the parent triggers UpgradeModal.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'

type FuelType = 'essence' | 'diesel' | 'hybride' | 'electrique' | 'gpl'
type BoxType  = 'manuelle' | 'automatique'

type Initial = {
  id?:                  string
  marque?:              string
  modele?:              string
  annee?:               number
  immatriculation?:     string
  couleur?:             string | null
  type_carburant?:      string | null
  boite_vitesse?:       string | null
  nb_places?:           number | null
  photos_urls?:         string[]
  description?:         string | null
  daily_rate?:          number
  weekly_rate?:         number | null
  monthly_rate?:        number | null
  deposit_amount?:      number
  km_included_per_day?: number | null
  extra_km_rate?:       number | null
}

type Form = {
  marque:               string
  modele:               string
  annee:                string
  immatriculation:      string
  couleur:              string
  type_carburant:       string
  boite_vitesse:        string
  nb_places:            string
  description:          string
  daily_rate:           string
  weekly_rate:          string
  monthly_rate:         string
  deposit_amount:       string
  km_included_per_day:  string
  extra_km_rate:        string
  photos_urls:          string[]
}

function buildInitial(init: Initial | null): Form {
  return {
    marque:               init?.marque ?? '',
    modele:               init?.modele ?? '',
    annee:                init?.annee != null ? String(init.annee) : String(new Date().getFullYear()),
    immatriculation:      init?.immatriculation ?? '',
    couleur:              init?.couleur ?? '',
    type_carburant:       init?.type_carburant ?? '',
    boite_vitesse:        init?.boite_vitesse ?? '',
    nb_places:            init?.nb_places != null ? String(init.nb_places) : '5',
    description:          init?.description ?? '',
    daily_rate:           init?.daily_rate != null ? String(init.daily_rate) : '',
    weekly_rate:          init?.weekly_rate != null ? String(init.weekly_rate) : '',
    monthly_rate:         init?.monthly_rate != null ? String(init.monthly_rate) : '',
    deposit_amount:       init?.deposit_amount != null ? String(init.deposit_amount) : '',
    km_included_per_day:  init?.km_included_per_day != null ? String(init.km_included_per_day) : '200',
    extra_km_rate:        init?.extra_km_rate != null ? String(init.extra_km_rate) : '0',
    photos_urls:          init?.photos_urls?.slice(0, 3) ?? [],
  }
}

export default function RentalVehicleFormModal({
  initial, onClose, onSaved, onPlanLimitReached,
}: {
  initial:            Initial | null
  onClose:            () => void
  onSaved:            () => void
  onPlanLimitReached: () => void
}) {
  const [form, setForm]       = useState<Form>(() => buildInitial(initial))
  const [photo1, setPhoto1]   = useState(initial?.photos_urls?.[0] ?? '')
  const [photo2, setPhoto2]   = useState(initial?.photos_urls?.[1] ?? '')
  const [photo3, setPhoto3]   = useState(initial?.photos_urls?.[2] ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const isEdit = !!initial?.id

  // Auto-suggest weekly / monthly = daily × 6 / × 25 when blank.
  useEffect(() => {
    const d = Number(form.daily_rate)
    if (!Number.isFinite(d) || d <= 0) return
    if (!form.weekly_rate)  setForm((f) => ({ ...f, weekly_rate:  String(Math.round(d * 6)) }))
    if (!form.monthly_rate) setForm((f) => ({ ...f, monthly_rate: String(Math.round(d * 25)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.daily_rate])

  // Esc + scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.marque.trim()) { setError('Marque requise.'); return }
    if (!form.modele.trim()) { setError('Modèle requis.'); return }
    if (!form.immatriculation.trim()) { setError('Immatriculation requise.'); return }
    if (!form.daily_rate || Number(form.daily_rate) < 0) {
      setError('Tarif journalier invalide.'); return
    }

    setSaving(true)
    const payload = {
      marque:               form.marque.trim(),
      modele:               form.modele.trim(),
      annee:                Number(form.annee),
      immatriculation:      form.immatriculation.trim().toUpperCase(),
      couleur:              form.couleur.trim() || null,
      type_carburant:       form.type_carburant || null,
      boite_vitesse:        form.boite_vitesse || null,
      nb_places:            form.nb_places ? Number(form.nb_places) : null,
      description:          form.description.trim() || null,
      daily_rate:           Number(form.daily_rate),
      weekly_rate:          form.weekly_rate ? Number(form.weekly_rate) : null,
      monthly_rate:         form.monthly_rate ? Number(form.monthly_rate) : null,
      deposit_amount:       form.deposit_amount ? Number(form.deposit_amount) : 0,
      km_included_per_day:  form.km_included_per_day ? Number(form.km_included_per_day) : null,
      extra_km_rate:        form.extra_km_rate ? Number(form.extra_km_rate) : null,
      photos_urls:          [photo1, photo2, photo3].map((p) => p.trim()).filter(Boolean),
    }

    const url    = isEdit ? `/api/rental/vehicles/${initial!.id}` : '/api/rental/vehicles'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)

    if (res.status === 403 && j?.error === 'plan_limit_reached') {
      onPlanLimitReached()
      return
    }
    if (!res.ok) {
      setError(j?.error ?? 'Erreur lors de la sauvegarde.')
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            {isEdit ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Identity */}
          <section>
            <Subhead>Identité du véhicule</Subhead>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Marque *">
                <Input value={form.marque} onChange={(v) => setForm({ ...form, marque: v })} placeholder="ex. Renault" required />
              </Field>
              <Field label="Modèle *">
                <Input value={form.modele} onChange={(v) => setForm({ ...form, modele: v })} placeholder="ex. Clio 5" required />
              </Field>
              <Field label="Année *">
                <Input type="number" value={form.annee} onChange={(v) => setForm({ ...form, annee: v })} required />
              </Field>
              <Field label="Immatriculation *">
                <Input value={form.immatriculation} onChange={(v) => setForm({ ...form, immatriculation: v.toUpperCase() })} placeholder="00000-000-00" required />
              </Field>
              <Field label="Couleur">
                <Input value={form.couleur} onChange={(v) => setForm({ ...form, couleur: v })} placeholder="ex. Blanc" />
              </Field>
              <Field label="Nombre de places">
                <Input type="number" value={form.nb_places} onChange={(v) => setForm({ ...form, nb_places: v })} />
              </Field>
              <Field label="Carburant">
                <Select value={form.type_carburant} onChange={(v) => setForm({ ...form, type_carburant: v })}>
                  <option value="">—</option>
                  {(['essence','diesel','hybride','electrique','gpl'] as FuelType[]).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Boîte de vitesse">
                <Select value={form.boite_vitesse} onChange={(v) => setForm({ ...form, boite_vitesse: v })}>
                  <option value="">—</option>
                  {(['manuelle','automatique'] as BoxType[]).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <Subhead>Tarification</Subhead>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Tarif / jour (DZD) *">
                <Input type="number" value={form.daily_rate} onChange={(v) => setForm({ ...form, daily_rate: v })} placeholder="ex. 5000" required />
              </Field>
              <Field label="Tarif / semaine">
                <Input type="number" value={form.weekly_rate} onChange={(v) => setForm({ ...form, weekly_rate: v })} placeholder="Suggéré · jour × 6" />
              </Field>
              <Field label="Tarif / mois">
                <Input type="number" value={form.monthly_rate} onChange={(v) => setForm({ ...form, monthly_rate: v })} placeholder="Suggéré · jour × 25" />
              </Field>
              <Field label="Caution (DZD)">
                <Input type="number" value={form.deposit_amount} onChange={(v) => setForm({ ...form, deposit_amount: v })} placeholder="ex. 30000" />
              </Field>
              <Field label="Km inclus / jour">
                <Input type="number" value={form.km_included_per_day} onChange={(v) => setForm({ ...form, km_included_per_day: v })} />
              </Field>
              <Field label="Km supplémentaire (DZD)">
                <Input type="number" value={form.extra_km_rate} onChange={(v) => setForm({ ...form, extra_km_rate: v })} />
              </Field>
            </div>
          </section>

          {/* Photos (URL inputs — proper upload comes Phase 2) */}
          <section>
            <Subhead>Photos (URLs)</Subhead>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Saisissez jusqu&apos;à 3 URLs. Upload direct disponible en Phase 2.
            </p>
            <div className="mt-3 space-y-2">
              <Input value={photo1} onChange={setPhoto1} placeholder="https://…/photo-1.jpg" />
              <Input value={photo2} onChange={setPhoto2} placeholder="https://…/photo-2.jpg" />
              <Input value={photo3} onChange={setPhoto3} placeholder="https://…/photo-3.jpg" />
            </div>
          </section>

          {/* Description */}
          <section>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Notes optionnelles (équipements, état, restrictions…)"
                className="w-full px-3 py-2 rounded-lg text-sm transition resize-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </Field>
          </section>

          {error && (
            <p
              className="px-3 py-2 rounded-xl text-sm"
              style={{
                background: 'rgba(244,63,94,0.10)',
                border: '1px solid rgba(244,63,94,0.25)',
                color: '#fb7185',
              }}
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Form atoms ────────────────────────────────────────────────────

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </p>
  )
}

function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, type = 'text', placeholder, required,
}: {
  value:        string
  onChange:     (v: string) => void
  type?:        string
  placeholder?: string
  required?:    boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full h-10 px-3 rounded-lg text-sm transition"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  )
}

function Select({
  value, onChange, children,
}: {
  value:    string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 px-3 rounded-lg text-sm transition"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </select>
  )
}
