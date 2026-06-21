'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2, AlertTriangle, Sun, Moon, Sparkles, BadgeCheck,
} from 'lucide-react'
import { WILAYAS_58, type SaasPlan } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { readAttribution } from '@/lib/attribution'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// /register — public self-registration form. POSTs to /api/auth/register
// which provisions a 20-day-trial showroom + owner account, then this
// component immediately calls supabase.auth.signInWithPassword to
// establish the session and hard-navigates to /dashboard so the new
// owner lands logged in.
// ─────────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = 'autodex-landing-theme'

const SHOWROOM_SIZE_OPTS = [
  { value: 'petit', label: 'Petit (moins de 50 voitures)' },
  { value: 'moyen', label: 'Moyen (50 à 150 voitures)' },
  { value: 'grand', label: 'Grand (plus de 150 voitures)' },
] as const

type FormState = {
  showroom_name:    string
  full_name:        string
  phone:            string
  email:            string
  password:         string
  password_confirm: string
  wilaya:           string
  showroom_size:    '' | 'petit' | 'moyen' | 'grand'
}

const emptyForm: FormState = {
  showroom_name:    '',
  full_name:        '',
  phone:            '',
  email:            '',
  password:         '',
  password_confirm: '',
  wilaya:           '',
  showroom_size:    '',
}

// 0..3 — same scale as the existing super-admin password modals.
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

