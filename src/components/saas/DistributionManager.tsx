'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { AppRole, SaasDistributionEntry } from '@/lib/types'

const PERCENT_TOLERANCE = 0.01

type Available = { user_id: string; email: string | null }

export function DistributionManager() {
  const [entries, setEntries]   = useState<SaasDistributionEntry[]>([])
  const [available, setAvailable] = useState<Available[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [pickedToAdd, setPickedToAdd] = useState('')
  const [role, setRole]         = useState<AppRole | null>(null)
  const [toast, setToast]       = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function fetchAll() {
    setLoading(true); setError('')
    const res = await fetch('/api/saas-distribution')
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur de chargement.')
      setEntries([]); setAvailable([])
      return
    }
    setEntries((json.entries ?? []) as SaasDistributionEntry[])
    setAvailable((json.available_commercials ?? []) as Available[])
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

  const total = useMemo(
    () => entries.filter(e => e.active).reduce((acc, e) => acc + (Number(e.percentage) || 0), 0),
    [entries],
  )
  const totalIs100 = Math.abs(total - 100) <= PERCENT_TOLERANCE

  function patchLocal(userId: string, patch: Partial<SaasDistributionEntry>) {
    setEntries((cur) => cur.map(e => e.user_id === userId ? { ...e, ...patch } : e))
  }

  async function save() {
    if (!canEdit) return
    if (!totalIs100) {
      flashToast('La somme des pourcentages actifs doit être égale à 100%.')
      return
    }
    setSaving(true)
    const res = await fetch('/api/saas-distribution', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map(e => ({
          user_id:    e.user_id,
          percentage: Number(e.percentage),
          active:     e.active,
        })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { flashToast(json?.error ?? 'Erreur lors de la sauvegarde.'); return }
    flashToast('Distribution mise à jour')
    fetchAll()
  }

  // ── Add a commercial to the LOCAL list only ────────────────────────
  // Persistence happens on Save (PUT). Until then the row sits in local
  // state at 0% / inactive so the 100% total stays valid; user can then
  // adjust percentages and toggle active before clicking Enregistrer.
  // Pending rows are tagged with `pending-<user_id>` ids so we can
  // re-merge them on top of refetched server data without losing them.
  function addCommercial() {
    if (!canEdit || !pickedToAdd) return
    const candidate = available.find(a => a.user_id === pickedToAdd)
    if (!candidate) return
    setEntries((cur) => {
      // Don't double-add if user clicks twice.
      if (cur.some(e => e.user_id === candidate.user_id)) return cur
      return [
        ...cur,
        {
          id:               'pending-' + candidate.user_id,
          user_id:          candidate.user_id,
          email:            candidate.email,
          percentage:       0,
          active:           false,
          last_assigned_at: null,
          rdv_count_total:  0,
          rdv_count_30days: 0,
        },
      ]
    })
    setAvailable((cur) => cur.filter(a => a.user_id !== candidate.user_id))
    setPickedToAdd('')
  }

  async function removeEntry(e: SaasDistributionEntry) {
    if (!canEdit) return
    if (!confirm(`Retirer ${e.email ?? 'ce commercial'} de la distribution ?`)) return
    const res = await fetch(`/api/saas-distribution/${e.user_id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flashToast(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    flashToast('Retiré de la distribution')
    fetchAll()
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[2rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
        <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white">
          Distribution des RDV SaaS
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Configurez la répartition automatique des nouveaux RDV SaaS entre les
          commerciaux. La somme des pourcentages actifs doit être égale à 100%.
        </p>
      </div>

      {error && (
        <div className="px-6 py-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200/40">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Email</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Pourcentage (%)</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Actif</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">RDV reçus</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Dernier RDV</th>
              {canEdit && <th className="px-6 py-3 text-right"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {entries.map((e) => (
              <tr key={e.user_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">
                  {e.email ?? <span className="text-zinc-400 italic">— inconnu —</span>}
                </td>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={e.percentage}
                    onChange={(ev) => patchLocal(e.user_id, { percentage: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) })}
                    disabled={!canEdit}
                    className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 tabular-nums"
                  />
                </td>
                <td className="px-6 py-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={e.active}
                    onClick={() => canEdit && patchLocal(e.user_id, { active: !e.active })}
                    disabled={!canEdit}
                    className={cn(
                      'relative w-10 h-5 rounded-full transition-colors',
                      e.active ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700',
                      !canEdit && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        e.active && 'translate-x-5',
                      )}
                    />
                  </button>
                </td>
                <td className="px-6 py-4 text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {e.rdv_count_total} <span className="text-zinc-400">total</span>
                  <span className="text-zinc-400"> · </span>
                  {e.rdv_count_30days} <span className="text-zinc-400">30j</span>
                </td>
                <td className="px-6 py-4 text-xs text-zinc-500">
                  {e.last_assigned_at
                    ? format(new Date(e.last_assigned_at), "d MMM yyyy 'à' HH:mm", { locale: fr })
                    : '—'}
                </td>
                {canEdit && (
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => removeEntry(e)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      title="Retirer de la distribution"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && entries.length === 0 && !error && (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Aucun commercial dans la distribution. Ajoutez-en un ci-dessous.
          </div>
        )}
      </div>

      {/* Totals + add + save */}
      <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {totalIs100 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          )}
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              totalIs100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            )}
          >
            Total : {total.toFixed(0)}%
          </span>
          {!totalIs100 && (
            <span className="text-[11px] text-rose-600 dark:text-rose-400">
              Doit être égal à 100% pour activer la distribution.
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {available.length > 0 && (
              <>
                <select
                  value={pickedToAdd}
                  onChange={(e) => setPickedToAdd(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">+ Ajouter un commercial…</option>
                  {available.map(a => (
                    <option key={a.user_id} value={a.user_id}>{a.email ?? a.user_id.slice(0, 8)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addCommercial}
                  disabled={!pickedToAdd}
                  className="px-3 py-2 rounded-xl text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!totalIs100 || saving}
              className="px-5 py-2 rounded-xl text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </motion.section>
  )
}
