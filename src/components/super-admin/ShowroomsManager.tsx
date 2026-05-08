'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Pencil, Trash2, Power, X, Building2, Copy, CheckCircle2, Crown } from 'lucide-react'
import { TrialBadge } from '@/components/shared/TrialBadge'
import { ConvertTrialModal } from '@/components/saas/ConvertTrialModal'
import { PlanPicker, type PlanPickerValue } from '@/components/saas/PlanPicker'
import type { SaasPlan } from '@/lib/types'
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
  password: string
  password_confirm: string
  module_vente: boolean
  module_location: boolean
  active: boolean
  // ── Plan selection (creation only — ignored on edit) ─────────────
  // 'none'   → no plan, free showroom (default for creation)
  // <uuid>   → a plan id from saas_plans
  plan_pick: PlanPickerValue
  // Resolved fields used when plan_pick is a plan id. Pre-filled from
  // the plan and editable.
  contract_amount: string
  expires_at: string  // YYYY-MM-DD (HTML date input)
}

const empty: Form = {
  id: null,
  name: '',
  city: '',
  owner_email: '',
  password: '',
  password_confirm: '',
  module_vente: true,
  module_location: false,
  active: true,
  plan_pick: 'none',
  contract_amount: '',
  expires_at: '',
}

// Returns 0 (none/weak), 1 (weak), 2 (medium), 3 (strong) for the password.
function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw))   score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return 1
  if (score <= 4) return 2
  return 3
}

const STRENGTH_META: Record<0 | 1 | 2 | 3, { label: string; color: string; widthClass: string }> = {
  0: { label: '—',      color: 'bg-zinc-300 dark:bg-zinc-700',  widthClass: 'w-0' },
  1: { label: 'Faible', color: 'bg-rose-500',                    widthClass: 'w-1/3' },
  2: { label: 'Moyen',  color: 'bg-amber-500',                   widthClass: 'w-2/3' },
  3: { label: 'Fort',   color: 'bg-emerald-500',                 widthClass: 'w-full' },
}