export default function Register() {
  // Theme — same source-of-truth as Landing.tsx so the mode persists
  // across pages.
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' }
    catch { return false }
  })
  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light') }
    catch { /* ignore */ }
  }, [isDark])

  const [form, setForm]         = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')

  // ?plan=<id> carried over from the landing Pricing CTA. The raw id is
  // sent to the register API (which re-validates it against ACTIVE
  // saas_plans and derives the trial's modules); the lookup below is
  // display-only — a failed fetch never blocks signup.
  const searchParams = useSearchParams()
  const planParam = searchParams?.get('plan') ?? null
  const [chosenPlan, setChosenPlan] = useState<SaasPlan | null>(null)
  useEffect(() => {
    if (!planParam) { setChosenPlan(null); return }
    let cancelled = false
    fetch('/api/saas-plans')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const all = (j.plans ?? []) as SaasPlan[]
        setChosenPlan(all.find((p) => p.id === planParam && p.active) ?? null)
      })
      .catch(() => { if (!cancelled) setChosenPlan(null) })
    return () => { cancelled = true }
  }, [planParam])

  // Best-effort ViewContent on arrival with a chosen plan (?plan=). No extra
  // fetch — name/price come from the badge's chosenPlan IF already resolved,
  // else only the plan id is sent. Fired once per planParam (we intentionally
  // don't re-fire when chosenPlan resolves, to avoid double-counting).
  // Guarded → safe no-op when the pixels aren't loaded / env IDs are unset.
  useEffect(() => {
    if (!planParam) return
    const name  = chosenPlan?.name
    const price = typeof chosenPlan?.price === 'number' ? chosenPlan.price : undefined
    try {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'ViewContent', {
          content_name: name || 'Register',
          content_ids:  [planParam],
          content_type: 'product',
          ...(price !== undefined ? { value: price, currency: 'DZD' } : {}),
        })
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track('ViewContent', {
          ...(price !== undefined ? { value: price, currency: 'DZD' } : {}),
          contents: [{ content_id: planParam, content_type: 'product', content_name: name || '' }],
        })
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam])

  const strength = useMemo(() => passwordStrength(form.password), [form.password])
  const meta     = STRENGTH_META[strength]
  const mismatch = form.password_confirm.length > 0 && form.password !== form.password_confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.showroom_name.trim()) { setError('Nom du showroom requis.'); return }
    if (!form.full_name.trim())     { setError('Nom complet requis.'); return }
    if (!form.phone.trim())         { setError('Téléphone requis.'); return }
    if (!form.email.trim())         { setError('Email requis.'); return }
    if (form.password.length < 8)   { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (form.password !== form.password_confirm) {
      setError('Les deux mots de passe ne correspondent pas.'); return
    }
    if (!form.wilaya)               { setError('Wilaya requise.'); return }

    setSubmitting(true)
    try {
      // ── 1. Provision the trial server-side ──────────────────────
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showroom_name: form.showroom_name.trim(),
          full_name:     form.full_name.trim(),
          email:         form.email.trim().toLowerCase(),
          password:      form.password,
          phone:         form.phone.trim(),
          wilaya:        form.wilaya,
          showroom_size: form.showroom_size || null,
          // Raw ?plan= id — the server validates it; invalid/missing
          // silently falls back to the default vente-only trial.
          plan_id:       planParam,
          // First-touch attribution (cookie) → server derives source + notes.
          attribution:   readAttribution(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409 / 400 / 500 all surface the same way — the message comes
        // from the server in French.
        setError(json?.error ?? 'Une erreur est survenue. Réessayez.')
        return
      }

      // ── 2. Pixels — trial created = the canonical signup conversion.
      // Best-effort + guarded; value/currency only when a numeric price is
      // known (from the badge's chosenPlan, no extra fetch).
      {
        const planName  = chosenPlan?.name || 'Register'
        const planPrice = typeof chosenPlan?.price === 'number' ? chosenPlan.price : undefined
        try {
          if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
            window.fbq('track', 'CompleteRegistration', {
              content_name: planName,
              status:       true,
              ...(planPrice !== undefined ? { value: planPrice, currency: 'DZD' } : {}),
            })
          }
        } catch {}
        try {
          if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
            window.ttq.track('CompleteRegistration', {
              content_name: planName,
              ...(planParam ? { contents: [{ content_id: planParam, content_type: 'product', content_name: chosenPlan?.name || '' }] } : {}),
              ...(planPrice !== undefined ? { value: planPrice, currency: 'DZD' } : {}),
            })
          }
        } catch {}
      }

      // ── 3. Sign the user in (option (a)) ────────────────────────
      // Reuse the credentials we already have. On success, hard-nav to
      // /dashboard so the middleware sees the freshly-set session
      // cookie on the next request.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    form.email.trim().toLowerCase(),
        password: form.password,
      })
      if (signInErr) {
        // Account was created but the sign-in failed — extremely rare
        // (e.g. transient network error). Surface a friendly message
        // and let the user log in manually.
        setError(
          'Compte créé. Connectez-vous manuellement avec votre email et mot de passe.',
        )
        // Send them to /login after a beat so the message is visible.
        window.setTimeout(() => { window.location.href = '/login' }, 1200)
        return
      }

      window.location.href = '/dashboard'
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Theme tokens (subset of buildTheme from Landing).
  const t = isDark
    ? {
        page:       'bg-[#0a0a0f] text-zinc-100',
        text:       'text-zinc-100',
        textMuted:  'text-zinc-400',
        textSubtle: 'text-zinc-500',
        accent:     'text-violet-400',
        card:       'border-zinc-800 bg-zinc-900/50 backdrop-blur-md shadow-2xl shadow-violet-900/10',
        input:      'bg-zinc-950/80 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/30',
        fieldLabel: 'text-zinc-400',
        formError:  'border-rose-500/30 bg-rose-500/10 text-rose-300',
        toggleBtn:  'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 shadow-2xl shadow-black/40',
        strengthBg: 'bg-zinc-800',
      }
    : {
        page:       'bg-white text-zinc-900',
        text:       'text-zinc-900',
        textMuted:  'text-zinc-600',
        textSubtle: 'text-zinc-500',
        accent:     'text-violet-600',
        card:       'border-zinc-200 bg-white shadow-2xl shadow-violet-200/30',
        input:      'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:ring-violet-500/20',
        fieldLabel: 'text-zinc-600',
        formError:  'border-rose-200 bg-rose-50 text-rose-700',
        toggleBtn:  'bg-white text-zinc-700 hover:bg-zinc-50 shadow-2xl shadow-zinc-300/40 border border-zinc-200',
        strengthBg: 'bg-zinc-200',
      }

  const inputCls = `w-full h-11 px-3 rounded-xl border outline-none text-sm transition focus:ring-2 ${t.input}`

  return (
    <div className={`relative min-h-screen flex items-center justify-center px-4 py-12 transition-colors duration-300 ${t.page}`}>
      <button
        onClick={() => setIsDark(v => !v)}
        aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
        className={`fixed bottom-5 left-5 z-50 inline-flex items-center justify-center w-12 h-12 rounded-full transition-colors ${t.toggleBtn}`}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className={`text-2xl font-black tracking-tight ${t.text}`}>
            Auto<span className={t.accent}>Dex</span>
          </Link>
        </div>

        <div className={`rounded-3xl border p-6 md:p-8 ${t.card}`}>
          <div className="text-center">
            <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${t.text}`}>
              Démarrer votre essai gratuit
            </h1>
            <p className={`mt-2 text-sm ${t.textMuted}`}>
              20 jours gratuits • Sans carte bancaire
            </p>
            <p dir="rtl" lang="ar" className={`mt-1 text-xs ${t.textSubtle}`}>
              ابدأ تجربتك المجانية — 20 يوم مجاناً
            </p>
            {chosenPlan && (
              <p className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isDark
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                <BadgeCheck className="w-3.5 h-3.5" />
                Formule choisie : {chosenPlan.name}
              </p>
            )}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Nom du showroom *" t={t}>
              <input
                type="text"
                required
                value={form.showroom_name}
                onChange={(e) => setForm({ ...form, showroom_name: e.target.value })}
                placeholder="ex. AutoSphère Alger"
                className={inputCls}
              />
            </Field>

            <Field label="Nom complet (propriétaire) *" t={t}>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="ex. Karim Benali"
                className={inputCls}
                dir="auto"
              />
            </Field>

            <Field label="Téléphone *" t={t}>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0555 XX XX XX (Algérie)"
                className={inputCls}
              />
            </Field>

            <Field label="Email *" t={t}>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ex. proprietaire@showroom.dz"
                className={inputCls}
                autoComplete="email"
              />
            </Field>

            <Field label="Mot de passe *" t={t}>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="8 caractères minimum"
                className={inputCls}
                autoComplete="new-password"
              />
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${t.strengthBg}`}>
                    <div className={cn('h-full transition-all duration-200', meta.color, meta.widthClass)} />
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest w-12 text-right ${t.fieldLabel}`}>
                    {meta.label}
                  </span>
                </div>
              )}
            </Field>

            <Field label="Confirmer le mot de passe *" t={t}>
              <input
                type="password"
                required
                minLength={8}
                value={form.password_confirm}
                onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                className={cn(
                  'w-full h-11 px-3 rounded-xl border outline-none text-sm transition focus:ring-2',
                  mismatch
                    ? (isDark
                        ? 'bg-zinc-950/80 border-rose-400 text-white placeholder:text-zinc-600 focus:border-rose-400 focus:ring-rose-500/30'
                        : 'bg-white border-rose-400 text-zinc-900 focus:border-rose-400 focus:ring-rose-500/20')
                    : t.input,
                )}
                autoComplete="new-password"
              />
              {mismatch && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                  Les deux mots de passe ne correspondent pas.
                </p>
              )}
            </Field>

            <Field label="Wilaya *" t={t}>
              <select
                required
                value={form.wilaya}
                onChange={(e) => setForm({ ...form, wilaya: e.target.value })}
                className={inputCls}
              >
                <option value="">— Choisir —</option>
                {WILAYAS_58.map((w, i) => (
                  <option key={w} value={w}>
                    {String(i + 1).padStart(2, '0')} - {w}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Taille du showroom" t={t}>
              <select
                value={form.showroom_size}
                onChange={(e) => setForm({ ...form, showroom_size: e.target.value as FormState['showroom_size'] })}
                className={inputCls}
              >
                <option value="">— Optionnel —</option>
                {SHOWROOM_SIZE_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            {error && (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${t.formError}`}>
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-violet-900/30 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {submitting ? 'Création…' : (
                <><Sparkles className="w-4 h-4" /> Créer mon essai gratuit</>
              )}
            </button>
            <p className={`text-[11px] text-center ${t.textSubtle} inline-flex items-center gap-1.5 justify-center w-full`}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Compte actif en 1 minute · Aucune carte bancaire requise
            </p>
          </form>

          <p className={`mt-5 text-center text-sm ${t.textMuted}`}>
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className={`font-bold ${t.accent} hover:underline`}>
              Connexion →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, children, t,
}: {
  label: string
  children: React.ReactNode
  t: { fieldLabel: string }
}) {
  return (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${t.fieldLabel}`}>{label}</label>
      {children}
    </div>
  )
}
