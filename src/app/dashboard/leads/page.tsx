'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import {
  LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS,
  type Lead,
} from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Search, Plus, Phone, Mail, MapPin,
  SlidersHorizontal, Clock, User2,
} from 'lucide-react'

// ── Status tabs config ───────────────────────────────────────
const STATUS_TABS: { value: Lead['status'] | 'all'; label: string }[] = [
  { value: 'all',       label: 'Tous' },
  { value: 'new',       label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'qualified', label: 'Qualifié' },
  { value: 'proposal',  label: 'Offre' },
  { value: 'won',       label: 'Gagné' },
  { value: 'lost',      label: 'Perdu' },
]

// ── Variant helpers ──────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'info' | 'purple' | 'danger' | 'indigo' | 'orange'

function statusVariant(status: Lead['status']): BadgeVariant {
  const map: Record<Lead['status'], BadgeVariant> = {
    new: 'info', contacted: 'warning', qualified: 'purple',
    proposal: 'indigo', won: 'success', lost: 'danger',
  }
  return map[status]
}

function sourceVariant(source: Lead['source']): BadgeVariant {
  const map: Record<Lead['source'], BadgeVariant> = {
    'walk-in': 'default', phone: 'info', website: 'purple',
    referral: 'indigo', social: 'warning',
  }
  return map[source]
}

// ── Modal: Add Lead ──────────────────────────────────────────
function AddLeadModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', wilaya: '',
    source: 'walk-in' as Lead['source'],
    status: 'new' as Lead['status'],
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const wilayas = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Sétif', 'Blida', 'Batna', 'Tizi Ouzou', 'Béjaïa', 'Autre']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('leads').insert([{
      full_name: form.full_name.trim(),
      phone:     form.phone || null,
      email:     form.email || null,
      wilaya:    form.wilaya || null,
      source:    form.source,
      status:    form.status,
      notes:     form.notes || null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ full_name: '', phone: '', email: '', wilaya: '', source: 'walk-in', status: 'new', notes: '' })
    setError('')
    onSaved()
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Nouveau prospect</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
              <input
                dir="auto"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="ex. Karim Benali"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="0555 XX XX XX"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@exemple.com"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Wilaya</label>
              <select
                value={form.wilaya}
                onChange={e => setForm(f => ({ ...f, wilaya: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-white"
              >
                <option value="">— Choisir —</option>
                {wilayas.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value as Lead['source'] }))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-white"
              >
                {Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Observations, budget, modèle souhaité…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function LeadsPage() {
  const [leads,       setLeads]       = useState<Lead[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<Lead['status'] | 'all'>('all')
  const [search,      setSearch]      = useState('')
  const [modalOpen,   setModalOpen]   = useState(false)

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }

  useEffect(() => { fetchLeads() }, [])

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (activeTab !== 'all' && l.status !== activeTab) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          l.full_name.toLowerCase().includes(q) ||
          (l.phone ?? '').toLowerCase().includes(q) ||
          (l.wilaya ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [leads, activeTab, search])

  // Count per status for tab badges
  const countByStatus = useMemo(
    () => Object.fromEntries(STATUS_TABS.map(t => [t.value, t.value === 'all' ? leads.length : leads.filter(l => l.status === t.value).length])),
    [leads]
  )

  async function updateStatus(id: string, status: Lead['status']) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} prospect{leads.length > 1 ? 's' : ''} au total</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau prospect
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, tél., wilaya…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === tab.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
              activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {countByStatus[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Prospect</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Contact</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Wilaya</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Statut</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-indigo-400/30 border-t-indigo-500 animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    Aucun prospect trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map(lead => (
                  <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors group">
                    {/* Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                          <User2 className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <div>
                          <p dir="auto" className="font-medium text-gray-900 leading-none">{lead.full_name}</p>
                          {lead.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-[180px]">{lead.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Contact */}
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        {lead.phone && (
                          <p className="flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="w-3 h-3" /> {lead.phone}
                          </p>
                        )}
                        {lead.email && (
                          <p className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="w-3 h-3" /> {lead.email}
                          </p>
                        )}
                        {!lead.phone && !lead.email && <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    </td>
                    {/* Wilaya */}
                    <td className="px-5 py-3.5">
                      {lead.wilaya ? (
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="w-3 h-3 text-gray-400" /> {lead.wilaya}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Source */}
                    <td className="px-5 py-3.5">
                      <Badge variant={sourceVariant(lead.source)}>
                        {LEAD_SOURCE_LABELS[lead.source]}
                      </Badge>
                    </td>
                    {/* Status (editable) */}
                    <td className="px-5 py-3.5">
                      <select
                        value={lead.status}
                        onChange={e => updateStatus(lead.id, e.target.value as Lead['status'])}
                        className="text-xs rounded-full px-2 py-1 border-none outline-none cursor-pointer bg-transparent font-medium"
                        style={{ minWidth: 90 }}
                      >
                        {Object.entries(LEAD_STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      {/* Colored badge overlay */}
                      <Badge variant={statusVariant(lead.status)} className="pointer-events-none absolute opacity-0">
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Badge>
                    </td>
                    {/* Date */}
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(lead.created_at), 'd MMM yy', { locale: fr })}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <select
                          value={lead.status}
                          onChange={e => updateStatus(lead.id, e.target.value as Lead['status'])}
                          title="Changer le statut"
                          className="text-xs h-7 px-2 rounded-md border border-gray-200 bg-white text-gray-600 outline-none focus:border-indigo-400"
                        >
                          {Object.entries(LEAD_STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      <AddLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchLeads}
      />
    </div>
  )
}
