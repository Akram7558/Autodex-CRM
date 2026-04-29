'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Pencil, Trash2, Power, X, Building2, Copy, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Showroom } from '@/lib/types'
import { WILAYAS_58 } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

type Form = {
  id: string | null
  name: string
  city: string
  owner_email: string
  module_vente: boolean
  module_location: boolean
  active: boolean
}

const empty: Form = {
  id: null,
  name: '',
  city: '',
  owner_email: '',
  module_vente: true,
  module_location: false,
  active: true,
}

export function ShowroomsManager() {
  const [rows, setRows] = useState<Showroom[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Success modal — shown after the API returns the temp password.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied]   = useState(false)

  async function fetchAll() {
    const { data, error } = await supabase
      .from('showrooms')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.warn('[ShowroomsManager] failed:', error.message)
    setRows((data ?? []) as Showroom[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.name.trim()) { setError('Nom requis.'); return }
    if (!form.city)        { setError('Wilaya requise.'); return }
    setSaving(true); setError('')

    // ── Edit flow: direct update, no auth user creation ───────────
    if (form.id) {
      const payload = {
        name: form.name.trim(),
        city: form.city,
        owner_email: form.owner_email.trim() || null,
        module_vente: form.module_vente,
        module_location: form.module_location,
        active: form.active,
      }
      const { error: err } = await supabase.from('showrooms').update(payload).eq('id', form.id)
      setSaving(false)
      if (err) { setError(err.message); return }
      setForm(null)
      fetchAll()
      return
    }

    // ── Create flow: API route does showroom + auth user + user_roles
    if (!form.owner_email.trim()) {
      setSaving(false)
      setError('Email du propriétaire requis pour créer un compte.')
      return
    }
    const res = await fetch('/api/admin/create-showroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:            form.name.trim(),
        city:            form.city,
        owner_email:     form.owner_email.trim().toLowerCase(),
        module_vente:    form.module_vente,
        module_location: form.module_location,
        active:          form.active,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur lors de la création du showroom.')
      return
    }
    setForm(null)
    setCreated({ email: json.owner_email, password: json.temp_password })
    fetchAll()
  }

  async function copyCredentials() {
    if (!created) return
    const text = `Email : ${created.email}\nMot de passe temporaire : ${created.password}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access denied or unavailable — fall back to a prompt.
      window.prompt('Copiez ces identifiants :', text)
    }
  }

  async function toggleActive(s: Showroom) {
    const next = !s.active
    setRows((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)))
    const { error } = await supabase
      .from('showrooms')
      .update({ active: next })
      .eq('id', s.id)
    if (error) { alert(error.message); fetchAll() }
  }

  async function remove(s: Showroom) {
    if (!confirm(`Supprimer le showroom "${s.name}" ? Toutes ses données associées seront perdues.`)) return
    const { error } = await supabase.from('showrooms').delete().eq('id', s.id)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[2rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white">
            Showrooms
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {rows.length}
          </span>
        </div>
        <button
          onClick={() => setForm(empty)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau showroom
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nom</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Wilaya</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Propriétaire</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Modules</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Statut</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Créé le</th>
              <th className="px-6 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{s.name}</td>
                <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{s.city ?? '—'}</td>
                <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">{s.owner_email ?? '—'}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {s.module_vente && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                        Vente
                      </span>
                    )}
                    {s.module_location && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Location
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border',
                    s.active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                      : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                  )}>
                    {s.active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-zinc-500">
                  {format(new Date(s.created_at), 'd MMM yyyy', { locale: fr })}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => toggleActive(s)}
                      title={s.active ? 'Désactiver' : 'Activer'}
                      className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setForm({
                        id: s.id,
                        name: s.name,
                        city: s.city ?? '',
                        owner_email: s.owner_email ?? '',
                        module_vente: !!s.module_vente,
                        module_location: !!s.module_location,
                        active: !!s.active,
                      })}
                      title="Modifier"
                      className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(s)}
                      title="Supprimer"
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

        {!loading && rows.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Aucun showroom. Cliquez sur « Nouveau showroom » pour commencer.
          </div>
        )}
      </div>

      {/* Modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier le showroom' : 'Nouveau showroom'}
              </h3>
              <button onClick={() => setForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Nom *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ex. AutoSphère Alger"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Wilaya *</label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">— Choisir —</option>
                  {WILAYAS_58.map((w, i) => (
                    <option key={w} value={w}>
                      {String(i + 1).padStart(2, '0')} · {w}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Email du propriétaire {!form.id && '*'}
                </label>
                <input
                  type="email"
                  value={form.owner_email}
                  onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                  placeholder="proprietaire@autodex.store"
                  required={!form.id}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
                {!form.id && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Un compte sera créé automatiquement avec un mot de passe temporaire.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-foreground">Modules activés</label>
                <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                  <span className="text-sm text-foreground">Module Vente</span>
                  <input
                    type="checkbox"
                    checked={form.module_vente}
                    onChange={(e) => setForm({ ...form, module_vente: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                  <span className="text-sm text-foreground">Module Location</span>
                  <input
                    type="checkbox"
                    checked={form.module_location}
                    onChange={(e) => setForm({ ...form, module_location: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                  <span className="text-sm text-foreground">Showroom actif</span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
              </div>

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
                  className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 font-medium"
                >
                  {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success modal — shown after auto-provisioning a new owner */}
      {created && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-semibold text-foreground">Showroom créé</h3>
              </div>
              <button
                onClick={() => { setCreated(null); setCopied(false) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Email du propriétaire
                </p>
                <p className="text-sm font-mono text-foreground bg-muted rounded-lg px-3 py-2 break-all select-all">
                  {created.email}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Mot de passe temporaire
                </p>
                <p className="text-sm font-mono text-foreground bg-muted rounded-lg px-3 py-2 break-all select-all">
                  {created.password}
                </p>
              </div>

              <button
                type="button"
                onClick={copyCredentials}
                className={cn(
                  'flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-medium transition-colors',
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                )}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Copié
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copier les identifiants
                  </>
                )}
              </button>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Envoyez ces identifiants au propriétaire. Il pourra changer son
                mot de passe après connexion. Ce mot de passe ne sera plus
                affiché — copiez-le maintenant.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setCreated(null); setCopied(false) }}
                  className="px-5 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
