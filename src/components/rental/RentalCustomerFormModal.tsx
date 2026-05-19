'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalCustomerFormModal — create / edit a rental customer.
// ─────────────────────────────────────────────────────────────────────
// Three sections: Identité · Documents officiels · Notes internes.
// CIN + Permis go through <DocumentUploader/> which round-trips a
// signed upload URL and returns the storage path stored on the row.
//
// On 409 (phone already exists), the modal surfaces an inline alert
// with an "Utiliser ce client" link the parent can act on.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Phone as PhoneIcon, X, ArrowRight } from 'lucide-react'
import DocumentUploader from '@/components/rental/DocumentUploader'
import { WILAYAS_58 } from '@/lib/types'

export type CustomerInitial = {
  id:                 string
  full_name:          string
  phone:              string
  email:              string | null
  cin_number:         string | null
  cin_photo_url:      string | null
  permis_number:      string | null
  permis_photo_url:   string | null
  permis_expiry:      string | null
  address:            string | null
  wilaya:             string | null
  date_naissance:     string | null
  notes:              string | null
}

type Form = {
  full_name:        string
  phone:            string
  email:            string
  cin_number:       string
  cin_photo_url:    string | null
  permis_number:    string
  permis_photo_url: string | null
  permis_expiry:    string
  address:          string
  wilaya:           string
  date_naissance:   string
  notes:            string
}

function init(c: CustomerInitial | null): Form {
  return {
    full_name:        c?.full_name        ?? '',
    phone:            c?.phone            ?? '',
    email:            c?.email            ?? '',
    cin_number:       c?.cin_number       ?? '',
    cin_photo_url:    c?.cin_photo_url    ?? null,
    permis_number:    c?.permis_number    ?? '',
    permis_photo_url: c?.permis_photo_url ?? null,
    permis_expiry:    c?.permis_expiry    ?? '',
    address:          c?.address          ?? '',
    wilaya:           c?.wilaya           ?? '',
    date_naissance:   c?.date_naissance   ?? '',
    notes:            c?.notes            ?? '',
  }
}

