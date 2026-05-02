'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentShowroomId } from '@/lib/auth'
import { VEHICLE_STATUS_LABELS, type Vehicle } from '@/lib/types'
import { ALGERIA_BRANDS, MODELS_BY_BRAND, YEARS, type Brand } from '@/lib/vehicle-catalog'
import { generateUniqueVehicleReference } from '@/lib/vehicle-reference'
// Brand kept for the modal's known-brand model dropdown; filter uses dynamic DB values.
import {
  Car, Plus, MoreVertical, Loader2, Search, User,
  Pencil, Camera, ClipboardList, Trash2, X,
} from 'lucide-react'

type LeadLite = { id: string; full_name: string; phone: string | null; wilaya?: string | null }

// ── Helpers ─────────────────────────────────────────────────
function formatPrice(p: number | null) {
  if (!p) return '—'
  return new Intl.NumberFormat('fr-DZ', { style: 'decimal', maximumFractionDigits: 0 }).format(p) + ' DZD'
}

function formatDateFr(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function stockPill(status: Vehicle['status']) {
  if (status === 'available') return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20', label: 'Disponible' }
  if (status === 'reserved')  return { cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 border-orange-200/60 dark:border-orange-500/30', label: 'Réservé' }
  return { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/30', label: 'Vendu' }
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === '42703' || e.code === 'PGRST204') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('image_url') ||
    msg.includes('reserved_by_lead_id') ||
    msg.includes('kilometrage') ||
    msg.includes('etat_carrosserie') ||
    msg.includes('finition') ||
    msg.includes('carte_grise') ||
    msg.includes('type_moteur') ||
    msg.includes('motorisation') ||
    msg.includes('reference') ||
    (msg.includes('column') && msg.includes('does not exist'))
  )
}

// The old blanket-strip retry path (`stripVehicleDetailKeys` +
// `VEHICLE_DETAIL_KEYS`) used to drop EVERY detail column on a single
// missing-column error, silently destroying the user's edits to
// kilometrage / etat_carrosserie / motorisation / etc. Replaced by
// `updateVehicleResilient` / `insertVehicleResilient` below, which strip
// only the offending column at each retry iteration.

// ── Column-precise retry helpers ────────────────────────────────────
// PostgREST returns a missing-column error of the form:
//   "Could not find the 'foo' column of 'vehicles' in the schema cache"
// When that fires for a single column (e.g. `motorisation` in a stale
// schema cache), we want to drop ONLY that column and retry with the
// rest of the payload intact — not strip every detail key, which silently
// destroys the user's edits to kilometrage / etat_carrosserie / etc.
function extractMissingColumn(msg: string | undefined): string | null {
  if (!msg) return null
  // PGRST204 / similar — single-quoted column name.
  let m = msg.match(/Could not find the '([^']+)' column/i)
  if (m) return m[1]
  // Postgres native: column "foo" of relation "bar" does not exist
  m = msg.match(/column "([^"]+)" of relation/i)
  if (m) return m[1]
  // Postgres alt: column "foo" does not exist
  m = msg.match(/column "([^"]+)" does not exist/i)
  if (m) return m[1]
  return null
}

/**
 * Update vehicles row, dropping unknown columns one at a time on
 * missing-column errors. Returns:
 *   - the updated row (canonical, post-trigger) on success
 *   - the final error if retries exhausted
 *   - the list of stripped columns (for warnings)
 *
 * IMPORTANT: we add `.select('*').single()` so the response actually
 * reports the persisted row. Without it, an UPDATE that's filtered
 * out by RLS returns `{ error: null }` with zero rows changed — which
 * looks like success even though nothing was written. With `.single()`
 * we get a PostgREST PGRST116 error in that case ("no rows returned")
 * and surface it as a real failure.
 */
async function updateVehicleResilient(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ data: Vehicle | null; error: { message: string } | null; stripped: string[] }> {
  const stripped: string[] = []
  const working = { ...payload }
  for (let i = 0; i < 8; i++) {
    const res = await supabase
      .from('vehicles')
      .update(working)
      .eq('id', id)
      .select('*')
      .single()
    if (!res.error) {
      return { data: (res.data as Vehicle | null) ?? null, error: null, stripped }
    }
    const col = extractMissingColumn(res.error.message)
    if (!col || !(col in working)) {
      return { data: null, error: res.error, stripped }
    }
    delete working[col]
    stripped.push(col)
    console.warn(`[vehicles] column "${col}" missing in DB; retrying without it`)
  }
  return {
    data: null,
    error: { message: 'Trop de colonnes manquantes — vérifiez la migration.' },
    stripped,
  }
}

async function insertVehicleResilient(
  payload: Record<string, unknown>,
): Promise<{ data: Vehicle | null; error: { message: string } | null; stripped: string[] }> {
  const stripped: string[] = []
  const working = { ...payload }
  for (let i = 0; i < 8; i++) {
    const res = await supabase
      .from('vehicles')
      .insert([working])
      .select('*')
      .single()
    if (!res.error) {
      return { data: (res.data as Vehicle | null) ?? null, error: null, stripped }
    }
    const col = extractMissingColumn(res.error.message)
    if (!col || !(col in working)) {
      return { data: null, error: res.error, stripped }
    }
    delete working[col]
    stripped.push(col)
    console.warn(`[vehicles] column "${col}" missing in DB; retrying without it`)
  }
  return {
    data: null,
    error: { message: 'Trop de colonnes manquantes — vérifiez la migration.' },
    stripped,
  }
}

