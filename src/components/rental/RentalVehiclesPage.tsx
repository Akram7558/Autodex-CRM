'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalVehiclesPage — fleet management for /dashboard/location/vehicules.
// ─────────────────────────────────────────────────────────────────────
// Lists rental_vehicles for the caller's showroom, exposes a search +
// "Ajouter un véhicule" CTA, and surfaces the Classique 5-vehicle cap
// (count + disabled CTA + UpgradeModal) when the plan is Classique.
//
// Plan info is passed in as a prop from the server page so we don't
// re-query supabase from the browser.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Pencil, Trash2, MoreVertical, Car as CarIcon } from 'lucide-react'
import RentalVehicleFormModal from '@/components/rental/RentalVehicleFormModal'
import UpgradeModal from '@/components/rental/UpgradeModal'

const CLASSIQUE_LIMIT = 5

export type PlanType = 'classique' | 'totale' | 'location'

type Vehicle = {
  id:                   string
  marque:               string
  modele:               string
  annee:                number
  immatriculation:      string
  couleur:              string | null
  type_carburant:       string | null
  boite_vitesse:        string | null
  nb_places:            number | null
  photos_urls:          string[]
  description:          string | null
  daily_rate:           number
  weekly_rate:          number | null
  monthly_rate:         number | null
  deposit_amount:       number
  km_included_per_day:  number | null
  extra_km_rate:        number | null
  is_active:            boolean
  created_at:           string
  // Pre-signed (server-side, 1h) read URL for photos_urls[0]; null when none.
  photo_signed_url:     string | null
}

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

