'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { ACTIVITY_TYPE_LABELS, type Activity } from '@/lib/types'
import {
  Phone, Mail, Users, FileText, RefreshCw,
  Plus, CheckCircle2, Clock, User2,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Icon & variant helpers ───────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'info' | 'purple' | 'danger' | 'indigo' | 'orange'

function typeIcon(type: Activity['type']) {
  const map: Record<Activity['type'], React.ReactNode> = {
    call:          <Phone       className="w-3.5 h-3.5" />,
    email:         <Mail        className="w-3.5 h-3.5" />,
    meeting:       <Users       className="w-3.5 h-3.5" />,
    note:          <FileText    className="w-3.5 h-3.5" />,
    status_change: <RefreshCw   className="w-3.5 h-3.5" />,
  }
  return map[type]
}

function typeVariant(type: Activity['type']): BadgeVariant {
  const map: Record<Activity['type'], BadgeVariant> = {
    call: 'info', email: 'purple', meeting: 'indigo',
    note: 'default', status_change: 'warning',
  }
  return map[type]
}

function typeIconBg(type: Activity['type']): string {
  const map: Record<Activity['type'], string> = {
    call:          'bg-blue-50 text-blue-600',
    email:         'bg-violet-50 text-violet-600',
    meeting:       'bg-indigo-50 text-indigo-600',
    note:          'bg-gray-100 text-gray-500',
    status_change: 'bg-amber-50 text-amber-600',
  }
  return map[type]
}

function groupLabel(dateStr: string) {
  const d = new Date(dateStr)
  if (isToday(d))     return "Aujourd'hui"
  if (isYesterday(d)) return 'Hier'
  return format(d, 'EEEE d MMMM yyyy', { locale: fr })
}

// ── Add Activity Modal ───────────────────────────────────────
function AddActivityModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: 'call' as Activity['type'],
    title: '',
    body: '',
    done: false,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Le titre est requis.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('activities').insert([{
      type:  form.type,
      title: form.title.trim(),
      body:  form.body || null,
      done:  form.done,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ type: 'call', title: '', body: '', done: false })
    setError('')
    onSaved()
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Nouvelle activité</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <div className="flex flex-wrap gap-2">
              {(['call', 'email', 'meeting', 'note', 'status_change'] as Activity['type'][]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.type === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {typeIcon(t)} {ACTIVITY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="ex. Appel de qualification"
              className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={3}
              placeholder="Détails de l'activité…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.done}
              onChange={e => setForm(f => ({ ...f, done: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">Marquée comme terminée</span>
          </label>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function ActivitesPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading,    setLoading]    = useState(true)
  const [typeFilter, setTypeFilter] = useState<Activity['type'] | 'all'>('all')
  const [modalOpen,  setModalOpen]  = useState(false)

  async function fetchActivities() {
    const { data } = await supabase
      .from('activities')
      .select('*, leads(full_name), users(full_name)')
      .order('created_at', { ascending: false })
    setActivities((data ?? []) as Activity[])
    setLoading(false)
  }

  useEffect(() => { fetchActivities() }, [])

  const filtered = activities.filter(a => typeFilter === 'all' || a.type === typeFilter)

  // Group by date
  const grouped = filtered.reduce<Record<string, Activity[]>>((acc, a) => {
    const key = format(new Date(a.created_at), 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const typeFilters: { value: Activity['type'] | 'all'; label: string }[] = [
    { value: 'all',           label: 'Toutes' },
    { value: 'call',          label: 'Appels' },
    { value: 'email',         label: 'Emails' },
    { value: 'meeting',       label: 'Réunions' },
    { value: 'note',          label: 'Notes' },
    { value: 'status_change', label: 'Statuts' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Activités</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activities.length} activité{activities.length > 1 ? 's' : ''} enregistrée{activities.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" /> Nouvelle activité
        </button>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1">
        {typeFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              typeFilter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-400/30 border-t-indigo-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Aucune activité trouvée.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateKey, items]) => (
            <div key={dateKey}>
              {/* Date divider */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider capitalize">
                  {groupLabel(items[0].created_at)}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">{items.length}</span>
              </div>

              {/* Activity cards */}
              <div className="space-y-2">
                {items.map(activity => (
                  <div
                    key={activity.id}
                    className={`bg-white rounded-xl border p-4 flex gap-4 transition-all ${
                      activity.done ? 'border-gray-100' : 'border-gray-200 shadow-sm'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${typeIconBg(activity.type)}`}>
                      {typeIcon(activity.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm font-medium leading-tight ${activity.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {activity.title}
                          </h3>
                          <Badge variant={typeVariant(activity.type)}>
                            {ACTIVITY_TYPE_LABELS[activity.type]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {activity.done && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Terminée
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {format(new Date(activity.created_at), 'HH:mm')}
                          </span>
                        </div>
                      </div>

                      {activity.body && (
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{activity.body}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {(activity as any).leads?.full_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <User2 className="w-3 h-3" />
                            <span dir="auto">{(activity as any).leads.full_name}</span>
                          </span>
                        )}
                        {(activity as any).users?.full_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <span className="w-3 h-3 rounded-full bg-indigo-200 inline-block" />
                            {(activity as any).users.full_name}
                          </span>
                        )}
                        {/* Done toggle */}
                        <button
                          onClick={async () => {
                            const done = !activity.done
                            await supabase.from('activities').update({ done }).eq('id', activity.id)
                            setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, done } : a))
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 transition ml-auto"
                        >
                          {activity.done ? 'Marquer en attente' : 'Marquer terminée'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddActivityModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchActivities} />
    </div>
  )
}