export default function RentalCustomerFormModal({
  customer, onClose, onSaved, onUseExisting,
}: {
  customer:        CustomerInitial | null
  onClose:         () => void
  onSaved:         (c: { id: string; full_name: string }) => void
  onUseExisting?:  (id: string) => void
}) {
  const isEdit = !!customer?.id
  const [form, setForm]   = useState<Form>(() => init(customer))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [existingId, setExistingId]     = useState<string | null>(null)
  const [existingName, setExistingName] = useState<string | null>(null)

  // Esc to close + scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Customer id passed to DocumentUploader for path scoping. On
  // create we leave it null so the uploader generates a temp UUID
  // folder; on edit we anchor to the real id.
  const docCustomerId = useMemo(() => customer?.id ?? null, [customer?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setExistingId(null); setExistingName(null)

    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      setError('Nom complet requis (≥ 2 caractères).'); return
    }
    if (!form.phone.trim()) { setError('Téléphone requis.'); return }

    setSaving(true)
    const payload = {
      full_name:        form.full_name.trim(),
      phone:            form.phone.trim(),
      email:            form.email.trim() || null,
      cin_number:       form.cin_number.trim() || null,
      cin_photo_url:    form.cin_photo_url || null,
      permis_number:    form.permis_number.trim() || null,
      permis_photo_url: form.permis_photo_url || null,
      permis_expiry:    form.permis_expiry || null,
      address:          form.address.trim() || null,
      wilaya:           form.wilaya || null,
      date_naissance:   form.date_naissance || null,
      notes:            form.notes.trim() || null,
    }
    const url    = isEdit ? `/api/rental/customers/${customer!.id}` : '/api/rental/customers'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)

    if (res.status === 409 && j?.error === 'phone_already_exists') {
      setExistingId(j?.existing_customer_id ?? null)
      setExistingName(j?.existing_customer_name ?? null)
      setError('Un client avec ce téléphone existe déjà.')
      return
    }
    if (!res.ok) { setError(j?.error ?? 'Erreur lors de la sauvegarde.'); return }

    const saved = j.customer
    onSaved({ id: saved.id, full_name: saved.full_name })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glass)',
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 backdrop-blur-md z-10"
          style={{
            borderColor: 'var(--border)',
            background:  'color-mix(in srgb, var(--bg-surface) 90%, transparent)',
          }}
        >
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            {isEdit ? 'Modifier le client' : 'Nouveau client'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-6">
          {/* ── Identité ────────────────────────────────────────── */}
          <section>
            <Subhead>Identité</Subhead>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Nom complet *" wide>
                <Input value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required placeholder="Ex. Karim Bensalem" />
              </Field>
              <Field label="Téléphone *">
                <div className="relative">
                  <PhoneIcon className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+213 555 12 34 56"
                    required
                    className="w-full h-10 ps-9 pe-3 rounded-lg text-sm transition"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="ex@email.com" />
              </Field>
              <Field label="Date de naissance">
                <Input type="date" value={form.date_naissance} onChange={(v) => setForm({ ...form, date_naissance: v })} />
              </Field>
              <Field label="Wilaya">
                <Select value={form.wilaya} onChange={(v) => setForm({ ...form, wilaya: v })}>
                  <option value="">—</option>
                  {WILAYAS_58.map((w) => <option key={w} value={w}>{w}</option>)}
                </Select>
              </Field>
              <Field label="Adresse" wide>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  placeholder="Adresse complète"
                  className="w-full px-3 py-2 rounded-lg text-sm transition resize-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </Field>
            </div>
          </section>

          {/* ── Documents ────────────────────────────────────────── */}
          <section>
            <Subhead>Documents officiels</Subhead>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div className="space-y-2">
                <Input value={form.cin_number} onChange={(v) => setForm({ ...form, cin_number: v })} placeholder="N° CIN" />
                <DocumentUploader
                  kind="cin"
                  value={form.cin_photo_url}
                  customerId={docCustomerId}
                  onChange={(p) => setForm({ ...form, cin_photo_url: p })}
                />
              </div>
              <div className="space-y-2">
                <Input value={form.permis_number} onChange={(v) => setForm({ ...form, permis_number: v })} placeholder="N° Permis" />
                <Input type="date" value={form.permis_expiry} onChange={(v) => setForm({ ...form, permis_expiry: v })} />
                <DocumentUploader
                  kind="permis"
                  value={form.permis_photo_url}
                  customerId={docCustomerId}
                  onChange={(p) => setForm({ ...form, permis_photo_url: p })}
                />
              </div>
            </div>
          </section>

          {/* ── Notes ────────────────────────────────────────────── */}
          <section>
            <Subhead>Notes internes</Subhead>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Détails internes (couleur permis, dépôt déjà versé, contraintes…)."
              className="mt-3 w-full px-3 py-2 rounded-lg text-sm transition resize-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </section>

          {/* ── Inline error / duplicate-phone hint ───────────────── */}
          {error && (
            <div
              className="px-3 py-2 rounded-xl text-sm flex items-start gap-2"
              style={{
                background: 'rgba(244,63,94,0.10)',
                border: '1px solid rgba(244,63,94,0.25)',
                color: '#fb7185',
              }}
            >
              <span className="flex-1">{error}</span>
              {existingId && onUseExisting && (
                <button
                  type="button"
                  onClick={() => onUseExisting(existingId)}
                  className="inline-flex items-center gap-1 text-xs font-semibold underline whitespace-nowrap"
                  style={{ color: '#fb7185' }}
                >
                  Utiliser{existingName ? ` « ${existingName} »` : ''}
                  <ArrowRight className="w-3 h-3 rtl:rotate-180" />
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 8px 22px -10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── form atoms ────────────────────────────────────────────────────

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

function Field({
  label, children, wide,
}: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, type = 'text', placeholder, required,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full h-10 px-3 rounded-lg text-sm transition"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  )
}

function Select({
  value, onChange, children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 px-3 rounded-lg text-sm transition"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </select>
  )
}
