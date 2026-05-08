'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, CheckCircle2, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { WILAYAS_58, type SaasRdv, type SaasProspect, type SaasPlan } from '@/lib/types'
import { PlanPicker, type PlanPickerValue } from './PlanPicker'

// ─────────────────────────────────────────────────────────────────────
// DirectConvertModal — used when an RDV's status is set to 'converti'
// AND the RDV has no `linked_showroom_id` (no trial in flight). Creates
// a paid showroom + owner account in one shot via /api/admin/direct-convert.
// ─────────────────────────────────────────────────────────────────────

export type DirectConvertRdv = SaasRdv & {
  prospect: Pick<SaasProspect, 'id' | 'full_name' | 'phone' | 'showroom_name'> | null
}

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

function todayYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function DirectConvertModal({
  open,
  rdv,
  onClose,
  onConverted,
}: {
  open: boolean
  rdv:  DirectConvertRdv | null
  onClose: () => void
  onConverted: (info: { showroom_id: string; owner_email: string; emailSent: boolean; planName?: string }) => void
}) {
  // Form state. Prefilled from the prospect.
  const [showroomName, setShowroomName] = useState('')
  const [ownerEmail,   setOwnerEmail]   = useState('')
  const [ownerName,    setOwnerName]    = useState('')
  const [ownerPhone,   setOwnerPhone]   = useState('')
  const [city,         setCity]         = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPwd,   setConfirmPwd]   = useState('')

  // Plan + derived fields. value 'none' is hidden here — direct convert
  // requires a plan, so we never offer it; we only show the radio cards
  // (no "Sans plan" / "Personnalisé" toggle for this flow).
  const [planPick, setPlanPick] = useState<PlanPickerValue>('')
  const [contractAmount, setAmount] = useState('')
  const [expiresAt, setExpiresAt]   = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!open || !rdv) return
    setError('')
    setSaving(false)
    setShowroomName(rdv.prospect?.showroom_name ?? '')
    setOwnerName(rdv.prospect?.full_name ?? '')
    setOwnerPhone(rdv.prospect?.phone ?? '')
    setOwnerEmail('')
    setCity('')
    setPassword('')
    setConfirmPwd('')
    setPlanPick('')
    setAmount('')
    setExpiresAt('')
    if (rdv.prospect_id) {
      supabase
        .from('super_admin_prospects')
        .select('email, city, full_name, showroom_name, phone')
        .eq('id', rdv.prospect_id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setOwnerEmail(typeof data.email === 'string' ? data.email : '')
          setCity(typeof data.city === 'string' ? data.city : '')
          if (typeof data.phone === 'string') setOwnerPhone(data.phone)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rdv?.id, rdv?.prospect_id])

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
  // Track the chosen plan name for the success callback (so the toast
  // can mention it).
  const [pickedPlanName, setPickedPlanName] = useState<string | null>(null)

  if (!open || !rdv) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rdv) return
    setError('')
    if (!showroomName.trim()) { setError('Nom du showroom requis.'); return }
    if (!ownerEmail.trim())   { setError('Email du propriétaire requis.'); return }
    if (password.length < 8)  { setError('Mot de passe (≥ 8 caractères) requis.'); return }
    if (password !== confirmPwd) { setError('Les deux mots de passe ne correspondent pas.'); return }
    if (!planPick || planPick === 'none' || planPick === 'custom') {
      setError('Veuillez sélectionner un plan.'); return
    }
    const amount = Number(contractAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Montant du contrat invalide.'); return
    }
    if (!expiresAt) { setError('Date d\'expiration requise.'); return }

    setSaving(true)
    const res = await fetch('/api/admin/direct-convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rdv_id:          rdv.id,
        prospect_id:     rdv.prospect_id,
        showroom_name:   showroomName.trim(),
        owner_email:     ownerEmail.trim().toLowerCase(),
        owner_name:      ownerName.trim(),
        owner_password:  password,
        owner_phone:     ownerPhone.trim() || null,
        city:            city || null,
        plan_id:         planPick,
        contract_amount: amount,
        expires_at:      new Date(expiresAt + 'T23:59:59').toISOString(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json?.error ?? 'Échec de la conversion.')
      return
    }
    onConverted({
      showroom_id:   String(json.showroom_id),
      owner_email:   String(json.owner_email ?? ownerEmail),
      emailSent:     !!json.welcome_email_sent,
      planName:      pickedPlanName ?? undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Convertir en client payant</h2>
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
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-3 py-2.5 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
              Un showroom et un compte propriétaire seront créés directement en mode payant.
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
              <label className="block text-xs font-medium text-foreground mb-1">Wilaya</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
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
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Téléphone du propriétaire</label>
            <input
              type="tel"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="ex. 0555 XX XX XX"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Optionnel — sera normalisé au format +213.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Mot de passe *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
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

          {/* ── Plan selection ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
            <PlanPicker
              value={planPick || ''}
              label="Plan d'abonnement *"
              onChange={(next: PlanPickerValue, plan: SaasPlan | null) => {
                setPlanPick(next)
                setPickedPlanName(plan?.name ?? null)
                if (plan) {
                  const ends = new Date()
                  ends.setMonth(ends.getMonth() + plan.duration_months)
                  const pad = (n: number) => String(n).padStart(2, '0')
                  setAmount(String(plan.price))
                  setExpiresAt(`${ends.getFullYear()}-${pad(ends.getMonth() + 1)}-${pad(ends.getDate())}`)
                }
              }}
            />
            {planPick && planPick !== 'none' && planPick !== 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Montant du contrat (DZD) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={contractAmount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Date d&apos;expiration *</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    min={todayYmd()}
                    required
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
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
              className="px-5 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium"
            >
              {saving ? 'Création…' : 'Créer le compte payant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
