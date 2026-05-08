'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { WILAYAS_58, type SaasRdv, type SaasProspect } from '@/lib/types'

// What the rendez-vous page passes us. The page already has `prospect`
// joined onto each row, so we re-use that here.
export type StartTrialRdv = SaasRdv & {
  prospect: Pick<SaasProspect, 'id' | 'full_name' | 'phone' | 'showroom_name'> | null
}

// Returns 0..3, same scale as the create-internal-user modal.
function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw))   score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return 1
  if (score <= 4) return 2
  return 3
}
const STRENGTH_META: Record<0 | 1 | 2 | 3, { label: string; color: string; widthClass: string }> = {
  0: { label: '—',      color: 'bg-zinc-300 dark:bg-zinc-700', widthClass: 'w-0' },
  1: { label: 'Faible', color: 'bg-rose-500',                   widthClass: 'w-1/3' },
  2: { label: 'Moyen',  color: 'bg-amber-500',                  widthClass: 'w-2/3' },
  3: { label: 'Fort',   color: 'bg-emerald-500',                widthClass: 'w-full' },
}

export function StartTrialModal({
  open,
  rdv,
  onClose,
  onStarted,
}: {
  open: boolean
  rdv:  StartTrialRdv | null
  onClose: () => void
  onStarted: (info: { showroom_id: string; owner_email: string; trial_ends_at: string; emailSent: boolean }) => void
}) {
  // Form state. Prefilled from the prospect on open.
  const [showroomName, setShowroomName] = useState('')
  const [ownerEmail,   setOwnerEmail]   = useState('')
  const [ownerName,    setOwnerName]    = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPwd,   setConfirmPwd]   = useState('')
  const [city,         setCity]         = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Pull the prospect's full row to seed the city / email fields when the
  // RDV's joined prospect doesn't carry them. Lightweight — only fires
  // when the modal opens.
  useEffect(() => {
    if (!open || !rdv) return
    setError('')
    setSaving(false)
    setShowroomName(rdv.prospect?.showroom_name ?? '')
    setOwnerName(rdv.prospect?.full_name ?? '')
    setPassword('')
    setConfirmPwd('')

    // Try the joined fields first — the page already has them.
    if (rdv.prospect_id) {
      supabase
        .from('super_admin_prospects')
        .select('email, city, full_name, showroom_name')
        .eq('id', rdv.prospect_id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setOwnerEmail(typeof data.email === 'string' ? data.email : '')
          setCity(typeof data.city === 'string' ? data.city : '')
          if (!ownerName && typeof data.full_name === 'string') setOwnerName(data.full_name)
          if (!showroomName && typeof data.showroom_name === 'string') setShowroomName(data.showroom_name)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rdv?.id, rdv?.prospect_id])

  // Esc closes (when not saving).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const strength = useMemo(() => passwordStrength(password), [password])
  const meta = STRENGTH_META[strength]
  const mismatch = confirmPwd.length > 0 && password !== confirmPwd

  if (!open || !rdv) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rdv) return
    setError('')
    if (!showroomName.trim()) { setError('Nom du showroom requis.'); return }
    if (!city)                { setError('Wilaya requise.'); return }
    if (!ownerEmail.trim())   { setError('Email du propriétaire requis.'); return }
    if (password.length < 8)  { setError('Mot de passe (≥ 8 caractères) requis.'); return }
    if (password !== confirmPwd) { setError('Les deux mots de passe ne correspondent pas.'); return }

    setSaving(true)
    const res = await fetch('/api/admin/start-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rdv_id:         rdv.id,
        prospect_id:    rdv.prospect_id,
        showroom_name:  showroomName.trim(),
        owner_email:    ownerEmail.trim().toLowerCase(),
        owner_name:     ownerName.trim(),
        owner_password: password,
        city,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? 'Échec du démarrage de l\'essai.')
      return
    }
    onStarted({
      showroom_id:   String(json.showroom_id),
      owner_email:   String(json.owner_email ?? ownerEmail),
      trial_ends_at: String(json.trial_ends_at),
      emailSent:     !!json.welcome_email_sent,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Démarrer un essai gratuit</h2>
              <p className="text-xs text-muted-foreground mt-0.5" dir="auto">
                {rdv.prospect?.full_name ?? '—'} — {rdv.prospect?.showroom_name ?? '—'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/10 px-3 py-2.5 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-violet-900 dark:text-violet-200">
              Un essai gratuit de <strong>20 jours</strong> sera créé. Le compte propriétaire reçoit un email avec ses identifiants.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Nom du showroom *</label>
              <input
                value={showroomName}
                onChange={(e) => setShowroomName(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Wilaya *</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">— Choisir —</option>
                {WILAYAS_58.map((w, i) => (
                  <option key={w} value={w}>{String(i + 1).padStart(2, '0')} · {w}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nom complet du propriétaire</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              dir="auto"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Email du propriétaire *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="proprietaire@showroom.dz"
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Mot de passe *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
            {password && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className={cn('h-full transition-all duration-200', meta.color, meta.widthClass)} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-12 text-right">
                  {meta.label}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Confirmer le mot de passe *</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
              className={cn(
                'w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 transition',
                mismatch
                  ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/20'
                  : 'border-border focus:border-indigo-400 focus:ring-indigo-500/20',
              )}
            />
            {mismatch && (
              <p className="mt-1 text-[11px] text-rose-600">Les deux mots de passe ne correspondent pas.</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 font-medium"
            >
              {saving ? 'Démarrage…' : 'Démarrer l\'essai'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