export function ShowroomsManager() {
  const [rows, setRows] = useState<Showroom[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Success modal — shown after the API responds. When email_sent is true
  // we show a simple "email envoyé" confirmation. When false, we surface
  // the password so the super admin can deliver it manually.
  // Trial conversion modal target — set to a trial showroom row when
  // the super_admin clicks the "Convertir →" action.
  const [convertTarget, setConvertTarget] = useState<Showroom | null>(null)

  const [created, setCreated] = useState<
    | { email: string; emailSent: true }
    | { email: string; emailSent: false; password: string; emailError?: string }
    | null
  >(null)
  const [copied, setCopied] = useState(false)

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
    if (form.password.length < 8) {
      setSaving(false)
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (form.password !== form.password_confirm) {
      setSaving(false)
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    // Resolve plan-related fields when the user picked a plan card.
    // 'none' → no plan, free showroom (legacy behaviour).
    // <uuid> → paid showroom from day 1.
    const planPayload: Record<string, unknown> = {}
    if (form.plan_pick !== 'none' && form.plan_pick !== 'custom') {
      planPayload.plan_id = form.plan_pick
      const amount = Number(form.contract_amount)
      if (!Number.isFinite(amount) || amount < 0) {
        setSaving(false)
        setError('Montant du contrat invalide.')
        return
      }
      planPayload.contract_amount = amount
      if (form.expires_at) {
        planPayload.expires_at =
          new Date(form.expires_at + 'T23:59:59').toISOString()
      }
    }

    const res = await fetch('/api/admin/create-showroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:            form.name.trim(),
        city:            form.city,
        owner_email:     form.owner_email.trim().toLowerCase(),
        password:        form.password,
        module_vente:    form.module_vente,
        module_location: form.module_location,
        active:          form.active,
        ...planPayload,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur lors de la création du showroom.')
      return
    }
    setForm(null)
    if (json.email_sent) {
      setCreated({ email: json.owner_email, emailSent: true })
    } else {
      setCreated({
        email:       json.owner_email,
        emailSent:   false,
        password:    json.temp_password ?? form.password,
        emailError:  json.email_error,
      })
    }
    fetchAll()
  }

  async function copyCredentials() {
    if (!created || created.emailSent) return
    const text = `Email : ${created.email}\nMot de passe : ${created.password}`
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border',
                      s.active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                        : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                    )}>
                      {s.active ? 'Actif' : 'Inactif'}
                    </span>
                    <TrialBadge
                      is_trial={!!s.is_trial}
                      trial_ends_at={s.trial_ends_at ?? null}
                      active={!!s.active}
                    />
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-zinc-500">
                  {format(new Date(s.created_at), 'd MMM yyyy', { locale: fr })}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Convertir → only for active trial showrooms */}
                    {s.is_trial && s.active && (
                      <button
                        onClick={() => setConvertTarget(s)}
                        title="Convertir l'essai en abonnement"
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 inline-flex items-center gap-1 transition-colors"
                      >
                        <Crown className="w-3 h-3" />
                        Convertir →
                      </button>
                    )}
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
                        password: '',
                        password_confirm: '',
                        module_vente: !!s.module_vente,
                        module_location: !!s.module_location,
                        active: !!s.active,
                        // Plan fields aren't editable from this modal —
                        // conversions go through ConvertTrialModal.
                        plan_pick:       'none',
                        contract_amount: '',
                        expires_at:      '',
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
                    Un compte sera créé automatiquement et un email de bienvenue sera envoyé.
                  </p>
                )}
              </div>

              {!form.id && (() => {
                const strength = passwordStrength(form.password)
                const meta = STRENGTH_META[strength]
                const mismatch = form.password_confirm.length > 0 && form.password !== form.password_confirm
                return (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Mot de passe *</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="8 caractères minimum"
                        required
                        className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className={cn('h-full transition-all duration-200', meta.color, meta.widthClass)}
                          />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-12 text-right">
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Confirmer le mot de passe *</label>
                      <input
                        type="password"
                        value={form.password_confirm}
                        onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                        minLength={8}
                        autoComplete="new-password"
                        required
                        className={cn(
                          'w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 transition',
                          mismatch
                            ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/20'
                            : 'border-border focus:border-indigo-400 focus:ring-indigo-500/20'
                        )}
                      />
                      {mismatch && (
                        <p className="mt-1 text-[11px] text-rose-600">Les deux mots de passe ne correspondent pas.</p>
                      )}
                    </div>
                  </>
                )
              })()}

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

              {/* ── Plan d'abonnement (creation only) ─────────────── */}
              {!form.id && (
                <div className="space-y-3 rounded-xl border border-border p-4 bg-muted/20">
                  <p className="text-xs font-medium text-foreground">Plan d&apos;abonnement (optionnel)</p>
                  <PlanPicker
                    value={form.plan_pick}
                    label=""
                    allowNone
                    onChange={(next: PlanPickerValue, plan: SaasPlan | null) => {
                      // When a plan card is picked, pre-fill price + expiry
                      // (today + duration_months). User can override either.
                      if (plan) {
                        const ends = new Date()
                        ends.setMonth(ends.getMonth() + plan.duration_months)
                        const pad = (n: number) => String(n).padStart(2, '0')
                        const dateStr =
                          `${ends.getFullYear()}-${pad(ends.getMonth() + 1)}-${pad(ends.getDate())}`
                        setForm({
                          ...form,
                          plan_pick:       next,
                          contract_amount: String(plan.price),
                          expires_at:      dateStr,
                        })
                      } else {
                        // 'none' or 'custom' — clear the derived fields.
                        setForm({
                          ...form,
                          plan_pick:       next,
                          contract_amount: '',
                          expires_at:      '',
                        })
                      }
                    }}
                  />
                  {form.plan_pick !== 'none' && form.plan_pick !== 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Montant du contrat (DZD) *</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={form.contract_amount}
                          onChange={(e) => setForm({ ...form, contract_amount: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Date d&apos;expiration *</label>
                        <input
                          type="date"
                          value={form.expires_at}
                          onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">Calculée depuis le plan · modifiable</p>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {form.plan_pick === 'none'
                      ? 'Aucun plan — showroom créé sans abonnement.'
                      : 'Le showroom sera créé en mode payant dès le départ.'}
                  </p>
                </div>
              )}

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

            {created.emailSent ? (
              // ── Happy path: email delivered ─────────────────────
              <div className="px-6 py-6 space-y-4">
                <p className="text-sm text-foreground">
                  Un email avec les identifiants a été envoyé à{' '}
                  <span className="font-bold break-all">{created.email}</span>.
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Le propriétaire peut maintenant se connecter sur{' '}
                  <a href="https://www.autodex.store" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    autodex.store
                  </a>{' '}
                  et changer son mot de passe depuis ses paramètres.
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreated(null); setCopied(false) }}
                    className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              // ── Email failed: show credentials so admin can deliver manually
              <div className="px-6 py-5 space-y-4">
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    ⚠️ Showroom créé mais l&apos;email n&apos;a pas pu être envoyé.
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                    Identifiants à transmettre manuellement :
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</p>
                  <p className="text-sm font-mono text-foreground bg-muted rounded-lg px-3 py-2 break-all select-all">
                    {created.email}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mot de passe</p>
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
                  {copied ? (<><CheckCircle2 className="w-4 h-4" /> Copié</>) : (<><Copy className="w-4 h-4" /> Copier les identifiants</>)}
                </button>

                {created.emailError && (
                  <p className="text-[10px] text-muted-foreground break-all">
                    Détail : {created.emailError}
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreated(null); setCopied(false) }}
                    className="px-5 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Convert-trial modal — opened via the Convertir → button on
          active trial rows. The success callback updates the local
          row (is_trial=false) so the badge / button disappear without
          waiting for a refetch. */}
      <ConvertTrialModal
        open={!!convertTarget}
        showroom={convertTarget}
        onClose={() => setConvertTarget(null)}
        onConverted={(info) => {
          if (convertTarget) {
            const tid = convertTarget.id
            setRows((prev) => prev.map((x) => x.id === tid ? {
              ...x,
              is_trial:              false,
              trial_ends_at:         info.expires_at,
              trial_converted_at:    new Date().toISOString(),
              trial_contract_amount: info.contract_amount,
              plan_id:               info.plan_id,
            } : x))
          }
          setConvertTarget(null)
          // Refetch in the background to pick up server-side fields
          // (trial_converted_by etc.) we don't have locally.
          fetchAll()
        }}
      />
    </motion.div>
  )
}
