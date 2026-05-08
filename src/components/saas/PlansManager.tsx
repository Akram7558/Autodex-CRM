'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Trash2, Crown, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AppRole, SaasPlan } from '@/lib/types'

type Row = {
  // `id` is undefined for newly-added local rows; PUT then assigns one.
  id?: string
  name: string
  duration_months: number
  price: number
  active: boolean
  /** Local-only flag — newly-added rows aren't persisted yet. */
  pending?: boolean
}

export function PlansManager() {
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [role, setRole]   = useState<AppRole | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function fetchAll() {
    setLoading(true); setLoadError('')
    const res = await fetch('/api/saas-plans')
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Erreur de chargement.')
      setRows([])
      return
    }
    setRows(((json.plans ?? []) as SaasPlan[]).map(p => ({
      id:              p.id,
      name:            p.name,
      duration_months: p.duration_months,
      price:           Number(p.price),
      active:          p.active,
    })))
  }

  useEffect(() => {
    fetchAll()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return
      const { data: r } = await supabase
        .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
      setRole((r?.role as AppRole | null) ?? null)
    })
  }, [])

  const canEdit = role === 'super_admin'

  function patch(idx: number, p: Partial<Row>) {
    setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, ...p } : r)))
  }

  function addPending() {
    if (!canEdit) return
    setRows((cur) => [
      ...cur,
      {
        name: '',
        duration_months: 1,
        price: 0,
        active: true,
        pending: true,
      },
    ])
  }

  function removeLocalPending(idx: number) {
    setRows((cur) => cur.filter((_, i) => i !== idx))
  }

  async function softDeletePersisted(row: Row, idx: number) {
    if (!canEdit || !row.id) return
    if (!confirm(`Désactiver le plan « ${row.name} » ? Il ne sera plus proposé lors des conversions.`)) return
    const res = await fetch(`/api/saas-plans/${row.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flashToast(j?.error ?? 'Erreur lors de la désactivation.')
      return
    }
    // Reflect locally without a roundtrip — server soft-deletes (active=false).
    patch(idx, { active: false })
    flashToast('Plan désactivé')
  }

  async function save() {
    if (!canEdit) return
    // Quick client validation so we don't bounce off the API.
    for (const r of rows) {
      if (!r.name.trim()) {
        flashToast('Tous les plans doivent avoir un nom.')
        return
      }
      if (!Number.isInteger(r.duration_months) || r.duration_months <= 0) {
        flashToast(`Durée invalide pour "${r.name}".`)
        return
      }
      if (!Number.isFinite(r.price) || r.price < 0) {
        flashToast(`Prix invalide pour "${r.name}".`)
        return
      }
    }
    setSaving(true)
    const res = await fetch('/api/saas-plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plans: rows.map(r => ({
          id:              r.id,
          name:            r.name.trim(),
          duration_months: r.duration_months,
          price:           r.price,
          active:          r.active,
        })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      flashToast(json?.error ?? 'Erreur lors de la sauvegarde.')
      return
    }
    flashToast('Plans mis à jour')
    fetchAll()
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[2rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white inline-flex items-center gap-2">
            <Crown className="w-4 h-4 text-violet-500" /> Plans &amp; Tarifs
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-prose">
            Configurez les plans d&apos;abonnement proposés aux showrooms.
            Ces plans apparaissent dans la modale de conversion d&apos;essai.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="px-6 py-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200/40">
          {loadError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nom</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Durée (mois)</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Prix (DZD)</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Actif</th>
              {canEdit && <th className="px-6 py-3 text-right"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {rows.map((r, idx) => (
              <tr key={r.id ?? `pending-${idx}`} className={cn(
                'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20',
                r.pending && 'bg-violet-50/40 dark:bg-violet-500/5',
              )}>
                <td className="px-6 py-3">
                  <input
                    value={r.name}
                    onChange={(e) => patch(idx, { name: e.target.value })}
                    disabled={!canEdit}
                    placeholder="ex. Pack 6 mois"
                    className="w-full h-9 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                </td>
                <td className="px-6 py-3">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={r.duration_months}
                    onChange={(e) => patch(idx, { duration_months: Math.max(1, Math.floor(Number(e.target.value) || 0)) })}
                    disabled={!canEdit}
                    className="w-24 h-9 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 tabular-nums"
                  />
                </td>
                <td className="px-6 py-3">
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={r.price}
                    onChange={(e) => patch(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                    disabled={!canEdit}
                    className="w-32 h-9 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 tabular-nums"
                  />
                </td>
                <td className="px-6 py-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.active}
                    onClick={() => canEdit && patch(idx, { active: !r.active })}
                    disabled={!canEdit}
                    className={cn(
                      'relative w-10 h-5 rounded-full transition-colors',
                      r.active ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700',
                      !canEdit && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        r.active && 'translate-x-5',
                      )}
                    />
                  </button>
                </td>
                {canEdit && (
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => r.pending ? removeLocalPending(idx) : softDeletePersisted(r, idx)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      title={r.pending ? 'Retirer cette ligne' : 'Désactiver le plan'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Aucun plan. Ajoutez-en un ci-dessous.
          </div>
        )}
      </div>

      {canEdit && (
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={addPending}
            className="px-3 py-2 rounded-xl text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Ajouter un plan
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 font-medium inline-flex items-center gap-1.5"
          >
            {saving ? (
              'Enregistrement…'
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Enregistrer</>
            )}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </motion.section>
  )
}
