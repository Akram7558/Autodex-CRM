'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Step 2: customer.
// ─────────────────────────────────────────────────────────────────────
// Search existing rental_customers (debounced) and select one, or create
// a new one inline via POST /api/rental/customers (+213 validation lives
// server-side). Blacklisted customers show a warning. Selected customer is
// held in wizard state; validity = a customer is selected.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus, Check, AlertTriangle, Loader2, X, User } from 'lucide-react'
import {
  type BookingAction, type BookingState, type RentalCustomerLite,
} from '@/components/rental/booking/types'

type ApiCustomer = {
  id: string
  full_name: string
  phone: string
  blacklisted?: boolean
  blacklist_reason?: string | null
}

function toLite(c: ApiCustomer): RentalCustomerLite {
  return {
    id: c.id,
    full_name: c.full_name,
    phone: c.phone,
    blacklisted: !!c.blacklisted,
    blacklist_reason: c.blacklist_reason ?? null,
  }
}

export default function StepCustomer({
  state, dispatch, onValidity, prefill, prefilledCustomerId,
}: {
  state:      BookingState
  dispatch:   (a: BookingAction) => void
  onValidity: (valid: boolean) => void
  /** Prospect conversion: prime the search-by-phone + the create form. */
  prefill?:   { name: string; phone: string }
  /** Convert flow: the auto-resolved customer id (shows an "identifié" note). */
  prefilledCustomerId?: string | null
}) {
  const [mode, setMode] = useState<'search' | 'create'>('search')

  // ── Search ──────────────────────────────────────────────────
  // Seed the search with the prospect's phone so an existing customer is
  // matched immediately; the create form is primed too (below).
  const [searchRaw, setSearchRaw] = useState(prefill?.phone ?? '')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<RentalCustomerLite[]>([])
  const [searching, setSearching] = useState(false)
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setSearch(searchRaw.trim()), 300)
    return () => { if (debTimer.current) clearTimeout(debTimer.current) }
  }, [searchRaw])

  useEffect(() => {
    if (mode !== 'search' || search.length === 0) { setResults([]); return }
    const ac = new AbortController()
    setSearching(true)
    ;(async () => {
      try {
        const res = await fetch('/api/rental/customers?limit=10&search=' + encodeURIComponent(search), { signal: ac.signal })
        const j = await res.json().catch(() => ({}))
        if (ac.signal.aborted) return
        setResults(res.ok ? ((j.customers ?? []) as ApiCustomer[]).map(toLite) : [])
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setResults([])
      } finally {
        if (!ac.signal.aborted) setSearching(false)
      }
    })()
    return () => ac.abort()
  }, [search, mode])

  // ── Create ──────────────────────────────────────────────────
  // Primed from the prospect so "Nouveau client" is ready to confirm if no
  // existing customer matches the phone.
  const [form, setForm] = useState(() => ({
    full_name: prefill?.name ?? '', phone: prefill?.phone ?? '',
    email: '', cin_number: '', permis_number: '',
  }))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    if (form.full_name.trim().length < 2) { setCreateError('Nom complet requis (≥ 2 caractères).'); return }
    if (!form.phone.trim()) { setCreateError('Téléphone requis.'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/rental/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          cin_number: form.cin_number.trim() || null,
          permis_number: form.permis_number.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.customer) {
        dispatch({ type: 'SET_CUSTOMER', customer: toLite(j.customer as ApiCustomer) })
        return
      }
      if (res.status === 409 && j?.error === 'phone_already_exists') {
        setCreateError(
          `Ce téléphone est déjà enregistré${j.existing_customer_name ? ` (${j.existing_customer_name})` : ''}. Recherchez-le ci-dessus.`,
        )
        setMode('search')
        setSearchRaw(form.phone.trim())
        return
      }
      setCreateError(j?.error ?? 'Erreur lors de la création du client.')
    } catch {
      setCreateError('Erreur réseau.')
    } finally {
      setCreating(false)
    }
  }

  // ── Validity ────────────────────────────────────────────────
  useEffect(() => { onValidity(state.customer != null) }, [state.customer, onValidity])

  // ── Selected customer view ──────────────────────────────────
  if (state.customer) {
    const c = state.customer
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Client sélectionné</h3>
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'var(--bg-surface)', border: '1.5px solid var(--accent)', boxShadow: '0 10px 30px -16px var(--accent-glow)' }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.full_name}</p>
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">{c.phone}</p>
            {prefilledCustomerId && c.id === prefilledCustomerId && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--accent)' }}>Client identifié depuis la demande</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_CUSTOMER', customer: null })}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 h-9 rounded-lg"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <X className="w-3.5 h-3.5" /> Changer
          </button>
        </div>
        {c.blacklisted && (
          <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
            style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold">Client sur liste noire.</span>
              {c.blacklist_reason ? ` ${c.blacklist_reason}` : ''}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Search / create switcher ────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
        <ModeTab active={mode === 'search'} onClick={() => setMode('search')} icon={<Search className="w-4 h-4" />} label="Rechercher" />
        <ModeTab active={mode === 'create'} onClick={() => setMode('create')} icon={<UserPlus className="w-4 h-4" />} label="Nouveau client" />
      </div>

      {mode === 'search' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              autoFocus
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Nom ou téléphone…"
              className="w-full h-11 ps-9 pe-3 rounded-lg text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {searching ? (
            <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Recherche…
            </p>
          ) : search.length > 0 && results.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Aucun client trouvé. Créez-en un nouveau.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SET_CUSTOMER', customer: c })}
                    className="w-full text-start rounded-xl px-4 py-3 flex items-center gap-3 transition-colors duration-150 motion-reduce:transition-none"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.full_name}</p>
                      <p className="text-xs text-[var(--text-secondary)] tabular-nums">{c.phone}</p>
                    </div>
                    {c.blacklisted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md"
                        style={{ background: 'rgba(244,63,94,0.15)', color: '#fb7185' }}>
                        <AlertTriangle className="w-3 h-3" /> Liste noire
                      </span>
                    )}
                    <Check className="w-4 h-4 opacity-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={createCustomer} className="space-y-3">
          <Field label="Nom complet *">
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="ex. Karim Benali" className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Téléphone * (+213…)">
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+213 6 12 34 56 78" inputMode="tel" className={inputCls} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email (optionnel)">
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemple.com" inputMode="email" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="N° CIN (optionnel)">
              <input value={form.cin_number} onChange={(e) => setForm((f) => ({ ...f, cin_number: e.target.value }))}
                className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="N° permis (optionnel)">
            <input value={form.permis_number} onChange={(e) => setForm((f) => ({ ...f, permis_number: e.target.value }))}
              className={inputCls} style={inputStyle} />
          </Field>

          {createError && <p className="text-xs" style={{ color: '#fb7185' }}>{createError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Créer et sélectionner
          </button>
        </form>
      )}
    </div>
  )
}

const inputCls = 'w-full h-10 px-3 rounded-lg text-sm'
const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
      style={active
        ? { background: 'var(--accent)', color: '#fff' }
        : { background: 'transparent', color: 'var(--text-secondary)' }}
    >
      {icon}{label}
    </button>
  )
}
