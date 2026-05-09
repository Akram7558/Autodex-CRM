'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, AlertTriangle, Sun, Moon, Sparkles,
} from 'lucide-react'
import { WILAYAS_58 } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────
// /register — public lead-capture page dedicated to the Tarifs CTA.
// Reuses the Landing theme tokens (light by default, dark via the
// shared `autodex-landing-theme` localStorage key) so a visitor who
// flipped to dark on /  arrives here in the same theme.
// ─────────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = 'autodex-landing-theme'

const SHOWROOM_SIZE_OPTS = [
  { value: 'petit', label: 'Petit (moins de 50 voitures)' },
  { value: 'moyen', label: 'Moyen (50 à 150 voitures)' },
  { value: 'grand', label: 'Grand (plus de 150 voitures)' },
] as const

type FormState = {
  showroom_name: string
  full_name:     string
  phone:         string
  email:         string
  wilaya:        string
  showroom_size: '' | 'petit' | 'moyen' | 'grand'
}

const emptyForm: FormState = {
  showroom_name: '',
  full_name:     '',
  phone:         '',
  email:         '',
  wilaya:        '',
  showroom_size: '',
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

  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done,  setDone]  = useState<null | { duplicate: boolean }>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.showroom_name.trim()) { setError('Nom du showroom requis.'); return }
    if (!form.full_name.trim())     { setError('Nom complet requis.'); return }
    if (!form.phone.trim())         { setError('Téléphone requis.'); return }
    if (!form.email.trim())         { setError('Email requis.'); return }
    if (!form.wilaya)               { setError('Wilaya requise.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/prospects/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:     form.full_name.trim(),
          phone:         form.phone.trim(),
          email:         form.email.trim().toLowerCase(),
          wilaya:        form.wilaya,
          showroom_name: form.showroom_name.trim(),
          showroom_size: form.showroom_size || null,
          source:        'register_page',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error ?? 'Une erreur est survenue. Réessayez.')
        return
      }
      // Pixels (best-effort, guarded).
      try {
        if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
          window.fbq('track', 'Lead', { content_name: 'Register' })
        }
      } catch {}
      try {
        if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
          window.ttq.track('SubmitForm', { content_name: 'Register' })
        }
      } catch {}
      setDone({ duplicate: !!json.duplicate })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Theme tokens (subset of buildTheme from Landing — kept locally to
  // avoid leaking the full theme contract across files).
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
      }

  const inputCls = `w-full h-11 px-3 rounded-xl border outline-none text-sm transition focus:ring-2 ${t.input}`

  return (
    <div className={`relative min-h-screen flex items-center justify-center px-4 py-12 transition-colors duration-300 ${t.page}`}>
      {/* Theme toggle — same FAB pattern as the landing page mobile
          toggle. Sits bottom-left to mirror the landing's UX. */}
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
          {done ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h3 className={`text-xl font-bold ${t.text}`}>Demande reçue !</h3>
              <p className={t.textMuted}>
                Notre équipe vous contacte dans les 24 h pour activer votre essai.
              </p>
              <p dir="rtl" lang="ar" className={`text-sm ${t.textSubtle}`}>
                تم استلام طلبك! سيتصل بك فريقنا خلال 24 ساعة.
              </p>
              {done.duplicate && (
                <p className={`text-[11px] mt-2 ${t.textSubtle}`}>
                  Nous avons déjà vos coordonnées — un membre de l&apos;équipe vous recontactera.
                </p>
              )}
              <Link
                href="/"
                className="mt-3 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : (
            <>
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
                  />
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
                  {submitting ? 'Envoi…' : (
                    <><Sparkles className="w-4 h-4" /> Créer mon essai gratuit</>
                  )}
                </button>
              </form>

              <p className={`mt-5 text-center text-sm ${t.textMuted}`}>
                Vous avez déjà un compte ?{' '}
                <Link href="/login" className={`font-bold ${t.accent} hover:underline`}>
                  Connexion →
                </Link>
              </p>
            </>
          )}
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