export default function RentalVehiclesPage({
  planType, canEdit,
}: {
  planType: PlanType
  canEdit:  boolean
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch]       = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<Vehicle | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [menuOpenId, setMenuOpenId]   = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function flashToast(m: string) { setToast(m); setTimeout(() => setToast(null), 2500) }

  // Debounce the search input — 300ms (mirrors the clients page) so the fleet
  // isn't refetched on every keystroke.
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setSearch(searchRaw.trim()), 300)
    return () => { if (debTimer.current) clearTimeout(debTimer.current) }
  }, [searchRaw])

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await fetch('/api/rental/vehicles?' + params.toString())
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json?.error ?? 'Erreur de chargement.')
      setVehicles([])
      return
    }
    setVehicles((json.vehicles ?? []) as Vehicle[])
  }, [search])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const activeCount = useMemo(
    () => vehicles.filter((v) => v.is_active).length,
    [vehicles],
  )
  const atLimit = planType === 'classique' && activeCount >= CLASSIQUE_LIMIT

  function openCreate() {
    if (atLimit) { setUpgradeOpen(true); return }
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(v: Vehicle) {
    setEditing(v)
    setFormOpen(true)
    setMenuOpenId(null)
  }

  async function handleDelete(v: Vehicle) {
    const res = await fetch(`/api/rental/vehicles/${v.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flashToast(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    const j = await res.json().catch(() => ({}))
    flashToast(j?.soft ? 'Véhicule désactivé' : 'Véhicule supprimé')
    setConfirmDelete(null)
    fetchAll()
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Flotte de location
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gérez les véhicules disponibles à la location.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold"
            style={{
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              color: 'var(--accent)',
            }}
          >
            {vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''}
          </span>
          <span
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {planType === 'classique'
              ? <>Classique · <bdi className="tabular-nums">{activeCount}/{CLASSIQUE_LIMIT}</bdi></>
              : planType === 'totale'
                ? <>La Totale · <bdi>∞</bdi></>
                : <>Location · <bdi>∞</bdi></>}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
                opacity: atLimit ? 0.85 : 1,
              }}
              title={atLimit ? 'Limite Classique atteinte' : 'Ajouter un véhicule'}
            >
              <Plus className="w-4 h-4" />
              Ajouter un véhicule
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="glass-card p-3 rounded-xl flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Rechercher par marque, modèle ou immatriculation…"
            className="w-full ps-10 pe-4 py-2.5 rounded-lg text-sm transition"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-3 py-2.5 rounded-xl text-sm"
          style={{
            background: 'rgba(244, 63, 94, 0.10)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            color: '#fb7185',
          }}
        >
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        // Skeleton mirrors the real vehicle card anatomy (aspect-[4/3] image
        // + p-4 content + footer) so its height matches and there's no reflow
        // when the real cards land. Header + search above stay live.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="glass-card rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="h-4 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
                <div
                  className="mt-auto pt-2 border-t flex items-center justify-between"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="h-3 w-16 rounded bg-[var(--bg-elevated)] animate-pulse" />
                  <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="glass-card rounded-2xl py-16 text-center flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            }}
          >
            <CarIcon className="w-7 h-7" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white">
            Aucun véhicule pour le moment
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
            Ajoutez votre premier véhicule de location pour démarrer.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-2 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 8px 22px -10px var(--accent-glow)',
              }}
            >
              <Plus className="w-4 h-4" /> Ajouter un véhicule
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="glass-card rounded-2xl overflow-hidden flex flex-col lift-on-hover"
            >
              <VehicleCardImage url={v.photo_signed_url ?? null}>
                <span
                  className="absolute top-2 end-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1"
                  style={{
                    background: v.is_active ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)',
                    color: v.is_active ? '#10b981' : '#fb7185',
                    boxShadow: 'inset 0 0 0 1px ' + (v.is_active ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'),
                  }}
                >
                  {v.is_active ? 'Actif' : 'Inactif'}
                </span>
              </VehicleCardImage>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      {v.marque} {v.modele}
                      <span className="text-zinc-500 dark:text-zinc-400 font-normal"> · <bdi>{v.annee}</bdi></span>
                    </h3>
                    <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <bdi>{v.immatriculation}</bdi>
                    </p>
                  </div>
                  {canEdit && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuOpenId(menuOpenId === v.id ? null : v.id)}
                        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                        aria-label="Options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpenId === v.id && (
                        <div
                          className="absolute end-0 top-full mt-1 w-44 rounded-xl py-1 z-10 shadow-2xl"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                          }}
                          onMouseLeave={() => setMenuOpenId(null)}
                        >
                          <button
                            type="button"
                            onClick={() => openEdit(v)}
                            className="w-full px-3 py-2 text-sm text-start flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Pencil className="w-4 h-4" /> Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMenuOpenId(null); setConfirmDelete(v) }}
                            className="w-full px-3 py-2 text-sm text-start flex items-center gap-2 hover:bg-rose-500/10 text-rose-500 dark:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" /> Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-2 border-t border-zinc-100 dark:border-white/[0.04] flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {v.type_carburant ?? '—'}
                    {v.boite_vitesse ? ` · ${v.boite_vitesse}` : ''}
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <bdi>{formatDzd(v.daily_rate)} DZD</bdi>
                    <span className="text-[10px] font-medium opacity-80 ms-1">/ jour</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {formOpen && (
        <RentalVehicleFormModal
          initial={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={() => {
            setFormOpen(false); setEditing(null)
            flashToast(editing ? 'Véhicule mis à jour' : 'Véhicule ajouté')
            fetchAll()
          }}
          onPlanLimitReached={() => {
            setFormOpen(false); setEditing(null)
            setUpgradeOpen(true)
          }}
        />
      )}

      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="rounded-2xl p-6 w-full max-w-sm"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-glass)',
            }}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
              Supprimer ce véhicule ?
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {confirmDelete.marque} {confirmDelete.modele}
              </span>
              {' '}sera supprimé. Si des contrats y sont liés, il sera automatiquement
              désactivé à la place.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Trash2 className="w-4 h-4 inline-block me-1" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 end-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Card image — renders the pre-signed read URL (1h) that the list API now
// bulk-signs server-side from `rental_vehicles.photos_urls[0]`. When the
// vehicle has no photo (url null), shows the emerald gradient + Car icon
// placeholder used in Phase 1.
// ─────────────────────────────────────────────────────────────────────

function VehicleCardImage({
  url, children,
}: { url: string | null; children?: React.ReactNode }) {
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 25%, transparent), color-mix(in srgb, var(--accent) 5%, transparent))',
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <CarIcon className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.45 }} />
        </div>
      )}
      {children}
    </div>
  )
}
