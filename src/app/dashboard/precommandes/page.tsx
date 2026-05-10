'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Pencil, Trash2, X, Package, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PreorderVehicle } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────────────
// /dashboard/precommandes — owner / manager preorder vehicle CRUD.
// ─────────────────────────────────────────────────────────────────────

type Form = {
  id: string | null
  marque: string
  modele: string
  annee: string
  prix_estime: string
  description: string
  image_url: string
  delai_livraison: string
  disponible: boolean
}

const empty: Form = {
  id: null,
  marque: '',
  modele: '',
  annee: '',
  prix_estime: '',
  description: '',
  image_url: '',
  delai_livraison: '',
  disponible: true,
}

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export default function PrecommandesPage() {
  const [rows, setRows]   = useState<PreorderVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm]   = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // Year options: current year → +2.
  const yearOpts = useMemo(() => {
    const y = new Date().getFullYear()
    return [y, y + 1, y + 2]
  }, [])

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
      id:              p.id,
      marque:          p.marque,
      modele:          p.modele,
      annee:           p.annee != null ? String(p.annee) : '',
      prix_estime:     p.prix_estime != null ? String(p.prix_estime) : '',
      description:     p.description ?? '',
      image_url:       p.image_url ?? '',
      delai_livraison: p.delai_livraison ?? '',
      disponible:      p.disponible,
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    if (!form.marque.trim()) { setError('Marque requise.'); return }
    if (!form.modele.trim()) { setError('Modèle requis.'); return }
    setSaving(true)
    const payload = {
      marque:          form.marque.trim(),
      modele:          form.modele.trim(),
      annee:           form.annee || null,
      prix_estime:     form.prix_estime ? Number(form.prix_estime.replace(/\s/g, '')) : null,
      description:     form.description.trim() || null,
      image_url:       form.image_url.trim() || null,
      delai_livraison: form.delai_livraison.trim() || null,
      disponible:      form.disponible,
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

  async function remove(p: PreorderVehicle) {
    if (!confirm(`Supprimer la pré-commande « ${p.marque} ${p.modele} » ?`)) return
    const res = await fetch(`/api/preorder-vehicles/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    flashToast('Pré-commande supprimée')
    fetchAll()
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
    <div className="p-10 pt-2 max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white inline-flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Véhicules en Pré-commande
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gérez les véhicules que vous pouvez importer pour vos clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouveau véhicule
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          {loadError}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Marque</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Modèle</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Année</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Prix estimé</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Délai</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Disponible</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Créé le</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <td className="px-6 py-3 text-sm font-bold text-zinc-900 dark:text-white">{p.marque}</td>
                  <td className="px-6 py-3 text-sm text-zinc-700 dark:text-zinc-300">{p.modele}</td>
                  <td className="px-6 py-3 text-xs text-zinc-500 tabular-nums">{p.annee ?? '—'}</td>
                  <td className="px-6 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatDzd(p.prix_estime)} <span className="text-[10px] font-normal text-zinc-500">DZD</span>
                  </td>
                  <td className="px-6 py-3 text-xs text-zinc-500">{p.delai_livraison ?? '—'}</td>
                  <td className="px-6 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.disponible}
                      onClick={() => toggleAvailable(p)}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors',
                        p.disponible ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        p.disponible && 'translate-x-5',
                      )} />
                    </button>
                  </td>
                  <td className="px-6 py-3 text-xs text-zinc-500">
                    {format(new Date(p.created_at), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Modifier"
                        onClick={() => openEdit(p)}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        title="Supprimer"
                        onClick={() => remove(p)}
                        className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && !loadError && (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              Aucune pré-commande pour le moment. Cliquez sur « Nouveau véhicule » pour commencer.
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Modal ─────────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier la pré-commande' : 'Nouvelle pré-commande'}
              </h3>
              <button onClick={() => setForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
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
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Modèle *</label>
                  <input
                    value={form.modele}
                    onChange={(e) => setForm({ ...form, modele: e.target.value })}
                    placeholder="ex. Clio 5"
                    required
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Année</label>
                  <select
                    value={form.annee}
                    onChange={(e) => setForm({ ...form, annee: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">—</option>
                    {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Prix estimé (DZD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={form.prix_estime}
                    onChange={(e) => setForm({ ...form, prix_estime: e.target.value })}
                    placeholder="ex. 3 200 000"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Délai de livraison</label>
                <input
                  value={form.delai_livraison}
                  onChange={(e) => setForm({ ...form, delai_livraison: e.target.value })}
                  placeholder="ex. 2-4 semaines"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Caractéristiques, options, finition…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Image (URL)</label>
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="https://…/photo.jpg"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                <span className="text-sm text-foreground">Disponible publiquement</span>
                <input
                  type="checkbox"
                  checked={form.disponible}
                  onChange={(e) => setForm({ ...form, disponible: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

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
                  className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 font-medium inline-flex items-center gap-1.5"
                >
                  {saving ? 'Enregistrement…' : (
                    <><CheckCircle2 className="w-4 h-4" /> {form.id ? 'Enregistrer' : 'Créer'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
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
