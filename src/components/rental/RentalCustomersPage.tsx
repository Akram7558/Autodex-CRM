'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalCustomersPage — Owner / Manager view of all rental_customers.
// ─────────────────────────────────────────────────────────────────────
// Debounced search, blacklist filter, sort dropdown, paginated grid.
// Click a card → /dashboard/location/clients/[id].
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Users, MessageCircle, ShieldX,
} from 'lucide-react'
import RentalCustomerFormModal from '@/components/rental/RentalCustomerFormModal'

const PAGE_SIZE = 50

type Customer = {
  id:               string
  full_name:        string
  phone:            string
  email:            string | null
  wilaya:           string | null
  blacklisted:      boolean
  blacklist_reason: string | null
  total_rentals:    number
  total_spent:      number
  created_at:       string
}

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '0'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((s) => s.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function digitsOnly(p: string): string { return p.replace(/\D/g, '') }

type SortKey = 'created_at' | 'full_name' | 'most_active'
type BlackFilter = 'all' | 'blacklisted'

export default function RentalCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch]       = useState('')
  const [sortBy, setSortBy]       = useState<SortKey>('created_at')
  const [filter, setFilter]       = useState<BlackFilter>('all')
  const [page, setPage]           = useState(0)

  const [formOpen, setFormOpen]   = useState(false)

  // Debounce the search input — 300ms.
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => { setSearch(searchRaw.trim()); setPage(0) }, 300)
    return () => { if (debTimer.current) clearTimeout(debTimer.current) }
  }, [searchRaw])

  const fetchCustomers = useCallback(async () => {
    setLoading(true); setError(null)
    const sp = new URLSearchParams()
    if (search) sp.set('search', search)
    if (filter === 'blacklisted') sp.set('blacklisted', 'true')
    sp.set('sort_by', sortBy)
    sp.set('limit',  String(PAGE_SIZE))
    sp.set('offset', String(page * PAGE_SIZE))
    const res = await fetch('/api/rental/customers?' + sp.toString())
    const j = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(j?.error ?? 'Erreur de chargement.')
      setCustomers([]); setTotal(0)
      return
    }
    setCustomers((j.customers ?? []) as Customer[])
    setTotal(j.total ?? 0)
  }, [search, filter, sortBy, page])

  useEffect(() => { void fetchCustomers() }, [fetchCustomers])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Clients location
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gérez vos clients de location.
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
            <bdi className="tabular-nums">{total}</bdi> clients
          </span>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Plus className="w-4 h-4" />
            Nouveau client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 rounded-xl flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Rechercher par nom ou téléphone…"
            className="w-full ps-10 pe-4 py-2.5 rounded-lg text-sm transition"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex items-center gap-1">
          <FilterChip active={filter === 'all'}        onClick={() => { setFilter('all');        setPage(0) }}>Tous</FilterChip>
          <FilterChip active={filter === 'blacklisted'} onClick={() => { setFilter('blacklisted'); setPage(0) }}>Blacklistés</FilterChip>
        </div>

        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as SortKey); setPage(0) }}
          className="h-9 px-3 rounded-lg text-xs font-medium cursor-pointer"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="created_at">Récents</option>
          <option value="full_name">Nom (A → Z)</option>
          <option value="most_active">Plus actifs</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-3 py-2.5 rounded-xl text-sm"
          style={{
            background: 'rgba(244,63,94,0.10)',
            border: '1px solid rgba(244,63,94,0.25)',
            color: '#fb7185',
          }}
        >
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        // Skeleton mirrors the real client card anatomy (avatar + name/phone
        // lines + footer stats) so its height matches and there's no reflow
        // when the real cards land. Header + filters above stay live.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                  <div className="h-4 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
                </div>
              </div>
              <div
                className="flex items-center justify-between pt-2 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="h-3 w-16 rounded bg-[var(--bg-elevated)] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="glass-card rounded-2xl py-16 text-center flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            }}
          >
            <Users className="w-7 h-7" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white">Aucun client pour le moment</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
            Ajoutez votre premier client de location pour démarrer.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="mt-2 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
          >
            <Plus className="w-4 h-4" /> Nouveau client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/location/clients/${c.id}`}
              className="glass-card rounded-2xl p-5 flex flex-col gap-3 transition-colors duration-150 hover:border-emerald-500/30"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {initialsOf(c.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                    {c.full_name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    <bdi>{c.phone}</bdi>
                    {c.wilaya && <span className="ms-2">· {c.wilaya}</span>}
                  </p>
                </div>
                <a
                  href={`https://wa.me/${digitsOnly(c.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors"
                  style={{
                    background: 'rgba(37, 211, 102, 0.12)',
                    color: '#22c55e',
                  }}
                  title="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-white/[0.04]">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                    <bdi>{c.total_rentals}</bdi>
                  </span> location{c.total_rentals > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Total <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <bdi>{formatDzd(c.total_spent)} DA</bdi>
                  </span>
                </div>
              </div>

              {c.blacklisted && (
                <div
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 self-start"
                  style={{
                    background: 'rgba(244,63,94,0.12)',
                    color: '#fb7185',
                  }}
                  title={c.blacklist_reason ?? 'Blacklisté'}
                >
                  <ShieldX className="w-3 h-3" />
                  Blacklisté
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-zinc-500 dark:text-zinc-400">
            Page <bdi className="tabular-nums">{page + 1}</bdi> / <bdi className="tabular-nums">{totalPages}</bdi>
            <span className="ms-2 text-zinc-400">· <bdi className="tabular-nums">{total}</bdi> clients</span>
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              ‹
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <RentalCustomerFormModal
          customer={null}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); fetchCustomers() }}
          onUseExisting={(id) => { setFormOpen(false); window.location.href = `/dashboard/location/clients/${id}` }}
        />
      )}
    </div>
  )
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 h-9 rounded-lg text-xs font-medium transition-colors duration-150"
      style={
        active
          ? {
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '0 4px 14px var(--accent-glow)',
            }
          : {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }
      }
    >
      {children}
    </button>
  )
}