// ── Add / Edit Vehicle Modal ─────────────────────────────────
function AddVehicleModal({
  open, onClose, onSaved, initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: (savedRow?: Vehicle) => void
  initial?: Vehicle
}) {
  const isEdit = !!initial
  const currentYear = new Date().getFullYear()
  const defaultYear = (YEARS as readonly number[]).includes(currentYear) ? currentYear : YEARS[0]

  const seedForm = () => {
    if (initial) {
      // Preserve whatever brand string is in the DB — even if it's a custom one.
      const brand = initial.brand
      return {
        brand,
        model: initial.model,
        year: String(initial.year ?? defaultYear),
        color: initial.color ?? '',
        price_dzd: initial.price_dzd != null ? String(initial.price_dzd) : '',
        status: initial.status,
        kilometrage: initial.kilometrage != null ? String(initial.kilometrage) : '',
        etat_carrosserie: initial.etat_carrosserie ?? '',
        finition: initial.finition ?? '',
        carte_grise: initial.carte_grise ?? '',
        type_moteur: initial.type_moteur ?? 'Essence',
        motorisation: initial.motorisation ?? '',
      }
    }
    // Empty defaults — user must pick or add a brand/model.
    return {
      brand: '',
      model: '',
      year: String(defaultYear),
      color: '',
      price_dzd: '',
      status: 'available' as Vehicle['status'],
      kilometrage: '',
      etat_carrosserie: '',
      finition: '',
      carte_grise: '',
      type_moteur: 'Essence',
      motorisation: '',
    }
  }

  const [form, setForm] = useState(seedForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  // Toggles for the "+ / x" custom-entry pattern.
  const [customBrandMode, setCustomBrandMode] = useState(false)
  const [customModelMode, setCustomModelMode] = useState(false)

  // Reseed when opened with a different vehicle
  useEffect(() => {
    if (open) {
      const seeded = seedForm()
      setForm(seeded)
      setError('')
      // When editing a vehicle whose brand/model aren't in the catalog, start in custom mode.
      const knownBrand = (ALGERIA_BRANDS as readonly string[]).includes(seeded.brand)
      const knownModel = knownBrand
        ? (MODELS_BY_BRAND[seeded.brand as Brand] ?? []).includes(seeded.model)
        : false
      setCustomBrandMode(!!seeded.brand && !knownBrand)
      setCustomModelMode(!!seeded.model && knownBrand && !knownModel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  // Custom brand = the user toggled "+ " on the brand field, or the brand isn't in the catalog.
  const isKnownBrand = !customBrandMode && (ALGERIA_BRANDS as readonly string[]).includes(form.brand)
  const modelOptions = isKnownBrand
    ? (MODELS_BY_BRAND[form.brand as Brand] ?? ['Autre'])
    : []
  // Force a text input for the model whenever the brand isn't a known one,
  // or when the user explicitly toggled "+ " on the model field.
  const useTextForModel = !isKnownBrand || customModelMode

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.brand || !form.model) { setError('Marque et modèle sont requis.'); return }
    setSaving(true)
    const payload: Record<string, unknown> = {
      brand:            form.brand,
      model:            form.model.trim(),
      year:             form.year ? parseInt(form.year) : null,
      color:            form.color || null,
      price_dzd:        form.price_dzd ? parseFloat(form.price_dzd.replace(/\s/g, '')) : null,
      status:           form.status,
      kilometrage:      form.kilometrage ? parseInt(form.kilometrage.replace(/\s/g, ''), 10) : null,
      etat_carrosserie: form.etat_carrosserie.trim() || null,
      finition:         form.finition.trim() || null,
      carte_grise:      form.carte_grise.trim() || null,
      type_moteur:      form.type_moteur || null,
      motorisation:     form.motorisation.trim() || null,
    }

    let err: { message: string } | null = null
    let stripped: string[] = []
    let savedRow: Vehicle | null = null
    if (isEdit && initial) {
      // Column-precise retry: drops only the SPECIFIC missing column at
      // each iteration so the rest of the user's edits go through. The
      // returned `.select('*').single()` ensures we detect 0-rows-affected
      // (RLS rejection or row gone).
      const res = await updateVehicleResilient(initial.id, payload)
      err = res.error
      stripped = res.stripped
      savedRow = res.data
    } else {
      // Multi-tenant: stamp showroom_id on every new vehicle.
      const showroomId = await getCurrentShowroomId()
      if (!showroomId) {
        setSaving(false)
        setError("Aucun showroom associé à votre compte. Contactez l'administrateur.")
        return
      }
      payload.showroom_id = showroomId
      payload.reserved_by_lead_id = null
      // Auto-generate the reference on every new vehicle.
      payload.reference = await generateUniqueVehicleReference(
        form.brand,
        form.year ? parseInt(form.year) : null
      )
      const res = await insertVehicleResilient(payload)
      err = res.error
      stripped = res.stripped
      savedRow = res.data
    }

    setSaving(false)
    if (err) { setError(err.message); return }

    // If columns had to be stripped to succeed, surface a visible warning so
    // the operator knows their DB schema is behind and the user's edit to
    // that field was NOT persisted. Reference / reserved_by_lead_id are
    // expected when running on an older DB and don't matter for the user.
    if (stripped.length > 0) {
      const ignorable = new Set(['reserved_by_lead_id', 'reference'])
      const meaningful = stripped.filter(c => !ignorable.has(c))
      if (meaningful.length > 0) {
        console.warn(
          '[vehicles] saved without these columns (DB schema out of date):',
          meaningful.join(', '),
        )
        alert(
          'Champs ignorés (la migration n\'est pas encore exécutée en base) : ' +
          meaningful.join(', ') + '. Exécutez les migrations en attente dans Supabase.'
        )
      }
    }

    // (canonical row will be passed below via onSaved)
    if (!isEdit) {
      setForm({
        brand: '',
        model: '',
        year: String(defaultYear),
        color: '',
        price_dzd: '',
        status: 'available',
        kilometrage: '',
        etat_carrosserie: '',
        finition: '',
        carte_grise: '',
        type_moteur: 'Essence',
        motorisation: '',
      })
      setCustomBrandMode(false)
      setCustomModelMode(false)
    }
    setError('')
    // Hand the canonical (post-trigger) row back to the parent so it can
    // update its list directly without waiting for a refetch (which can
    // race with stale PostgREST caches and make the user think their
    // edit was lost).
    if (savedRow) onSaved(savedRow)
    else onSaved()
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Marque *</label>
              <div className="flex items-center gap-1.5">
                {customBrandMode ? (
                  <input
                    autoFocus
                    value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Nouvelle marque"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  />
                ) : (
                  <select
                    value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value, model: '' }))}
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  >
                    <option value="">Choisir une marque</option>
                    {ALGERIA_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (customBrandMode) {
                      // Cancel custom mode → back to dropdown, clear value.
                      setCustomBrandMode(false)
                      setForm(f => ({ ...f, brand: '', model: '' }))
                      setCustomModelMode(false)
                    } else {
                      setCustomBrandMode(true)
                      setForm(f => ({ ...f, brand: '', model: '' }))
                      setCustomModelMode(false)
                    }
                  }}
                  className="shrink-0 w-9 h-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition flex items-center justify-center"
                  aria-label={customBrandMode ? 'Annuler la saisie personnalisée' : 'Ajouter une marque personnalisée'}
                  title={customBrandMode ? 'Annuler' : 'Ajouter une marque personnalisée'}
                >
                  {customBrandMode ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Modèle *</label>
              <div className="flex items-center gap-1.5">
                {useTextForModel ? (
                  <input
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="ex. Modèle X"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  />
                ) : (
                  <select
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  >
                    <option value="">Choisir un modèle</option>
                    {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                {/* The toggle only matters when the brand is known — for a custom brand
                    the model is already a free-text input. */}
                {isKnownBrand ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (customModelMode) {
                        setCustomModelMode(false)
                        setForm(f => ({ ...f, model: '' }))
                      } else {
                        setCustomModelMode(true)
                        setForm(f => ({ ...f, model: '' }))
                      }
                    }}
                    className="shrink-0 w-9 h-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition flex items-center justify-center"
                    aria-label={customModelMode ? 'Annuler la saisie personnalisée' : 'Ajouter un modèle personnalisé'}
                    title={customModelMode ? 'Annuler' : 'Ajouter un modèle personnalisé'}
                  >
                    {customModelMode ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                ) : (
                  <span className="shrink-0 w-9 h-9" aria-hidden />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Année</label>
              <select
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Couleur</label>
              <input
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                placeholder="ex. Blanc Perle"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prix (DZD)</label>
              <input
                value={form.price_dzd}
                onChange={e => setForm(f => ({ ...f, price_dzd: e.target.value }))}
                placeholder="ex. 3850000"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Statut</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as Vehicle['status'] }))}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Réservé</option>
                <option value="sold">Vendu</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Kilométrage</label>
              <input
                type="number"
                min={0}
                value={form.kilometrage}
                onChange={e => setForm(f => ({ ...f, kilometrage: e.target.value }))}
                placeholder="ex. 45000 km"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type du moteur</label>
              <select
                value={form.type_moteur}
                onChange={e => setForm(f => ({ ...f, type_moteur: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              >
                <option value="Essence">Essence</option>
                <option value="Essence/Hybride">Essence/Hybride</option>
                <option value="Diesel">Diesel</option>
                <option value="Électrique">Électrique</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">État de la carrosserie</label>
              <input
                value={form.etat_carrosserie}
                onChange={e => setForm(f => ({ ...f, etat_carrosserie: e.target.value }))}
                placeholder="ex. Excellent, Rayures légères"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Motorisation</label>
              <input
                value={form.motorisation}
                onChange={e => setForm(f => ({ ...f, motorisation: e.target.value }))}
                placeholder="ex. 1.0 TCe, 1.5 TSi, 2.0 TDi"
                maxLength={50}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Finition</label>
              <input
                value={form.finition}
                onChange={e => setForm(f => ({ ...f, finition: e.target.value }))}
                placeholder="ex. GT Line, Allure, Confort"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Carte grise</label>
              <input
                value={form.carte_grise}
                onChange={e => setForm(f => ({ ...f, carte_grise: e.target.value }))}
                placeholder="ex. Saida, En cours"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60">
              {saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Ajouter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Reserved-by modal ────────────────────────────────────────
function ReservedByModal({
  vehicle, onConfirm, onCancel,
}: {
  vehicle: Vehicle
  onConfirm: (lead: LeadLite) => void | Promise<void>
  onCancel: () => void
}) {
  const [leads, setLeads] = useState<LeadLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone, wilaya')
        .order('created_at', { ascending: false })
        .limit(200)
      if (!cancelled) {
        setLeads((data ?? []) as LeadLite[])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return leads
    return leads.filter(l =>
      l.full_name.toLowerCase().includes(q) ||
      (l.phone ?? '').toLowerCase().includes(q) ||
      (l.wilaya ?? '').toLowerCase().includes(q)
    )
  }, [leads, debouncedSearch])

  const selected = leads.find(l => l.id === selectedId) ?? null

  async function handleConfirm() {
    if (!selected) return
    setSubmitting(true)
    await onConfirm(selected)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Réservé par quel client ?</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {vehicle.brand} {vehicle.model} {vehicle.year ?? ''}
          </p>
        </div>

        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
          </div>
        </div>

        <div className="px-3 pb-3">
          <div className="max-h-80 overflow-y-auto rounded-lg">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun client trouvé.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map(l => {
                  const isSel = l.id === selectedId
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(l.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition rounded-md ${isSel ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {initialsOf(l.full_name) || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{l.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {l.phone ?? '—'}{l.wilaya ? ` · ${l.wilaya}` : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-50"
          >
            {submitting ? 'Enregistrement…' : 'Confirmer la réservation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vehicle Details Modal ────────────────────────────────────
function VehicleDetailsModal({
  vehicle, lead, onClose,
}: {
  vehicle: Vehicle
  lead: LeadLite | null
  onClose: () => void
}) {
  const stock = stockPill(vehicle.status)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {vehicle.brand} {vehicle.model}{vehicle.year ? ` ${vehicle.year}` : ''}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div className="aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-muted/60 to-muted/20 flex items-center justify-center">
            {vehicle.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vehicle.image_url} alt={`${vehicle.brand} ${vehicle.model}`} className="w-full h-full object-cover" />
            ) : (
              <Car className="w-16 h-16 text-muted-foreground/40" />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <DetailField label="Marque" value={vehicle.brand} />
            <DetailField label="Modèle" value={vehicle.model} />
            <DetailField label="Année" value={vehicle.year ? String(vehicle.year) : '—'} />
            <DetailField label="Couleur" value={vehicle.color ?? '—'} />
            <DetailField label="VIN" value={vehicle.vin ?? '—'} />
            <DetailField label="Prix" value={formatPrice(vehicle.price_dzd)} />
            <DetailField
              label="Kilométrage"
              value={vehicle.kilometrage != null ? `${new Intl.NumberFormat('fr-DZ').format(vehicle.kilometrage)} km` : '—'}
            />
            <DetailField label="Type du moteur" value={vehicle.type_moteur ?? '—'} />
            <DetailField label="Finition" value={vehicle.finition ?? '—'} />
            <DetailField label="État de la carrosserie" value={vehicle.etat_carrosserie ?? '—'} />
            <DetailField label="Motorisation" value={vehicle.motorisation ?? '—'} />
            <DetailField label="Carte grise" value={vehicle.carte_grise ?? '—'} />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Statut</p>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stock.cls}`}>
                {stock.label}
              </span>
            </div>
            <DetailField label="Créé le" value={formatDateFr(vehicle.created_at)} />
          </div>

          {vehicle.status === 'reserved' && lead && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Réservé par</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {initialsOf(lead.full_name) || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{lead.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{lead.phone ?? '—'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</p>
      <p className="text-sm text-foreground break-words">{value}</p>
    </div>
  )
}

// ── Confirm delete dialog ────────────────────────────────────
function ConfirmDeleteDialog({
  vehicle, onConfirm, onCancel, busy,
}: {
  vehicle: Vehicle
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-sm">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Supprimer ce véhicule ?</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {vehicle.brand} {vehicle.model} {vehicle.year ?? ''}
          </p>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-semibold transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vehicle Card Menu ────────────────────────────────────────
function VehicleCardMenu({
  vehicle: _vehicle,
  isOpen,
  onOpenChange,
  onEdit,
  onChangePhoto,
  onViewDetails,
  onDelete,
}: {
  vehicle: Vehicle
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onChangePhoto: () => void
  onViewDetails: () => void
  onDelete: () => void
}) {
  void _vehicle
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect && typeof window !== 'undefined') {
      setOpenUp(window.innerHeight - rect.bottom < 240)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (menuRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      onOpenChange(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onOpenChange])

  const itemCls = 'flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted w-full text-left'

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute z-20 w-52 right-0 rounded-lg border border-border bg-card shadow-xl py-1 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => { onOpenChange(false); onEdit() }}
          >
            <Pencil className="w-4 h-4" />
            Modifier
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => { onOpenChange(false); onChangePhoto() }}
          >
            <Camera className="w-4 h-4" />
            Changer la photo
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => { onOpenChange(false); onViewDetails() }}
          >
            <ClipboardList className="w-4 h-4" />
            Voir les détails
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 w-full text-left"
            onClick={() => { onOpenChange(false); onDelete() }}
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}

// ── Vehicle card (extracted to keep hooks clean) ─────────────
function VehicleCard({
  v, lead, menuOpenId, setMenuOpenId,
  onImageUpdated, onStatusChangeRequest, onImmediateStatusChange,
  onEdit, onViewDetails, onDelete,
  isExpanded, onToggleExpand,
}: {
  v: Vehicle
  lead: LeadLite | null
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onImageUpdated: (id: string, url: string) => void
  onStatusChangeRequest: (v: Vehicle, next: Vehicle['status']) => void
  onImmediateStatusChange: (v: Vehicle, next: Vehicle['status']) => Promise<void>
  onEdit: (v: Vehicle) => void
  onViewDetails: (v: Vehicle) => void
  onDelete: (v: Vehicle) => void
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const stock = stockPill(v.status)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const prev = v.image_url
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${v.id}/${Date.now()}-${safeFilename}`

    setUploading(true)
    setImgError(null)
    const { error: upErr } = await supabase.storage
      .from('vehicules')
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (upErr) {
      setUploading(false)
      setImgError(upErr.message)
      alert(`Erreur upload : ${upErr.message}`)
      return
    }
    const { data: pub } = supabase.storage.from('vehicules').getPublicUrl(path)
    const publicUrl = pub.publicUrl

    // Optimistic
    onImageUpdated(v.id, publicUrl)

    let { error: updErr } = await supabase
      .from('vehicles')
      .update({ image_url: publicUrl })
      .eq('id', v.id)

    if (updErr && isMissingColumnError(updErr)) {
      // column missing — revert and warn
      onImageUpdated(v.id, prev ?? '')
      setImgError('Colonne image_url manquante. Exécutez migration_04.')
      alert('La colonne image_url n\'existe pas encore. Exécutez migration_04_vehicles_images.sql dans Supabase.')
      updErr = null
    } else if (updErr) {
      onImageUpdated(v.id, prev ?? '')
      setImgError(updErr.message)
      alert(`Erreur DB : ${updErr.message}`)
    }

    setUploading(false)
  }

  const isMenuOpen = menuOpenId === v.id

  // Subtle elevation + scale lift while expanded so the active card pops
  // out of the grid. The body itself becomes a button-like region for
  // the toggle (minus the image / menu, which retain their own clicks).
  return (
    <div
      className={
        'rounded-xl overflow-hidden bg-card border transition-all duration-300 flex flex-col ' +
        (isExpanded
          ? 'border-primary/60 shadow-xl shadow-primary/10 scale-[1.01] z-10 relative'
          : 'border-border hover:border-primary/40')
      }
    >
      {/* Image area (click to upload) */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative aspect-[4/3] bg-gradient-to-br from-muted/60 to-muted/20 flex items-center justify-center overflow-hidden cursor-pointer"
        aria-label="Changer l'image"
      >
        {v.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.image_url} alt={`${v.brand} ${v.model}`} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Car className="w-14 h-14 text-muted-foreground/40" />
        )}

        {v.status === 'reserved' && (
          <span className="absolute top-2 right-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/90 text-white z-10">
            Réservé
          </span>
        )}

        {/* Hover hint */}
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-[11px] text-foreground opacity-0 group-hover:opacity-100 transition pointer-events-none">
          {v.image_url ? "Changer l'image" : 'Ajouter une image'}
        </span>

        {uploading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-20">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
      </button>

      {imgError && (
        <p className="px-4 pt-2 text-[11px] text-red-500">{imgError}</p>
      )}

      {/* Body. Click anywhere here (except interactive children) toggles
          the expanded view. Buttons / selects inside stop propagation so
          they don't accidentally toggle. */}
      <div
        className="p-4 flex-1 flex flex-col cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpand()
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
              {v.brand} {v.model}{v.year ? ` ${v.year}` : ''}
            </h3>
            {v.reference && (
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5 tracking-wide">
                {v.reference}
              </p>
            )}
            <p className="text-sm font-bold text-foreground mt-1">{formatPrice(v.price_dzd)}</p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <VehicleCardMenu
              vehicle={v}
              isOpen={isMenuOpen}
              onOpenChange={(open) => setMenuOpenId(open ? v.id : null)}
              onEdit={() => onEdit(v)}
              onChangePhoto={() => fileRef.current?.click()}
              onViewDetails={() => onViewDetails(v)}
              onDelete={() => onDelete(v)}
            />
          </div>
        </div>

        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-muted-foreground">
            Carburant : {v.type_moteur ?? '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            Kilométrage : {v.kilometrage != null ? `${new Intl.NumberFormat('fr-DZ').format(v.kilometrage)} km` : '—'}
          </p>
          {v.finition && (
            <p className="text-xs text-muted-foreground">Finition : {v.finition}</p>
          )}
          {v.etat_carrosserie && (
            <p className="text-xs text-muted-foreground">Carrosserie : {v.etat_carrosserie}</p>
          )}
          {v.carte_grise && (
            <p className="text-xs text-muted-foreground">Carte grise : {v.carte_grise}</p>
          )}
          <p className="text-xs text-muted-foreground">Couleur : {v.color ?? '—'}</p>
        </div>

        {(v.status === 'reserved' || v.status === 'sold') && lead && (
          <div className="mt-3">
            <span
              title={lead.phone ? `${lead.full_name} · ${lead.phone}` : lead.full_name}
              className={`inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 ${
                v.status === 'reserved'
                  ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              <User className="w-3 h-3" />
              {v.status === 'reserved' ? 'Réservé' : 'Vendu'} · {lead.full_name}
            </span>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${stock.cls}`}>
            {stock.label}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Géré par le suivi du prospect
          </span>
        </div>

        {/* ── Expanded details section ──────────────────────────────
            Animated reveal: collapses with a max-height + opacity
            transition. The thin accent line at the top fades-in
            after a short delay so the eye lands on the new content.
            All extra fields render only when filled — except when
            EVERY extra field is empty, in which case we show a
            single muted note so the user understands there's
            nothing more to see. */}
        {(() => {
          const extras: Array<{ label: string; value: string | null | undefined }> = [
            { label: 'Motorisation',    value: v.motorisation },
            { label: 'Type moteur',     value: v.type_moteur },
            { label: 'Carrosserie',     value: v.etat_carrosserie },
            { label: 'Finition',        value: v.finition },
            { label: 'Carte grise',     value: v.carte_grise },
          ]
          const filled = extras.filter(e => e.value && String(e.value).trim().length > 0)
          return (
            <div
              className="overflow-hidden transition-[max-height,opacity,transform] motion-reduce:transition-none ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{
                maxHeight: isExpanded ? 480 : 0,
                opacity:   isExpanded ? 1 : 0,
                transform: isExpanded
                  ? 'scaleY(1) translateY(0)'
                  : 'scaleY(0.95) translateY(-8px)',
                transformOrigin: 'top',
                transitionDuration: isExpanded ? '350ms' : '250ms',
              }}
              aria-hidden={!isExpanded}
            >
              {/* Animated accent line — width grows after a short delay
                  so it reads as a separator that "draws itself in". */}
              <div className="mt-3 relative h-[2px] w-full bg-transparent">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-[width] ease-out"
                  style={{
                    width: isExpanded ? '100%' : '0%',
                    transitionDuration: '400ms',
                    transitionDelay: isExpanded ? '150ms' : '0ms',
                  }}
                />
              </div>

              <div className="pt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {filled.length === 0 ? (
                  <p className="col-span-2 text-[11px] text-muted-foreground italic">
                    Aucun détail supplémentaire renseigné.
                  </p>
                ) : (
                  filled.map((f) => (
                    <div key={f.label} className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </p>
                      <p className="text-xs text-foreground truncate" title={f.value ?? ''}>
                        {f.value}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
                className="mt-3 text-[11px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
              >
                Réduire <span aria-hidden="true">▲</span>
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function VehiculesPage() {
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([])
  const [loading,    setLoading]    = useState(true)
  const [marque,     setMarque]     = useState<string>('')
  const [modele,     setModele]     = useState('')
  const [annee,      setAnnee]      = useState('')
  const [statusFilter, setStatusFilter] = useState<Vehicle['status'] | ''>('')
  const [search, setSearch] = useState('')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [leadsById,  setLeadsById]  = useState<Record<string, LeadLite>>({})
  const [pendingReserve, setPendingReserve] = useState<Vehicle | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  // Only one card can be expanded at a time. Clicking another card auto-
  // collapses the current one. Expanding/collapsing is animated via CSS
  // max-height + opacity transitions inside VehicleCard.
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [viewing, setViewing] = useState<Vehicle | null>(null)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  async function fetchVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as Vehicle[]
    setVehicles(rows)
    setLoading(false)

    // Load lead names for reserved vehicles
    const ids = Array.from(new Set(
      rows.map(v => v.reserved_by_lead_id).filter((x): x is string => !!x)
    ))
    if (ids.length > 0) {
      const { data: ldata } = await supabase
        .from('leads')
        .select('id, full_name, phone')
        .in('id', ids)
      const map: Record<string, LeadLite> = {}
      for (const l of (ldata ?? []) as LeadLite[]) map[l.id] = l
      setLeadsById(prev => ({ ...prev, ...map }))
    }

    // Backfill: every existing vehicle without a reference gets one assigned.
    const missing = rows.filter((v) => !v.reference)
    if (missing.length > 0) {
      const updates = await Promise.all(
        missing.map(async (v) => {
          const ref = await generateUniqueVehicleReference(v.brand, v.year)
          const { error } = await supabase
            .from('vehicles')
            .update({ reference: ref })
            .eq('id', v.id)
          if (error) {
            // Column missing or some other DB issue — abort backfill silently.
            return null
          }
          return { id: v.id, reference: ref }
        })
      )
      const ok = updates.filter((x): x is { id: string; reference: string } => !!x)
      if (ok.length > 0) {
        const byId: Record<string, string> = {}
        for (const u of ok) byId[u.id] = u.reference
        setVehicles((prev) =>
          prev.map((v) => (byId[v.id] ? { ...v, reference: byId[v.id] } : v))
        )
      }
    }
  }

  useEffect(() => { fetchVehicles() }, [])

  // Pull unique marques/modèles directly from the DB rows so any custom brand
  // typed in the modal appears in the filters immediately after save.
  const brandOptionsForFilter = useMemo(() => {
    const set = new Set<string>()
    for (const v of vehicles) if (v.brand) set.add(v.brand)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [vehicles])

  const modelOptionsForFilter = useMemo(() => {
    const set = new Set<string>()
    for (const v of vehicles) {
      if (!v.model) continue
      if (marque && v.brand !== marque) continue
      set.add(v.model)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [vehicles, marque])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return vehicles.filter(v => {
      if (statusFilter && v.status !== statusFilter) return false
      if (marque && v.brand !== marque) return false
      if (modele && v.model !== modele) return false
      if (annee  && String(v.year ?? '') !== annee) return false
      if (term) {
        const hay = [
          v.reference, v.brand, v.model,
          v.year != null ? String(v.year) : '',
          v.color, v.finition,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [vehicles, statusFilter, marque, modele, annee, search])

  function handleImageUpdated(id: string, url: string) {
    setVehicles(prev => prev.map(x => x.id === id ? { ...x, image_url: url || null } : x))
  }

  async function handleImmediateStatusChange(v: Vehicle, next: Vehicle['status']) {
    const wasReserved = v.status === 'reserved'
    const previousLeadId = v.reserved_by_lead_id
    const payload: Record<string, unknown> = { status: next }
    if (wasReserved) payload.reserved_by_lead_id = null

    // optimistic
    setVehicles(prev => prev.map(x => x.id === v.id
      ? { ...x, status: next, reserved_by_lead_id: wasReserved ? null : x.reserved_by_lead_id }
      : x))

    let { error: err } = await supabase.from('vehicles').update(payload).eq('id', v.id)
    if (err && isMissingColumnError(err)) {
      const { reserved_by_lead_id: _omit, ...stripped } = payload
      void _omit
      const retry = await supabase.from('vehicles').update(stripped).eq('id', v.id)
      err = retry.error
    }
    if (err) {
      // revert
      setVehicles(prev => prev.map(x => x.id === v.id ? v : x))
      alert(`Erreur : ${err.message}`)
      return
    }

    // Side-effect: when un-reserving, log an activity on the previous lead.
    // Do NOT auto-change the lead's status — let the user handle it.
    if (wasReserved && previousLeadId) {
      const vehicleLabel = `${v.brand} ${v.model}${v.year ? ` ${v.year}` : ''}`.trim()
      const showroomId = await getCurrentShowroomId()
      const { error: actErr } = await supabase.from('activities').insert([{
        showroom_id: showroomId,
        lead_id:     previousLeadId,
        type:        'status_change',
        title:       'Réservation annulée',
        body:        `Réservation annulée pour ${vehicleLabel}`,
        done:        true,
      }])
      if (actErr) {
        console.warn('[vehicules] failed to log un-reservation activity:', actErr.message)
      }
    }
  }

  async function handleConfirmReservation(v: Vehicle, lead: LeadLite) {
    const payload: Record<string, unknown> = {
      status: 'reserved',
      reserved_by_lead_id: lead.id,
    }
    // optimistic
    setVehicles(prev => prev.map(x => x.id === v.id
      ? { ...x, status: 'reserved', reserved_by_lead_id: lead.id }
      : x))
    setLeadsById(prev => ({ ...prev, [lead.id]: lead }))

    let { error: err } = await supabase.from('vehicles').update(payload).eq('id', v.id)
    if (err && isMissingColumnError(err)) {
      const retry = await supabase.from('vehicles').update({ status: 'reserved' }).eq('id', v.id)
      err = retry.error
      if (!err) {
        alert('Statut mis à jour, mais la colonne reserved_by_lead_id est absente (exécutez migration_04).')
      }
    }
    if (err) {
      setVehicles(prev => prev.map(x => x.id === v.id ? v : x))
      alert(`Erreur : ${err.message}`)
      setPendingReserve(null)
      return
    }

    // Side-effects on successful reservation:
    // (1) bump the lead's status to 'proposal' ("Offre faite")
    // (2) log an activity on the lead
    const vehicleLabel = `${v.brand} ${v.model}${v.year ? ` ${v.year}` : ''}`.trim()

    const { error: leadErr } = await supabase
      .from('leads')
      .update({ status: 'proposal' })
      .eq('id', lead.id)
    if (leadErr) {
      console.warn('[vehicules] failed to update lead status to proposal:', leadErr.message)
    }

    const showroomId = await getCurrentShowroomId()
    const { error: actErr } = await supabase.from('activities').insert([{
      showroom_id: showroomId,
      lead_id:     lead.id,
      type:        'status_change',
      title:       'Véhicule réservé',
      body:        `${vehicleLabel} réservé pour ce client`,
      done:        true,
    }])
    if (actErr) {
      console.warn('[vehicules] failed to log reservation activity:', actErr.message)
    }

    setPendingReserve(null)
  }

  async function handleConfirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    // Best-effort storage cleanup
    if (deleting.image_url) {
      try {
        const url = deleting.image_url
        const marker = '/storage/v1/object/public/vehicules/'
        const idx = url.indexOf(marker)
        if (idx >= 0) {
          const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
          await supabase.storage.from('vehicules').remove([path])
        }
      } catch {
        // ignore
      }
    }
    const { error: err } = await supabase.from('vehicles').delete().eq('id', deleting.id)
    setDeletingBusy(false)
    if (err) {
      alert(`Erreur : ${err.message}`)
      return
    }
    setDeleting(null)
    await fetchVehicles()
  }

  const viewingLead = viewing && viewing.reserved_by_lead_id
    ? (leadsById[viewing.reserved_by_lead_id] ?? null)
    : null

  return (
    <div className="p-6 space-y-6">
      {/* Hero */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Inventaire des Véhicules</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2.5 font-semibold transition"
        >
          <Plus className="w-4 h-4" /> Ajouter un véhicule
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par référence, marque, modèle, année…"
          className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Marque</label>
          <select
            value={marque}
            onChange={e => {
              setMarque(e.target.value)
              setModele('')
            }}
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
          >
            <option value="">Toutes les marques</option>
            {brandOptionsForFilter.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Modèle</label>
          <select
            value={modele}
            onChange={e => setModele(e.target.value)}
            disabled={!marque}
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Tous les modèles</option>
            {modelOptionsForFilter.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Année</label>
          <select
            value={annee}
            onChange={e => setAnnee(e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
          >
            <option value="">Toutes les années</option>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Statut</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as Vehicle['status'] | '')}
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
          >
            <option value="">Tous les statuts</option>
            <option value="available">{VEHICLE_STATUS_LABELS.available}</option>
            <option value="reserved">{VEHICLE_STATUS_LABELS.reserved}</option>
            <option value="sold">{VEHICLE_STATUS_LABELS.sold}</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center flex flex-col items-center gap-3">
          <Car className="w-10 h-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium text-foreground">Aucun véhicule</p>
            <p className="text-xs text-muted-foreground mt-1">Aucun véhicule ne correspond à vos filtres.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map(v => (
            <VehicleCard
              key={v.id}
              v={v}
              lead={v.reserved_by_lead_id ? (leadsById[v.reserved_by_lead_id] ?? null) : null}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              onImageUpdated={handleImageUpdated}
              onStatusChangeRequest={(veh) => setPendingReserve(veh)}
              onImmediateStatusChange={handleImmediateStatusChange}
              onEdit={(veh) => setEditing(veh)}
              onViewDetails={(veh) => setViewing(veh)}
              onDelete={(veh) => setDeleting(veh)}
              isExpanded={expandedCardId === v.id}
              onToggleExpand={() =>
                setExpandedCardId((cur) => (cur === v.id ? null : v.id))
              }
            />
          ))}
        </div>
      )}

      {/* Saving via the modals: when the modal hands us the canonical row,
          we merge it into local state immediately (avoids any refetch race
          where a stale PostgREST cache would re-overwrite our values). On
          insert, the row is appended; on update, replaced in-place. We
          ALWAYS also fire fetchVehicles in the background so other derived
          fields (image cache busting, etc.) stay fresh. */}
      <AddVehicleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(saved) => {
          if (saved) {
            setVehicles(prev => [saved, ...prev.filter(v => v.id !== saved.id)])
          }
          fetchVehicles()
        }}
      />

      <AddVehicleModal
        open={!!editing}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          if (saved) {
            setVehicles(prev => prev.map(v => v.id === saved.id ? saved : v))
          }
          fetchVehicles()
        }}
      />

      {pendingReserve && (
        <ReservedByModal
          vehicle={pendingReserve}
          onCancel={() => setPendingReserve(null)}
          onConfirm={(lead) => handleConfirmReservation(pendingReserve, lead)}
        />
      )}

      {viewing && (
        <VehicleDetailsModal
          vehicle={viewing}
          lead={viewingLead}
          onClose={() => setViewing(null)}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          vehicle={deleting}
          busy={deletingBusy}
          onCancel={() => { if (!deletingBusy) setDeleting(null) }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
