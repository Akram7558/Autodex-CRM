'use client'
// ─────────────────────────────────────────────────────────────────────
// /dashboard/precommandes — owner / manager preorder vehicle CRUD.
// ─────────────────────────────────────────────────────────────────────
// Card-based layout that mirrors /dashboard/vehicules (commit 7e8b5e8):
//   • 4-col grid on desktop, 2 on tablet, 1 on mobile
//   • Photo or violet gradient placeholder (Package icon)
//   • Amber "📦 Pré-commande" pill on the photo
//   • Title (marque + modèle + année), price, basic specs, status badge
//   • Click body → expand: animated accent line + 2-col detail grid
//   • 3-dot menu (Modifier / Supprimer)
//
// Two new fields managed by migration_26_preorder_fields.sql:
//   • budget_dedouanement (DZD) — customs / clearance
//   • annee — model year (now required in the form)
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  Plus, Pencil, Trash2, X, Package, CheckCircle2,
  MoreVertical, Camera, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { PreorderVehicle } from '@/lib/types'

// ─── Form state ────────────────────────────────────────────────────

type Form = {
  id: string | null
  marque: string
  modele: string
  annee: string                  // string for <select>
  prix_estime: string
  budget_dedouanement: string
  description: string
  delai_livraison: string
  disponible: boolean
}

