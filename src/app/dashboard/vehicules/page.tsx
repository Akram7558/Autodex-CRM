'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { VEHICLE_STATUS_LABELS, type Vehicle } from '@/lib/types'
import { ALGERIA_BRANDS, MODELS_BY_BRAND, YEARS, type Brand } from '@/lib/vehicle-catalog'
import {
  Car, Plus, MoreVertical, Loader2, Search, User,
  Pencil, Camera, ClipboardList, Trash2,
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
  if (status === 'available') return { cls: 'bg-emerald-500/15 text-emerald-400', label: 'En stock' }
  if (status === 'reserved')  return { cls: 'bg-amber-500/15 text-amber-400',   label: 'Réservé' }
  return { cls: 'bg-red-500/15 text-red-400', label: 'Vendu' }
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === '42703' || e.code === 'PGRST204') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('image_url') || msg.includes('reserved_by_lead_id') || msg.includes('column') && msg.includes('does not exist')
}

// ── Add / Edit Vehicle Modal ─────────────────────────────────
function AddVehicleModal({
  open, onClose, onSaved, initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Vehicle
}) {
  const isEdit = !!initial
  const currentYear = new Date().getFullYear()
  const defaultYear = (YEARS as readonly number[]).includes(currentYear) ? currentYear : YEARS[0]

  const seedForm = () => {
    if (initial) {
      const brand = (ALGERIA_BRANDS as readonly string[]).includes(initial.brand)
        ? (initial.brand as Brand)
        : ('Renault' as Brand)
      const models = MODELS_BY_BRAND[brand] ?? ['Autre']
      const model = models.includes(initial.model) ? initial.model : models[0]
      return {
        brand,
        model,
        year: String(initial.year ?? defaultYear),
        color: initial.color ?? '',
        price_dzd: initial.price_dzd != null ? String(initial.price_dzd) : '',
        status: initial.status,
      }
    }
    return {
      brand: 'Renault' as Brand,
      model: MODELS_BY_BRAND['Renault'][0],
      year: String(defaultYear),
      color: '',
      price_dzd: '',
      status: 'available' as Vehicle['status'],
    }
  }

  const [form, setForm] = useState(seedForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Reseed when opened with a different vehicle
  useEffect(() => {
    if (open) {
      setForm(seedForm())
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const modelOptions = MODELS_BY_BRAND[form.brand] ?? ['Autre']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.brand || !form.model) { setError('Marque et modèle sont requis.'); return }
    setSaving(true)
    const payload: Record<string, unknown> = {
      brand:     form.brand,
      model:     form.model.trim(),
      year:      form.year ? parseInt(form.year) : null,
      color:     form.color || null,
      price_dzd: form.price_dzd ? parseFloat(form.price_dzd.replace(/\s/g, '')) : null,
      status:    form.status,
    }

    let err: { message: string } | null = null
    if (isEdit && initial) {
      const res = await supabase.from('vehicles').update(payload).eq('id', initial.id)
      err = res.error
    } else {
      payload.reserved_by_lead_id = null
      const res = await supabase.from('vehicles').insert([payload])
      err = res.error
      if (err && isMissingColumnError(err)) {
        const { reserved_by_lead_id: _omit, ...stripped } = payload
        void _omit
        const retry = await supabase.from('vehicles').insert([stripped])
        err = retry.error
      }
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    if (!isEdit) {
      setForm({
        brand: 'Renault',
        model: MODELS_BY_BRAND['Renault'][0],
        year: String(defaultYear),
        color: '',
        price_dzd: '',
        status: 'available',
      })
    }
    setError('')
    onSaved()
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md">
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
              <select
                value={form.brand}
                onChange={e => {
                  const brand = e.target.value as Brand
                  const firstModel = (MODELS_BY_BRAND[brand] ?? ['Autre'])[0]
                  setForm(f => ({ ...f, brand, model: firstModel }))
                }}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              >
                {ALGERIA_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Modèle *</label>
              <select
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              >
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
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

  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all duration-150 flex flex-col">
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

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
              {v.brand} {v.model}{v.year ? ` ${v.year}` : ''}
            </h3>
            <p className="text-sm font-bold text-foreground mt-1">{formatPrice(v.price_dzd)}</p>
          </div>
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

        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-muted-foreground">Transmission : —</p>
          <p className="text-xs text-muted-foreground">Carburant : {v.color ?? '—'}</p>
        </div>

        {v.status === 'reserved' && lead && (
          <div className="mt-3">
            <span
              title={lead.phone ? `${lead.full_name} · ${lead.phone}` : lead.full_name}
              className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-400 text-xs rounded-md px-2 py-1"
            >
              <User className="w-3 h-3" />
              Réservé · {lead.full_name}
            </span>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stock.cls}`}>
            {stock.label}
          </span>
          <select
            value={v.status}
            onChange={async e => {
              const next = e.target.value as Vehicle['status']
              if (next === v.status) return
              if (next === 'reserved') {
                onStatusChangeRequest(v, next)
              } else {
                await onImmediateStatusChange(v, next)
              }
            }}
            className="text-xs h-7 px-2 rounded-md bg-muted/40 border border-border text-muted-foreground outline-none focus:border-primary cursor-pointer"
            aria-label="Changer le statut"
          >
            <option value="available">{VEHICLE_STATUS_LABELS.available}</option>
            <option value="reserved">{VEHICLE_STATUS_LABELS.reserved}</option>
            <option value="sold">{VEHICLE_STATUS_LABELS.sold}</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function VehiculesPage() {
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([])
  const [loading,    setLoading]    = useState(true)
  const [marque,     setMarque]     = useState<'' | Brand>('')
  const [modele,     setModele]     = useState('')
  const [annee,      setAnnee]      = useState('')
  const [statusFilter, setStatusFilter] = useState<Vehicle['status'] | ''>('')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [leadsById,  setLeadsById]  = useState<Record<string, LeadLite>>({})
  const [pendingReserve, setPendingReserve] = useState<Vehicle | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
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
  }

  useEffect(() => { fetchVehicles() }, [])

  const modelOptionsForFilter = marque ? (MODELS_BY_BRAND[marque] ?? []) : []

  const filtered = useMemo(() => {
    return vehicles.filter(v => {
      if (statusFilter && v.status !== statusFilter) return false
      if (marque && v.brand !== marque) return false
      if (modele && v.model !== modele) return false
      if (annee  && String(v.year ?? '') !== annee) return false
      return true
    })
  }, [vehicles, statusFilter, marque, modele, annee])

  function handleImageUpdated(id: string, url: string) {
    setVehicles(prev => prev.map(x => x.id === id ? { ...x, image_url: url || null } : x))
  }

  async function handleImmediateStatusChange(v: Vehicle, next: Vehicle['status']) {
    const wasReserved = v.status === 'reserved'
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

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Marque</label>
          <select
            value={marque}
            onChange={e => {
              const next = e.target.value as '' | Brand
              setMarque(next)
              setModele('')
            }}
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
          >
            <option value="">Toutes les marques</option>
            {ALGERIA_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
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
            />
          ))}
        </div>
      )}

      <AddVehicleModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchVehicles} />

      <AddVehicleModal
        open={!!editing}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={fetchVehicles}
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
