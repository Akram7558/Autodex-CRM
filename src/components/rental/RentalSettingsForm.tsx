'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalSettingsForm — Owner-only editor for rental_settings.
// PATCHes /api/rental/settings.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

type Settings = {
  id:                       string | null
  showroom_id:              string
  late_return_hourly_fee:   number
  min_rental_days:          number
  max_rental_days:          number
  fuel_charge_per_quarter:  number
  deposit_min_percent:      number
  default_contract_terms:   string | null
}

export default function RentalSettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [toast, setToast]       = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/rental/settings')
      const j   = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) { setError(j?.error ?? 'Erreur de chargement.'); return }
      setSettings(j.settings as Settings)
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true); setError('')
    const res = await fetch('/api/rental/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        late_return_hourly_fee:   settings.late_return_hourly_fee,
        min_rental_days:          settings.min_rental_days,
        max_rental_days:          settings.max_rental_days,
        fuel_charge_per_quarter:  settings.fuel_charge_per_quarter,
        deposit_min_percent:      settings.deposit_min_percent,
        default_contract_terms:   settings.default_contract_terms,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j?.error ?? 'Erreur lors de la sauvegarde.'); return }
    setSettings(j.settings as Settings)
    setToast('Tarifs mis à jour')
    setTimeout(() => setToast(null), 2500)
  }

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <div className="glass-card h-[420px] rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <p className="text-sm text-rose-500">{error || 'Paramètres indisponibles.'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Tarifs &amp; règles de location
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Frais par défaut appliqués à tous les nouveaux contrats de location.
        </p>
      </div>

      <form
        onSubmit={save}
        className="glass-card p-6 rounded-2xl space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Frais retard / heure (DZD)">
            <NumberInput
              value={settings.late_return_hourly_fee}
              onChange={(n) => setSettings({ ...settings, late_return_hourly_fee: n })}
            />
          </Field>
          <Field label="Frais carburant / quart (DZD)">
            <NumberInput
              value={settings.fuel_charge_per_quarter}
              onChange={(n) => setSettings({ ...settings, fuel_charge_per_quarter: n })}
            />
          </Field>
          <Field label="Durée min. de location (jours)">
            <NumberInput
              value={settings.min_rental_days}
              onChange={(n) => setSettings({ ...settings, min_rental_days: n })}
              min={1}
            />
          </Field>
          <Field label="Durée max. de location (jours)">
            <NumberInput
              value={settings.max_rental_days}
              onChange={(n) => setSettings({ ...settings, max_rental_days: n })}
              min={1} max={365}
            />
          </Field>
          <Field label="Dépôt minimum (%)">
            <NumberInput
              value={settings.deposit_min_percent}
              onChange={(n) => setSettings({ ...settings, deposit_min_percent: n })}
              min={5} max={100}
            />
          </Field>
        </div>

        <Field label="Conditions par défaut du contrat">
          <textarea
            value={settings.default_contract_terms ?? ''}
            onChange={(e) => setSettings({ ...settings, default_contract_terms: e.target.value })}
            rows={6}
            placeholder="Saisissez les conditions générales (texte libre, apparaîtra sur les contrats imprimés)…"
            className="w-full px-3 py-2 rounded-lg text-sm transition resize-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </Field>

        {error && (
          <p
            className="px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'rgba(244,63,94,0.10)',
              border: '1px solid rgba(244,63,94,0.25)',
              color: '#fb7185',
            }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </form>

      {toast && (
        <div className="fixed bottom-6 end-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function NumberInput({
  value, onChange, min, max,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
      className="w-full h-10 px-3 rounded-lg text-sm transition"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  )
}