const empty: Form = {
  id: null,
  marque: '',
  modele: '',
  annee: '',
  prix_estime: '',
  budget_dedouanement: '',
  description: '',
  delai_livraison: '',
  disponible: true,
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

// ─── 3-dot card menu (mirrors VehicleCardMenu) ─────────────────────

function PreorderCardMenu({
  isOpen, onOpenChange, onEdit, onDelete,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef    = useRef<HTMLDivElement | null>(null)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect && typeof window !== 'undefined') {
      setOpenUp(window.innerHeight - rect.bottom < 200)
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
          className={`absolute z-20 w-44 right-0 rounded-lg border border-border bg-card shadow-xl py-1 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
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

// ─── Preorder card ─────────────────────────────────────────────────

function PreorderCard({
  p, isExpanded, onToggleExpand, menuOpenId, setMenuOpenId,
  onEdit, onDelete, onToggleAvailable, onImageUpdated,
}: {
  p: PreorderVehicle
  isExpanded: boolean
  onToggleExpand: () => void
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onEdit: (p: PreorderVehicle) => void
  onDelete: (p: PreorderVehicle) => void
  onToggleAvailable: (p: PreorderVehicle) => void
  onImageUpdated: (id: string, url: string | null) => void
}) {
  const isMenuOpen = menuOpenId === p.id
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)

  // Click-to-upload — same flow as VehicleCard.handleFile, but stores files
  // under `preorders/<id>/...` inside the existing `vehicules` bucket so we
  // don't need a new bucket / RLS policy.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setImgError('Format image requis (JPEG, PNG, WebP…).')
      return
    }

    const prev = p.image_url
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `preorders/${p.id}/${Date.now()}-${safeFilename}`

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

    // Optimistic — paint the new image immediately.
    onImageUpdated(p.id, publicUrl)

    // Persist via the API so all auth + tenant scoping flows through the
    // same path as the rest of the page (PATCH already supports image_url
    // since it's part of the original payload contract).
    const res = await fetch(`/api/preorder-vehicles/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: publicUrl }),
    })
    setUploading(false)
    if (!res.ok) {
      // Revert and surface the error.
      onImageUpdated(p.id, prev ?? null)
      const j = await res.json().catch(() => ({}))
      setImgError(j?.error ?? 'Erreur de mise à jour.')
      alert(`Erreur DB : ${j?.error ?? 'Erreur inconnue.'}`)
    }
  }

  return (
    <div
      className={
        'rounded-xl overflow-hidden bg-card border transition-all duration-300 flex flex-col ' +
        (isExpanded
          ? 'border-primary/60 shadow-xl shadow-primary/10 scale-[1.01] z-10 relative'
          : 'border-border hover:border-primary/40')
      }
    >
      {/* Image area — click to upload */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative aspect-[4/3] bg-gradient-to-br from-amber-100 via-amber-50 to-orange-50 dark:from-amber-500/15 dark:via-amber-500/5 dark:to-orange-500/10 flex items-center justify-center overflow-hidden cursor-pointer w-full"
        aria-label={p.image_url ? 'Modifier la photo' : 'Ajouter une photo'}
      >
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt={`${p.marque} ${p.modele}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Package className="w-10 h-10 text-amber-400/60 dark:text-amber-300/40" />
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700/80 dark:text-amber-300/80">
              <Camera className="w-3 h-3" /> Ajouter une photo
            </span>
          </div>
        )}

        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-500/90 text-white shadow-sm z-10 pointer-events-none">
          📦 Pré-commande
        </span>

        {/* Hover hint (only when an image already exists) */}
        {p.image_url && (
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-md bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] text-foreground opacity-0 group-hover:opacity-100 transition pointer-events-none">
            <Camera className="w-3 h-3" /> Modifier la photo
          </span>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-20">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
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
        <p className="px-3 pt-2 text-[10px] text-rose-600 dark:text-rose-400">{imgError}</p>
      )}

      {/* Body — clickable region for expand */}
      <div
        className="p-3 flex-1 flex flex-col cursor-pointer"
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
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-foreground leading-tight truncate">
              {p.marque} {p.modele}
              {p.annee ? <span className="text-muted-foreground font-normal"> · {p.annee}</span> : null}
            </h3>
            <p className="text-[13px] font-bold text-foreground mt-0.5">
              {p.prix_estime != null ? (
                <>{formatDzd(p.prix_estime)} <span className="text-[9px] font-medium text-muted-foreground">DZD</span></>
              ) : (
                <span className="text-muted-foreground font-normal text-xs">Prix sur demande</span>
              )}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <PreorderCardMenu
              isOpen={isMenuOpen}
              onOpenChange={(open) => setMenuOpenId(open ? p.id : null)}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
            />
          </div>
        </div>

        {/* Visible specs (only when filled) */}
        <div className="mt-1.5 space-y-0.5">
          {p.delai_livraison && (
            <p className="text-[11px] text-muted-foreground truncate">Délai : {p.delai_livraison}</p>
          )}
          {p.budget_dedouanement != null && (
            <p className="text-[11px] text-muted-foreground truncate">
              Dédouanement : {formatDzd(p.budget_dedouanement)} <span className="text-[9px]">DZD</span>
            </p>
          )}
        </div>

        {/* Divider + status row */}
        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAvailable(p) }}
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border transition',
              p.disponible
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25',
            )}
            title="Cliquer pour basculer la disponibilité"
          >
            {p.disponible ? 'Disponible' : 'Indisponible'}
          </button>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Pré-commande
          </span>
        </div>

        {/* Expanded section — same animation as VehicleCard */}
        {(() => {
          const extras: Array<{ label: string; value: string | null | undefined }> = [
            { label: 'Année',                value: p.annee != null ? String(p.annee) : null },
            { label: 'Délai de livraison',   value: p.delai_livraison },
            { label: 'Prix estimé',          value: p.prix_estime != null ? `${formatDzd(p.prix_estime)} DZD` : null },
            { label: 'Budget dédouanement',  value: p.budget_dedouanement != null ? `${formatDzd(p.budget_dedouanement)} DZD` : null },
          ]
          const filled = extras.filter(e => e.value && String(e.value).trim().length > 0)

          return (
            <div
              className="overflow-hidden transition-[max-height,opacity,transform] motion-reduce:transition-none ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{
                maxHeight: isExpanded ? 600 : 0,
                opacity:   isExpanded ? 1 : 0,
                transform: isExpanded
                  ? 'scaleY(1) translateY(0)'
                  : 'scaleY(0.95) translateY(-8px)',
                transformOrigin: 'top',
                transitionDuration: isExpanded ? '350ms' : '250ms',
              }}
              aria-hidden={!isExpanded}
            >
              {/* Animated accent line */}
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

              {/* Description (full text) */}
              {p.description && (
                <div className="pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Description
                  </p>
                  <p className="text-xs text-foreground mt-0.5 whitespace-pre-line">{p.description}</p>
                </div>
              )}

              <div className={cn(
                'pt-3 grid grid-cols-2 gap-x-4 gap-y-2',
                p.description && 'mt-1',
              )}>
                {filled.length === 0 && !p.description ? (
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

// ─── Main page ─────────────────────────────────────────────────────

export default function PrecommandesPage() {
  const [rows, setRows]           = useState<PreorderVehicle[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm]           = useState<Form | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [toast, setToast]         = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PreorderVehicle | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // Year options: 2023 → 2027 (per spec).
  const yearOpts = useMemo(() => [2023, 2024, 2025, 2026, 2027], [])

  async function fetchAll() {
    setLoading(true); setLoadError('')
    const res = await fetch('/api/preorder-vehicles')
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Erreur de chargement.')
      setRows([])
      return
    }
    setRows((json.preorders ?? []) as PreorderVehicle[])
  }
  useEffect(() => { fetchAll() }, [])

  function openCreate() {
    setError('')
    setForm({ ...empty })
  }
  function openEdit(p: PreorderVehicle) {
    setError('')
    setForm({
      id:                  p.id,
      marque:              p.marque,
      modele:              p.modele,
      annee:               p.annee != null ? String(p.annee) : '',
      prix_estime:         p.prix_estime != null ? String(p.prix_estime) : '',
      budget_dedouanement: p.budget_dedouanement != null ? String(p.budget_dedouanement) : '',
      description:         p.description ?? '',
      delai_livraison:     p.delai_livraison ?? '',
      disponible:          p.disponible,
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    if (!form.marque.trim()) { setError('Marque requise.'); return }
    if (!form.modele.trim()) { setError('Modèle requis.'); return }
    if (!form.annee)         { setError('Année requise.'); return }
    setSaving(true)
    const payload = {
      marque:              form.marque.trim(),
      modele:              form.modele.trim(),
      annee:               form.annee || null,
      prix_estime:         form.prix_estime ? Number(form.prix_estime.replace(/\s/g, '')) : null,
      budget_dedouanement: form.budget_dedouanement ? Number(form.budget_dedouanement.replace(/\s/g, '')) : null,
      description:         form.description.trim() || null,
      delai_livraison:     form.delai_livraison.trim() || null,
      disponible:          form.disponible,
      // image_url is intentionally NOT in this payload — it's managed by
      // the click-to-upload flow on the card itself, not the modal.
    }
    const res = form.id
      ? await fetch(`/api/preorder-vehicles/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/preorder-vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json?.error ?? 'Erreur lors de la sauvegarde.'); return }
    setForm(null)
    flashToast(form.id ? 'Pré-commande mise à jour' : 'Pré-commande créée')
    fetchAll()
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeletingBusy(true)
    const res = await fetch(`/api/preorder-vehicles/${confirmDelete.id}`, { method: 'DELETE' })
    setDeletingBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    setConfirmDelete(null)
    flashToast('Pré-commande supprimée')
    fetchAll()
  }

  function handleImageUpdated(id: string, url: string | null) {
    setRows((prev) => prev.map(r => r.id === id ? { ...r, image_url: url } : r))
  }

  async function toggleAvailable(p: PreorderVehicle) {
    const next = !p.disponible
    setRows((cur) => cur.map(r => r.id === p.id ? { ...r, disponible: next } : r))
    const res = await fetch(`/api/preorder-vehicles/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: next }),
    })
    if (!res.ok) {
      // Revert on failure.
      setRows((cur) => cur.map(r => r.id === p.id ? { ...r, disponible: p.disponible } : r))
      const j = await res.json().catch(() => ({}))
      flashToast(j?.error ?? 'Erreur de mise à jour.')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight inline-flex items-center gap-2">
            <Package className="w-7 h-7 text-amber-500" />
            Véhicules en Pré-commande
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les véhicules que vous pouvez importer pour vos clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2.5 font-semibold transition"
        >
          <Plus className="w-4 h-4" /> Nouveau véhicule
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          {loadError}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : rows.length === 0 && !loadError ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center flex flex-col items-center gap-3">
          <Package className="w-10 h-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium text-foreground">Aucune pré-commande</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cliquez sur « Nouveau véhicule » pour commencer.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((p) => (
            <PreorderCard
              key={p.id}
              p={p}
              isExpanded={expandedCardId === p.id}
              onToggleExpand={() =>
                setExpandedCardId((cur) => (cur === p.id ? null : p.id))
              }
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              onEdit={openEdit}
              onDelete={(pp) => setConfirmDelete(pp)}
              onToggleAvailable={toggleAvailable}
              onImageUpdated={handleImageUpdated}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier la pré-commande' : 'Nouvelle pré-commande'}
              </h3>
              <button
                onClick={() => setForm(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Marque *</label>
                  <input
                    value={form.marque}
                    onChange={(e) => setForm({ ...form, marque: e.target.value })}
                    placeholder="ex. Renault"
                    required
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Modèle *</label>
                  <input
                    value={form.modele}
                    onChange={(e) => setForm({ ...form, modele: e.target.value })}
                    placeholder="ex. Clio 5"
                    required
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Année *</label>
                <select
                  value={form.annee}
                  onChange={(e) => setForm({ ...form, annee: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Sélectionner une année —</option>
                  {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Prix estimé (DZD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={form.prix_estime}
                    onChange={(e) => setForm({ ...form, prix_estime: e.target.value })}
                    placeholder="ex. 3 200 000"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Budget dédouanement (DZD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={form.budget_dedouanement}
                    onChange={(e) => setForm({ ...form, budget_dedouanement: e.target.value })}
                    placeholder="ex. 800 000"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Délai de livraison</label>
                <input
                  value={form.delai_livraison}
                  onChange={(e) => setForm({ ...form, delai_livraison: e.target.value })}
                  placeholder="ex. 2-4 semaines"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Caractéristiques, options, finition…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              {/* Note: image is managed via click-to-upload on the card,
                  not from this modal. Create the preorder first, then
                  click on the card photo area to upload the image. */}
              {!form.id && (
                <p className="text-[11px] text-muted-foreground italic">
                  💡 Vous pourrez ajouter la photo après création en cliquant sur la carte.
                </p>
              )}

              <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                <span className="text-sm text-foreground">Disponible publiquement</span>
                <input
                  type="checkbox"
                  checked={form.disponible}
                  onChange={(e) => setForm({ ...form, disponible: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
              </label>

              {error && (
                <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium inline-flex items-center gap-1.5"
                >
                  {saving ? 'Enregistrement…' : (
                    <><CheckCircle2 className="w-4 h-4" /> {form.id ? 'Enregistrer' : 'Créer'}</>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ── Confirm delete dialog ─────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-sm p-6"
          >
            <h3 className="text-base font-semibold text-foreground">Supprimer cette pré-commande ?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {confirmDelete.marque} {confirmDelete.modele}
                {confirmDelete.annee ? ` ${confirmDelete.annee}` : ''}
              </span>
              {' '}sera définitivement supprimée. Cette action est irréversible.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { if (!deletingBusy) setConfirmDelete(null) }}
                disabled={deletingBusy}
                className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingBusy}
                className="px-4 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {deletingBusy ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
