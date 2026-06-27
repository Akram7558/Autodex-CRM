'use client'
// ─────────────────────────────────────────────────────────────────────
// AddRentalProspectModal — manual creation of a rental prospect.
// ─────────────────────────────────────────────────────────────────────
// Mirrors the sales AddLeadModal: a { open, onClose, onSaved } dialog that
// does a DIRECT browser supabase insert into rental_prospects (RLS allows
// owner/manager/closer when showroom_id = their showroom). No server route,
// no migration. On success → onSaved() (parent re-fetches) then onClose().
// Styled with the Location module tokens (var(--accent)/--bg-*/--text-*).
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentShowroomId } from '@/lib/auth'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import { RENTAL_PROSPECT_REASONS } from '@/lib/rental/prospects'

type Form = {
  full_name:    string
  phone:        string
  reason:       string
  reason_other: string
  start_date:   string
  end_date:     string
  message:      string
}
const EMPTY: Form = {
  full_name: '', phone: '', reason: '', reason_other: '',
  start_date: '', end_date: '', message: '',
}

const inputCls =
  'w-full h-10 px-3 rounded-lg text-sm outline-none transition-colors duration-150 ' +
  'motion-reduce:transition-none focus:ring-2 focus:ring-[var(--accent)]/25'
const inputStyle = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
} as const

export default function AddRentalProspectModal({
  open, onClose, onSaved,
}: {
  open:    boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm]     = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [phoneError, setPhoneError] = useState('')

  function set(k: keyof Form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(''); setPhoneError('')

    const full_name = form.full_name.trim()
    if (!full_name) { setError('Le nom complet est requis.'); return }

    // Phone — required + normalized (+213…). Inline field error on failure.
    let phone: string
    try {
      phone = normalizePhone(form.phone)
    } catch (err) {
      setPhoneError(err instanceof PhoneNormalizeError ? err.message : 'Téléphone invalide.')
      return
    }

    // Reason — required, from the allowed set; reason_other required for 'autre'.
    if (!form.reason) { setError('Le motif est requis.'); return }
    const reason_other = form.reason === 'autre' ? form.reason_other.trim() : ''
    if (form.reason === 'autre' && !reason_other) { setError('Veuillez préciser le motif.'); return }

    // Dates — optional; if BOTH set, end >= start (avoid the DB CHECK).
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('La date de fin doit être postérieure ou égale au début.'); return
    }

    setSaving(true)

    // Multi-tenant: stamp the showroom from the current user. RLS rejects the
    // insert if this is missing or wrong.
    const showroomId = await getCurrentShowroomId()
    if (!showroomId) {
      setSaving(false)
      setError("Aucun showroom associé à votre compte. Contactez l'administrateur.")
      return
    }

    const { error: err } = await supabase.from('rental_prospects').insert([{
      showroom_id:        showroomId,
      full_name,
      phone,
      reason:             form.reason,
      reason_other:       reason_other || null,
      desired_start_date: form.start_date || null,
      desired_end_date:   form.end_date || null,
      message:            form.message.trim() || null,
      status:             'nouvelle',
      source:             'manuel',
    }])

    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(EMPTY)
    onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {/* Header (fixed) */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Ajouter un client</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Nouvelle demande de location (statut « Nouvelle »)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none hover:bg-[var(--bg-elevated)]"
            style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Nom complet *</label>
            <input dir="auto" value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
              placeholder="ex. Karim Benali" className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Téléphone *</label>
            <input value={form.phone} onChange={(e) => { set('phone', e.target.value); if (phoneError) setPhoneError('') }}
              placeholder="0555 XX XX XX" inputMode="tel"
              className={inputCls} style={inputStyle} />
            {phoneError && <p className="mt-1 text-[11px]" style={{ color: '#fb7185' }}>{phoneError}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Motif *</label>
            <select value={form.reason} onChange={(e) => set('reason', e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">— Choisir —</option>
              {RENTAL_PROSPECT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </div>

          {form.reason === 'autre' && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Préciser le motif *</label>
              <input dir="auto" value={form.reason_other} onChange={(e) => set('reason_other', e.target.value)}
                placeholder="ex. Déménagement" maxLength={200} className={inputCls} style={inputStyle} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Début souhaité</label>
              <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Fin souhaitée</label>
              <input type="date" value={form.end_date} min={form.start_date || undefined}
                onChange={(e) => set('end_date', e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">Message</label>
            <textarea value={form.message} onChange={(e) => set('message', e.target.value)} rows={2} maxLength={1000}
              placeholder="Observations, véhicule souhaité…"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none transition-colors duration-150 motion-reduce:transition-none focus:ring-2 focus:ring-[var(--accent)]/25"
              style={inputStyle} />
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
              {error}
            </p>
          )}
        </form>

        {/* Footer (fixed) */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm transition-colors motion-reduce:transition-none hover:bg-[var(--bg-elevated)]"
            style={{ color: 'var(--text-primary)' }}>
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}>
            {saving ? 'Enregistrement…' : 'Créer le client'}
          </button>
        </div>
      </div>
    </div>
  )
}
