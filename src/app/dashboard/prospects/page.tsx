'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
  closestCorners,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import {
  type Lead, type Vehicle, type Activity,
  LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS, WILAYAS_58,
} from '@/lib/types'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Plus, Phone, Mail, Calendar, FileText, X,
  Car, MapPin, Clock, AlertCircle, RefreshCw,
  Banknote, CheckCircle2, Send,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────
// COLUMN CONFIG
// ─────────────────────────────────────────────────────────────────

type ColId = 'new' | 'contacted' | 'qualified' | 'proposal' | 'terminal'

const COLUMNS: {
  id: ColId
  label: string
  statuses: Lead['status'][]
  accent: string
  headerCls: string
  dotCls: string
  bgCls: string
  borderCls: string
}[] = [
  {
    id: 'new',
    label: 'Nouveau',
    statuses: ['new'],
    accent: '#10b981',
    headerCls: '',
    dotCls: 'bg-emerald-400',
    bgCls: '',
    borderCls: '',
  },
  {
    id: 'contacted',
    label: 'Contacté',
    statuses: ['contacted'],
    accent: '#f59e0b',
    headerCls: '',
    dotCls: 'bg-amber-400',
    bgCls: '',
    borderCls: '',
  },
  {
    id: 'qualified',
    label: 'RDV planifié',
    statuses: ['qualified'],
    accent: '#38bdf8',
    headerCls: '',
    dotCls: 'bg-sky-400',
    bgCls: '',
    borderCls: '',
  },
  {
    id: 'proposal',
    label: 'Offre faite',
    statuses: ['proposal'],
    accent: '#f43f5e',
    headerCls: '',
    dotCls: 'bg-rose-400',
    bgCls: '',
    borderCls: '',
  },
  {
    id: 'terminal',
    label: 'Vendu · Perdu',
    statuses: ['won', 'lost'],
    accent: '#8b5cf6',
    headerCls: '',
    dotCls: 'bg-violet-400',
    bgCls: '',
    borderCls: '',
  },
]

function statusToCol(status: Lead['status']): ColId {
  if (status === 'won' || status === 'lost') return 'terminal'
  return status as ColId
}

function colToStatus(colId: ColId): Lead['status'] {
  if (colId === 'terminal') return 'won'   // default; user can flip to 'lost' via side panel
  return colId as Lead['status']
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function timeAgo(d: string): string {
  try {
    return formatDistanceToNow(new Date(d), { locale: fr, addSuffix: true })
  } catch {
    return ''
  }
}

function isStale(lead: Lead): boolean {
  return lead.status === 'new' &&
    Date.now() - new Date(lead.created_at).getTime() > 48 * 3_600_000
}

const MODEL_COLORS = [
  'bg-indigo-50 text-indigo-700', 'bg-violet-50 text-violet-700',
  'bg-sky-50 text-sky-700',       'bg-emerald-50 text-emerald-700',
  'bg-orange-50 text-orange-700', 'bg-rose-50 text-rose-700',
  'bg-teal-50 text-teal-700',     'bg-fuchsia-50 text-fuchsia-700',
]
function modelColor(s: string): string {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return MODEL_COLORS[h % MODEL_COLORS.length]
}

function formatDZD(n: number | null): string | null {
  if (!n) return null
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n) + '\u00a0DA'
}

const SOURCE_ICONS: Record<string, string> = {
  facebook: '📘', instagram: '📷', whatsapp: '💬',
  telephone: '📞', 'walk-in': '🚶', phone: '📞',
  social: '📱', website: '🌐', referral: '👥',
}

const KANBAN_SOURCES = [
  { value: 'facebook',  label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'telephone', label: 'Téléphone' },
  { value: 'walk-in',   label: 'Walk-in (Showroom)' },
]

