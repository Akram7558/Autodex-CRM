'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { VEHICLE_STATUS_LABELS, type Vehicle } from '@/lib/types'
import { Car, Plus, Search, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Helpers ─────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger'

function statusVariant(status: Vehicle['status']): BadgeVariant {
  return { available: 'success', reserved: 'warning', sold: 'danger' }[status] as BadgeVariant
}

function formatPrice(p: number | null) {
  if (!p) return '—'
  return new Intl.NumberFormat('fr-DZ', { style: 'decimal', maximumFractionDigits: 0 }).format(p) + ' DZD'
}

const STATUS_FILTERS: { value: Vehicle['status'] | 'all'; label: string }[] = [
  { value: 'all',       label: 'Tous' },
  { value: 'available', label: 'Disponible' },
  { value: 'reserved',  label: 'Réservé' },
  { value: 'sold',      label: 'Vendu' },
]

const BRANDS = ['Tous', 'Geely', 'Chery', 'Fiat', 'Renault', 'DFSK', 'Toyota', 'Hyundai', 'Kia', 'Peugeot']

// ── Brand color dot ──────────────────────────────────────────
function BrandDot({ brand }: { brand: string }) {
  const colors: Record<string, string> = {
    Geely: 'bg-blue-500', Chery: 'bg-red-500', Fiat: 'bg-orange-500',
    Renault: 'bg-yellow-500', DFSK: 'bg-purple-500', Toyota: 'bg-indigo-500',
    Hyundai: 'bg-sky-500', Kia: 'bg-rose-500', Peugeot: 'bg-gray-500',
  }
  return <span className={`w-2 h-2 rounded-full inline-block ${colors[brand] ?? 'bg-gray-400'}`} />
}

// ── Add Vehicle Modal ────────────────────────────────────────
function AddVehicleModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    brand: 'Geely', model: '', year: new Date().getFullYear().toString(),
    color: '', price_dzd: '', status: 'available' as Vehicle['status'],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.brand || !form.model) { setError('Marque et modèle sont requis.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('vehicles').insert([{
      brand:     form.brand,
      model:     form.model.trim(),
      year:      form.year ? parseInt(form.year) : null,
      color:     form.color || null,
      price_dzd: form.price_dzd ? parseFloat(form.price_dzd.replace(/\s/g, '')) : null,
      status:    form.status,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ brand: 'Geely', model: '', year: new Date().getFullYear().toString(), color: '', price_dzd: '', status: 'available' })
    setError('')
    onSaved()
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Ajouter un véhicule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Marque *</label>
              <select
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-white"
              >
                {BRANDS.filter(b => b !== 'Tous').map(b => <option key={b} value={b}>{b}</option>)}
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Modèle *</label>
              <input
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="ex. Emgrand, Tiggo 4…"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
              <input
                type="number"
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                placeholder="2024"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Couleur</label>
              <input
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                placeholder="ex. Blanc Perle"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix (DZD)</label>
              <input
                value={form.price_dzd}
                onChange={e => setForm(f => ({ ...f, price_dzd: e.target.value }))}
                placeholder="ex. 3850000"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as Vehicle['status'] }))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-white"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Réservé</option>
                <option value="sold">Vendu</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60">
              {saving ? 'Enregistrement…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function VehiculesPage() {
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([])
  const [loading,    setLoading]    = useState(true)
  const [statusFilter, setStatusFilter] = useState<Vehicle['status'] | 'all'>('all')
  const [brandFilter,  setBrandFilter]  = useState('Tous')
  const [search,     setSearch]     = useState('')
  const [modalOpen,  setModalOpen]  = useState(false)

  async function fetchVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
    setVehicles((data ?? []) as Vehicle[])
    setLoading(false)
  }

  useEffect(() => { fetchVehicles() }, [])

  const filtered = useMemo(() => {
    return vehicles.filter(v => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false
      if (brandFilter  !== 'Tous' && v.brand !== brandFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          v.brand.toLowerCase().includes(q) ||
          v.model.toLowerCase().includes(q) ||
          (v.color ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [vehicles, statusFilter, brandFilter, search])

  const availCount  = vehicles.filter(v => v.status === 'available').length
  const reservCount = vehicles.filter(v => v.status === 'reserved').length
  const soldCount   = vehicles.filter(v => v.status === 'sold').length

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Véhicules</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {availCount} disponible{availCount !== 1 ? 's' : ''} · {reservCount} réservé{reservCount !== 1 ? 's' : ''} · {soldCount} vendu{soldCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" /> Ajouter véhicule
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Disponibles', count: availCount, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Réservés',    count: reservCount, color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
          { label: 'Vendus',      count: soldCount,   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className={`text-xs font-medium mt-0.5 ${s.color} opacity-80`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition w-52"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={brandFilter}
          onChange={e => setBrandFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white text-gray-700"
        >
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Vehicle grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-400/30 border-t-indigo-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center flex flex-col items-center gap-3">
          <Car className="w-10 h-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium text-foreground">Aucun véhicule</p>
            <p className="text-xs text-muted-foreground mt-1">Aucun véhicule ne correspond à vos filtres.</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter véhicule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(v => (
            <div
              key={v.id}
              className="rounded-xl bg-card border border-border p-4 hover:shadow-md hover:border-indigo-400/60 transition-all duration-150"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BrandDot brand={v.brand} />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{v.brand}</span>
                </div>
                <Badge variant={statusVariant(v.status)}>
                  {VEHICLE_STATUS_LABELS[v.status]}
                </Badge>
              </div>

              {/* Car icon placeholder */}
              <div className="w-full h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center mb-3 border border-gray-100">
                <Car className="w-10 h-10 text-gray-300" />
              </div>

              {/* Details */}
              <div className="space-y-1">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                  {v.brand} {v.model} {v.year && <span className="font-normal text-gray-400">{v.year}</span>}
                </h3>
                {v.color && (
                  <p className="text-xs text-gray-500">{v.color}</p>
                )}
                {v.price_dzd && (
                  <p className="text-sm font-bold text-indigo-600 mt-1">
                    {formatPrice(v.price_dzd)}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[10px] text-gray-400">
                  {format(new Date(v.created_at), 'd MMM yyyy', { locale: fr })}
                </p>
                <select
                  value={v.status}
                  onChange={async e => {
                    const status = e.target.value as Vehicle['status']
                    await supabase.from('vehicles').update({ status }).eq('id', v.id)
                    setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, status } : x))
                  }}
                  className="text-xs h-6 px-2 rounded-md border border-gray-200 bg-white text-gray-600 outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="available">Disponible</option>
                  <option value="reserved">Réservé</option>
                  <option value="sold">Vendu</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddVehicleModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchVehicles} />
    </div>
  )
}