const ACTIVITY_ICON_CLS: Record<Activity['type'], string> = {
  call:          'bg-blue-50 text-blue-600',
  email:         'bg-violet-50 text-violet-600',
  meeting:       'bg-indigo-50 text-indigo-600',
  note:          'bg-muted text-muted-foreground',
  status_change: 'bg-amber-50 text-amber-600',
}

const CAR_MODELS = [
  'Geely Emgrand', 'Geely Coolray', 'Geely Atlas Pro',
  'Chery Tiggo 4', 'Chery Tiggo 7', 'Chery Arrizo 6',
  'Fiat 500X', 'Fiat Tipo',
  'Renault Symbol', 'Renault Sandero',
  'DFSK Glory 500', 'DFSK Glory 580',
]

// ─────────────────────────────────────────────────────────────────
// LEAD CARD CONTENT  (pure display — no dnd hooks, safe in DragOverlay)
// ─────────────────────────────────────────────────────────────────

function LeadCardContent({ lead, ghost = false }: { lead: Lead; ghost?: boolean }) {
  const stale = isStale(lead)

  // Fix #3: stale left-border via inline style (Tailwind v4 has no border-{side}-{color})
  const borderStyle: React.CSSProperties = stale
    ? { borderLeftWidth: 4, borderLeftColor: '#f87171' }
    : {}

  return (
    <div
      style={borderStyle}
      className={[
        'rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 select-none shadow-sm',
        ghost
          ? 'shadow-2xl ring-1 ring-indigo-500/40 rotate-1 opacity-95'
          : 'hover:border-indigo-300 dark:hover:border-zinc-700 hover:shadow-md hover:-translate-y-0.5 cursor-grab active:cursor-grabbing transition-all duration-200 group',
      ].join(' ')}
    >
      <div className="p-5">
        {/* Source label + stale icon */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
            lead.source === 'whatsapp'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
              : lead.source === 'facebook'
              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
              : lead.source === 'instagram'
              ? 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20'
              : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
          }`}>
            {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}
          </span>
          {stale && (
            <span title="Sans contact depuis + 48h">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            </span>
          )}
        </div>

        {/* Name */}
        <p dir="auto" className="font-bold tracking-tight text-zinc-900 dark:text-white text-sm leading-snug break-words mb-3">
          {lead.full_name}
        </p>

        {/* Model badge */}
        {lead.model_wanted && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium mb-2 ${modelColor(lead.model_wanted)}`}>
            <Car className="w-3 h-3" />
            {lead.model_wanted}
          </span>
        )}

        {/* Notes fallback when no model */}
        {!lead.model_wanted && lead.notes && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-1 italic">{lead.notes}</p>
        )}

        {/* Footer rows: wilaya, budget, time */}
        <div className="flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          {lead.wilaya && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
              <MapPin className="w-3 h-3" /> {lead.wilaya}
            </div>
          )}
          {lead.budget_dzd && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest">
              <Banknote className="w-3 h-3" /> {formatDZD(lead.budget_dzd)}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
            <Clock className="w-3 h-3" /> {timeAgo(lead.created_at)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LEAD CARD  (draggable wrapper — never rendered inside DragOverlay)
// ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id })

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      style={{
        transform: CSS.Translate.toString(transform),
        // Hide original while overlay ghost is shown
        opacity: isDragging ? 0 : undefined,
      }}
      {...listeners}
      {...attributes}
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      <LeadCardContent lead={lead} />
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KANBAN COLUMN  (droppable — setNodeRef on outer wrapper so the
//                 full column height, including the header, is droppable)
// ─────────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  onCardClick,
}: {
  col: typeof COLUMNS[number]
  leads: Lead[]
  onCardClick: (l: Lead) => void
}) {
  // Fix #2: attach setNodeRef to the OUTER wrapper so dragging over
  // the header still registers the column as the drop target.
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  const won  = leads.filter(l => l.status === 'won')
  const lost = leads.filter(l => l.status === 'lost')

  return (
    <div
      ref={setNodeRef}                           // ← full column is droppable
      className="flex flex-col w-[300px] flex-shrink-0 rounded-[2rem] overflow-hidden bg-zinc-50/60 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800"
      style={{
        boxShadow: isOver
          ? `0 0 0 2px ${col.accent}66, 0 0 0 4px ${col.accent}22`
          : undefined,
        transition: 'box-shadow 150ms ease',
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dotCls}`} />
          <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">
            {col.label}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Cards area */}
      <div
        className={[
          'flex-1 min-h-[500px] px-3 pb-4 space-y-3 overflow-y-auto transition-colors duration-150',
          isOver ? 'bg-indigo-500/5' : '',
        ].join(' ')}
      >
        {/* Regular columns */}
        {col.id !== 'terminal' && leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}

        {/* Terminal column: ✅ Vendus first, then ❌ Perdus */}
        {col.id === 'terminal' && (
          <>
            {won.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-1 pt-1">
                  ✅ Vendus ({won.length})
                </p>
                {won.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
                ))}
              </div>
            )}
            {lost.length > 0 && (
              <div className={`space-y-2 ${won.length > 0 ? 'mt-3 pt-3 border-t border-emerald-100' : ''}`}>
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1 pt-1">
                  ❌ Perdus ({lost.length})
                </p>
                {lost.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
                ))}
              </div>
            )}
            {won.length === 0 && lost.length === 0 && (
              <EmptySlot isOver={isOver} />
            )}
          </>
        )}

        {col.id !== 'terminal' && leads.length === 0 && (
          <EmptySlot isOver={isOver} />
        )}
      </div>
    </div>
  )
}

function EmptySlot({ isOver }: { isOver: boolean }) {
  return (
    <div className={[
      'flex items-center justify-center h-24 rounded-lg border-2 border-dashed transition-colors duration-150',
      isOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-border',
    ].join(' ')}>
      <p className={`text-xs ${isOver ? 'text-indigo-400 font-medium' : 'text-muted-foreground'}`}>
        {isOver ? 'Déposer ici' : 'Aucun lead'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ADD LEAD MODAL
// ─────────────────────────────────────────────────────────────────

type AddForm = {
  full_name: string; phone: string; wilaya: string
  model_wanted: string; budget_dzd: string; source: string; notes: string
}

function AddLeadModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void
}) {
  const empty: AddForm = {
    full_name: '', phone: '', wilaya: '', model_wanted: '',
    budget_dzd: '', source: 'facebook', notes: '',
  }
  const [form, setForm]     = useState<AddForm>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k: keyof AddForm, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Le nom complet est requis.'); return }
    setSaving(true); setError('')

    // Map new sources to legacy ones (pre-migration compatible)
    const LEGACY_SOURCE: Record<string, string> = {
      facebook:  'social',
      instagram: 'social',
      whatsapp:  'phone',
      telephone: 'phone',
      'walk-in': 'walk-in',
    }

    // Build payload — include optional Kanban columns only when provided,
    // so it still works on DBs that haven't run migration_01_kanban.sql yet.
    const basePayload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone:     form.phone  || null,
      wilaya:    form.wilaya || null,
      source:    form.source,
      status:    'new',
      notes:     form.notes  || null,
    }
    if (form.model_wanted.trim()) basePayload.model_wanted = form.model_wanted.trim()
    if (form.budget_dzd.trim()) {
      const n = parseFloat(form.budget_dzd.replace(/[\s\u00a0]/g, ''))
      if (!Number.isNaN(n)) basePayload.budget_dzd = n
    }

    let payload = { ...basePayload }
    let { error: err } = await supabase.from('leads').insert([payload])
    let fallbackUsed = false

    // Fallback 1: DB schema cache missing model_wanted / budget_dzd columns.
    if (err && /model_wanted|budget_dzd/i.test(err.message)) {
      payload = { ...basePayload }
      delete payload.model_wanted
      delete payload.budget_dzd
      const retry = await supabase.from('leads').insert([payload])
      err = retry.error
      fallbackUsed = true
    }

    // Fallback 2: source CHECK constraint rejects new values (facebook/instagram/…).
    if (err && /source_check/i.test(err.message)) {
      const mapped = LEGACY_SOURCE[form.source] ?? 'walk-in'
      payload = { ...payload, source: mapped }
      const retry = await supabase.from('leads').insert([payload])
      err = retry.error
      fallbackUsed = true
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    if (fallbackUsed) {
      setError('Lead créé — exécutez migration_01_kanban.sql dans Supabase pour activer toutes les fonctionnalités.')
      setTimeout(() => { setForm(empty); onSaved(); onClose() }, 2500)
      return
    }
    setForm(empty)
    onSaved(); onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Nouveau lead</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ajouté en colonne « Nouveau »</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Source buttons */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Source *</label>
            <div className="flex flex-wrap gap-2">
              {KANBAN_SOURCES.map(s => (
                <button key={s.value} type="button" onClick={() => set('source', s.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.source === s.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}>
                  <span>{SOURCE_ICONS[s.value]}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nom complet *</label>
            <input dir="auto" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="ex. Karim Benali"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
          </div>

          {/* Phone + Wilaya */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Téléphone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="0555 XX XX XX"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Wilaya</label>
              <select value={form.wilaya} onChange={e => set('wilaya', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition bg-background text-foreground">
                <option value="">— Choisir —</option>
                {WILAYAS_58.map((w, i) => (
                  <option key={w} value={w}>{String(i + 1).padStart(2, '0')} · {w}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Model + Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Modèle souhaité</label>
              <input list="models-list" value={form.model_wanted} onChange={e => set('model_wanted', e.target.value)}
                placeholder="ex. Geely Coolray"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
              <datalist id="models-list">
                {CAR_MODELS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Budget (DA)</label>
              <input value={form.budget_dzd} onChange={e => set('budget_dzd', e.target.value)}
                placeholder="ex. 4500000"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              placeholder="Observations, demande spécifique…"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition">
            Annuler
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60 font-medium">
            {saving ? 'Enregistrement…' : 'Créer le lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LEAD SIDE PANEL
// ─────────────────────────────────────────────────────────────────

type QuickActivityType = 'call' | 'email' | 'meeting' | 'note'

// Fixed #8: typed map excludes 'note' explicitly
const QUICK_TITLE: Record<Exclude<QuickActivityType, 'note'>, string> = {
  call: 'Appel effectué', email: 'Email envoyé', meeting: 'Réunion planifiée',
}

const QUICK_ACTIONS: {
  type: Exclude<QuickActivityType, 'note'>
  label: string
  icon: React.ReactNode
  cls: string
}[] = [
  { type: 'call',    label: 'Appel',  icon: <Phone    className="w-3.5 h-3.5" />, cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' },
  { type: 'email',   label: 'Email',  icon: <Mail     className="w-3.5 h-3.5" />, cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200' },
  { type: 'meeting', label: 'RDV',    icon: <Calendar className="w-3.5 h-3.5" />, cls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200' },
]

const STATUS_OPTIONS: { value: Lead['status']; label: string }[] = [
  { value: 'new',       label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'qualified', label: 'RDV planifié' },
  { value: 'proposal',  label: 'Offre faite' },
  { value: 'won',       label: '✅ Vendu' },
  { value: 'lost',      label: '❌ Perdu' },
]

function LeadSidePanel({ lead, onClose, onLeadUpdated }: {
  lead: Lead
  onClose: () => void
  onLeadUpdated: (updated: Lead) => void
}) {
  const [activities,  setActivities]  = useState<Activity[]>([])
  const [vehicles,    setVehicles]    = useState<Vehicle[]>([])
  const [loadingAct,  setLoadingAct]  = useState(true)
  const [notes,       setNotes]       = useState(lead.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesDirty,  setNotesDirty]  = useState(false)
  const [quickNote,   setQuickNote]   = useState('')
  const [addingAct,   setAddingAct]   = useState(false)
  const [panelStatus, setPanelStatus] = useState<Lead['status']>(lead.status)
  const [vehicleId,   setVehicleId]   = useState<string | null>(lead.vehicle_id)

  // Reload data whenever the panel's lead changes
  useEffect(() => {
    setLoadingAct(true)
    setNotes(lead.notes ?? '')
    setNotesDirty(false)
    setPanelStatus(lead.status)
    setVehicleId(lead.vehicle_id)

    Promise.all([
      supabase.from('activities')
        .select('*, users(full_name)')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false }),
      supabase.from('vehicles')
        .select('*')
        .eq('status', 'available')
        .order('brand'),
    ]).then(([{ data: acts }, { data: vehs }]) => {
      setActivities((acts ?? []) as Activity[])
      setVehicles((vehs ?? []) as Vehicle[])
      setLoadingAct(false)
    })
  }, [lead.id])

  async function handleStatusChange(newStatus: Lead['status']) {
    setPanelStatus(newStatus)
    const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
    if (error) { setPanelStatus(lead.status); return }

    supabase.from('activities').insert([{
      lead_id: lead.id,
      type: 'status_change',
      title: `Statut → ${LEAD_STATUS_LABELS[newStatus]}`,
      done: true,
    }]).then(() => refreshActivities())

    onLeadUpdated({ ...lead, status: newStatus })
  }

  async function handleVehicleChange(vId: string | null) {
    setVehicleId(vId)
    const { error } = await supabase.from('leads').update({ vehicle_id: vId }).eq('id', lead.id)
    if (!error) onLeadUpdated({ ...lead, vehicle_id: vId })
    else setVehicleId(lead.vehicle_id)
  }

  // Fix #6: notes dirty check correctly handles null vs ''
  function handleNotesChange(v: string) {
    setNotes(v)
    setNotesDirty(v !== (lead.notes ?? ''))
  }

  async function saveNotes() {
    setSavingNotes(true)
    const { error } = await supabase.from('leads').update({ notes }).eq('id', lead.id)
    setSavingNotes(false)
    if (!error) {
      setNotesDirty(false)
      onLeadUpdated({ ...lead, notes })
    }
  }

  async function addQuickActivity(type: Exclude<QuickActivityType, 'note'>) {
    setAddingAct(true)
    await supabase.from('activities').insert([{
      lead_id: lead.id,
      type,
      title: QUICK_TITLE[type],           // Fix #8: no 'note' key lookup
      done: type !== 'meeting',
    }])
    setAddingAct(false)
    refreshActivities()
  }

  async function addNoteActivity() {
    if (!quickNote.trim()) return
    setAddingAct(true)
    await supabase.from('activities').insert([{
      lead_id: lead.id,
      type: 'note',
      title: 'Note interne',
      body: quickNote.trim(),
      done: true,
    }])
    setQuickNote('')
    setAddingAct(false)
    refreshActivities()
  }

  async function refreshActivities() {
    const { data } = await supabase.from('activities')
      .select('*, users(full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
    setActivities((data ?? []) as Activity[])
  }

  const stale = isStale(lead)

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-[420px] bg-card border-l border-border shadow-2xl flex flex-col h-full overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p dir="auto" className="font-bold text-foreground text-base leading-tight break-words">
              {lead.full_name}
            </p>
            {lead.phone && (
              <a href={`tel:${lead.phone}`}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3" /> {lead.phone}
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}
                className="text-xs text-muted-foreground hover:underline flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3" /> {lead.email}
              </a>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Meta */}
          <div className="px-5 py-4 border-b border-border space-y-3">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Statut</span>
              <select value={panelStatus}
                onChange={e => handleStatusChange(e.target.value as Lead['status'])}
                className="flex-1 h-8 px-2 rounded-lg border border-border text-xs font-medium outline-none focus:border-indigo-400 bg-background text-foreground">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {lead.wilaya && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Wilaya</span>
                <span className="text-xs text-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground" /> {lead.wilaya}
                </span>
              </div>
            )}

            {lead.model_wanted && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Modèle</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${modelColor(lead.model_wanted)}`}>
                  <Car className="w-3 h-3" /> {lead.model_wanted}
                </span>
              </div>
            )}

            {lead.budget_dzd && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Budget</span>
                <span className="text-xs text-emerald-700 font-semibold">
                  {formatDZD(lead.budget_dzd)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Source</span>
              <span className="text-xs text-foreground">
                {SOURCE_ICONS[lead.source]} {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Créé</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(lead.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
              </span>
            </div>

            {stale && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">
                  Sans contact depuis +48h — relance urgente
                </p>
              </div>
            )}
          </div>

          {/* Vehicle selector */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Véhicule proposé</p>
            <select value={vehicleId ?? ''} onChange={e => handleVehicleChange(e.target.value || null)}
              className="w-full h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition bg-background text-foreground">
              <option value="">— Aucun —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year ?? ''}
                  {v.color ? ` · ${v.color}` : ''}
                  {v.price_dzd ? ` — ${formatDZD(v.price_dzd)}` : ''}
                </option>
              ))}
            </select>
            {vehicles.length === 0 && !loadingAct && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Car className="w-3 h-3" /> Aucun véhicule disponible en stock.
              </p>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Action rapide</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {QUICK_ACTIONS.map(a => (
                <button key={a.type} onClick={() => addQuickActivity(a.type)}
                  disabled={addingAct}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${a.cls} disabled:opacity-50`}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={quickNote} onChange={e => setQuickNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNoteActivity() }}
                placeholder="Note rapide…"
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition" />
              <button onClick={addNoteActivity} disabled={!quickNote.trim() || addingAct}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
            <textarea value={notes} onChange={e => handleNotesChange(e.target.value)}
              rows={3}
              placeholder="Notes, observations, informations client…"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition resize-none" />
            <button onClick={saveNotes} disabled={savingNotes || !notesDirty}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 transition disabled:opacity-40">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savingNotes ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>

          {/* Activity history */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Historique
            </p>
            {loadingAct ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 rounded-full border-2 border-indigo-400/30 border-t-indigo-500 animate-spin" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Aucune activité enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {activities.map(act => (
                  <div key={act.id} className="flex gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${ACTIVITY_ICON_CLS[act.type]}`}>
                      {act.type === 'call'          && <Phone      className="w-3.5 h-3.5" />}
                      {act.type === 'email'         && <Mail       className="w-3.5 h-3.5" />}
                      {act.type === 'meeting'       && <Calendar   className="w-3.5 h-3.5" />}
                      {act.type === 'note'          && <FileText   className="w-3.5 h-3.5" />}
                      {act.type === 'status_change' && <RefreshCw  className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-foreground leading-tight">{act.title}</p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                          {format(new Date(act.created_at), 'd MMM, HH:mm', { locale: fr })}
                        </span>
                      </div>
                      {act.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{act.body}</p>}
                      {(act as Activity & { users?: { full_name: string } }).users?.full_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          par {(act as Activity & { users: { full_name: string } }).users.full_name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [leads,        setLeads]        = useState<Lead[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeLead,   setActiveLead]   = useState<Lead | null>(null)   // drag ghost source
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)   // side panel
  const [modalOpen,    setModalOpen]    = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)
  const [lastRefresh,  setLastRefresh]  = useState<Date>(new Date())
  const [dndError,     setDndError]     = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  // Require ≥8px mouse move before drag fires — keeps click-to-open working
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setLeads((data ?? []) as Lead[])
      setLastRefresh(new Date())
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchLeads()
    intervalRef.current = setInterval(() => fetchLeads(true), 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchLeads])

  // Keep side panel in sync when leads refresh
  useEffect(() => {
    if (!selectedLead) return
    const refreshed = leads.find(l => l.id === selectedLead.id)
    if (refreshed && refreshed !== selectedLead) setSelectedLead(refreshed)
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── DnD ───────────────────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent) {
    setDndError(null)
    setActiveLead(leads.find(l => l.id === active.id) ?? null)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveLead(null)
    if (!over) return

    const leadId    = active.id as string
    const colId     = over.id as ColId
    const lead      = leads.find(l => l.id === leadId)
    if (!lead) return

    const fromCol   = statusToCol(lead.status)
    if (fromCol === colId) return              // no column change — nothing to do

    const newStatus  = colToStatus(colId)
    const prevStatus = lead.status

    // Optimistic update — move card immediately in UI
    const apply = (s: Lead['status']) =>
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: s } : l))

    apply(newStatus)
    if (selectedLead?.id === leadId)
      setSelectedLead(s => s ? { ...s, status: newStatus } : s)

    // Fix #10: persist + rollback on failure
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)

    if (error) {
      apply(prevStatus)          // rollback
      if (selectedLead?.id === leadId)
        setSelectedLead(s => s ? { ...s, status: prevStatus } : s)
      setDndError('Échec de la mise à jour. Veuillez réessayer.')
      setTimeout(() => setDndError(null), 4000)
      return
    }

    // Log activity — fire-and-forget (non-critical)
    supabase.from('activities').insert([{
      lead_id: leadId,
      type: 'status_change',
      title: `Statut → ${LEAD_STATUS_LABELS[newStatus]}`,
      done: true,
    }])
  }

  // ── Group leads by column ─────────────────────────────────────
  const byCol = Object.fromEntries(
    COLUMNS.map(col => [
      col.id,
      leads.filter(l => col.statuses.includes(l.status)),
    ])
  ) as Record<ColId, Lead[]>

  const staleCount = (byCol.new ?? []).filter(isStale).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-10 py-6 bg-background flex-shrink-0 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
              Pipeline de Ventes
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-zinc-900 dark:text-white">Prospects</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
              {leads.length} lead{leads.length > 1 ? 's' : ''} au total
            </p>
            {staleCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-full px-2.5 py-1">
                <AlertCircle className="w-3 h-3" />
                {staleCount} sans contact +48h
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => fetchLeads(true)} disabled={refreshing}
            title={`Actualisé à ${format(lastRefresh, 'HH:mm:ss')}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition border border-zinc-200 dark:border-zinc-800 disabled:opacity-60">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualisation…' : format(lastRefresh, 'HH:mm')}
          </button>

          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition shadow-lg shadow-indigo-600/20">
            <Plus className="w-4 h-4" /> Nouveau Lead
          </button>
        </div>
      </div>

      {/* ── DnD error toast ── */}
      {dndError && (
        <div className="mx-6 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex-shrink-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {dndError}
        </div>
      )}

      {/* ── Board ── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement du pipeline…</p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}      // best for kanban columns
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 px-6 py-5 h-full min-w-max">
              {COLUMNS.map(col => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  leads={byCol[col.id] ?? []}
                  onCardClick={setSelectedLead}
                />
              ))}
            </div>
          </div>

          {/*
            Fix #1: DragOverlay renders LeadCardContent (pure component) — NOT LeadCard.
            LeadCard calls useDraggable internally, which would register a duplicate
            draggable node with the same id, breaking dnd-kit's internal state.
            LeadCardContent has no hooks and is safe to render in the overlay.
          */}
          <DragOverlay dropAnimation={null}>
            {activeLead
              ? <LeadCardContent lead={activeLead} ghost />
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Modals & panels ── */}
      <AddLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => fetchLeads()}
      />

      {selectedLead && (
        <LeadSidePanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={updated => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
            setSelectedLead(updated)
          }}
        />
      )}
    </div>
  )
}
