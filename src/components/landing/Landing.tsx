'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Menu, X, ChevronRight, MessageCircle, CheckCircle2, AlertTriangle,
  Users2, Calendar, Car, BarChart3, Zap, Shield,
} from 'lucide-react'
import { WILAYAS_58 } from '@/lib/types'
import { supabase } from '@/lib/supabase'

// Pixel globals — declared in src/types/global.d.ts.

// ─────────────────────────────────────────────────────────────────────
// Public landing page for AutoDex.
// ─────────────────────────────────────────────────────────────────────
// Bilingual French + Arabic, dark violet theme, single file with inline
// sections. The form posts to /api/prospects/capture (public endpoint).
// On success it fires Meta + TikTok pixel events and swaps in a thank-
// you state.
// ─────────────────────────────────────────────────────────────────────

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_AUTODEX_WHATSAPP || '213555000000'

const SHOWROOM_SIZE_OPTS = [
  { value: 'petit', label: 'Petit (moins de 50 voitures)' },
  { value: 'moyen', label: 'Moyen (50 à 150 voitures)' },
  { value: 'grand', label: 'Grand (plus de 150 voitures)' },
] as const

type FormState = {
  full_name:     string
  phone:         string
  wilaya:        string
  showroom_name: string
  showroom_size: '' | 'petit' | 'moyen' | 'grand'
}

const emptyForm: FormState = {
  full_name:     '',
  phone:         '',
  wilaya:        '',
  showroom_name: '',
  showroom_size: '',
}

export default function Landing() {
  // Auth-aware redirect — if the visitor is already signed in, send
  // them straight to their dashboard. Client-side check is fine here
  // (the public landing is allowed to flash briefly for everyone).
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data?.user) return
      // Pick the right destination by role, mirroring /login's logic.
      const { data: roleRow } = await supabase
        .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
      let target = '/dashboard'
      switch (roleRow?.role) {
        case 'super_admin':       target = '/dashboard/super-admin';            break
        case 'commercial':        target = '/dashboard/super-admin';            break
        case 'prospecteur_saas':  target = '/dashboard/super-admin/prospects';  break
        case 'closer':            target = '/dashboard/rendez-vous';            break
        case 'prospecteur':       target = '/dashboard/leads';                  break
      }
      if (!cancelled) window.location.href = target
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-zinc-100 overflow-x-hidden">
      <BackgroundBlobs />
      <Navbar />
      <Hero />
      <ProblemSolution />
      <FeaturesGrid />
      <SocialProof />
      <CaptureForm />
      <Footer />
      <WhatsAppFAB />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Animated background — pure CSS, GPU-friendly. Two slow-moving blurred
// gradient blobs in violet / indigo.
// ─────────────────────────────────────────────────────────────────────
function BackgroundBlobs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full opacity-30 blur-3xl"
        style={{
          background: 'radial-gradient(circle at center, #7c3aed 0%, transparent 60%)',
          animation: 'autodex-blob1 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle at center, #6366f1 0%, transparent 60%)',
          animation: 'autodex-blob2 28s ease-in-out infinite',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <style>{`
        @keyframes autodex-blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(120px, 80px) scale(1.1); }
        }
        @keyframes autodex-blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-100px, -60px) scale(1.05); }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Navbar — sticky, glass, with anchor links + CTA.
// ─────────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0a0f]/70 border-b border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-black tracking-tight">
          Auto<span className="text-violet-400">Dex</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
          <a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a>
          <a href="#tarifs"   className="hover:text-white transition-colors">Tarifs</a>
          <a href="#contact"  className="hover:text-white transition-colors">Contact</a>
        </nav>
        <div className="hidden md:block">
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
          >
            Connexion
          </Link>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Menu"
          className="md:hidden p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/5"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-zinc-800/50 bg-[#0a0a0f]/95 backdrop-blur-md px-4 py-3 space-y-2">
          <a href="#features" onClick={() => setOpen(false)} className="block py-2 text-sm text-zinc-300 hover:text-white">Fonctionnalités</a>
          <a href="#tarifs"   onClick={() => setOpen(false)} className="block py-2 text-sm text-zinc-300 hover:text-white">Tarifs</a>
          <a href="#contact"  onClick={() => setOpen(false)} className="block py-2 text-sm text-zinc-300 hover:text-white">Contact</a>
          <Link
            href="/login"
            className="block px-4 py-2 mt-2 rounded-xl bg-violet-600 text-white text-center font-bold"
          >
            Connexion
          </Link>
        </div>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center px-4 md:px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-[11px] font-bold uppercase tracking-widest text-violet-300">
            <Zap className="w-3.5 h-3.5" /> SaaS pour l&apos;automobile en Algérie
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
            Le CRM des concessionnaires{' '}
            <span className="text-violet-400">algériens</span>
          </h1>
          <p className="mt-5 text-lg md:text-xl text-zinc-400 max-w-xl leading-relaxed">
            Gérez vos prospects, vos rendez-vous et votre inventaire depuis une seule plateforme.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#formulaire"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-lg shadow-violet-600/30 transition-colors"
            >
              Demander une démo gratuite <ChevronRight className="w-4 h-4" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold transition-colors"
            >
              Voir les fonctionnalités
            </a>
          </div>
          <p className="mt-6 text-xs font-medium text-zinc-500 uppercase tracking-widest">
            Déjà utilisé par des showrooms à Alger, Oran, Constantine
          </p>
        </div>

        {/* Arabic counterpart — inline RTL block. */}
        <div className="lg:col-span-5">
          <div
            dir="rtl"
            lang="ar"
            className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-8 backdrop-blur-sm"
          >
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-300 mb-3">بالعربية</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight text-white">
              الـ CRM لوكالات السيارات الجزائرية
            </h2>
            <p className="mt-4 text-zinc-300 text-base leading-relaxed">
              سيّر عملاءك، مواعيدك ومخزون سياراتك من مكان واحد.
            </p>
            <a
              href="#formulaire"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
            >
              اطلب عرضاً تجريبياً مجانياً
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Problem → Solution
// ─────────────────────────────────────────────────────────────────────
function ProblemSolution() {
  const items = [
    {
      problem:  'Vous perdez des prospects dans WhatsApp et les carnets',
      solution: 'Tous vos leads centralisés avec suivi automatique',
      icon:     Users2,
    },
    {
      problem:  'Vous oubliez des RDV et des relances',
      solution: 'Pipeline visuel avec rappels et historique complet',
      icon:     Calendar,
    },
    {
      problem:  'Vous ne savez pas quelles voitures sont disponibles',
      solution: 'Inventaire en temps réel lié à vos prospects',
      icon:     Car,
    },
  ]
  return (
    <section id="features" className="px-4 md:px-6 py-20 md:py-28 bg-[#0d0d1a]/80 border-y border-zinc-800/50">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            Pourquoi <span className="text-violet-400">AutoDex</span> ?
          </h2>
          <p dir="rtl" lang="ar" className="mt-2 text-zinc-400 text-lg">لماذا AutoDex ؟</p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((it, i) => {
            const Icon = it.icon
            return (
              <div
                key={i}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-violet-500/40 backdrop-blur-sm p-6 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="mt-4 text-rose-300/90 text-sm font-medium leading-relaxed">
                  ❌ {it.problem}
                </p>
                <div className="my-3 h-px bg-zinc-800" />
                <p className="text-emerald-300/90 text-sm font-bold leading-relaxed">
                  ✅ {it.solution}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Features grid (6 cards)
// ─────────────────────────────────────────────────────────────────────
function FeaturesGrid() {
  const features = [
    { icon: Users2,    title: 'Gestion des prospects', desc: 'Suivez chaque lead de la prise de contact à la vente.' },
    { icon: Calendar,  title: 'RDV & Pipeline',        desc: 'Planifiez, suivez, relancez automatiquement.' },
    { icon: Car,       title: 'Inventaire véhicules',  desc: 'Stock en temps réel avec photos et fiches détaillées.' },
    { icon: BarChart3, title: 'Tableau de bord',       desc: 'Statistiques de ventes et performance de l\'équipe.' },
    { icon: MessageCircle, title: 'Intégrations',      desc: 'WhatsApp, Facebook, Instagram connectés.' },
    { icon: Shield,    title: 'Multi-showrooms',       desc: 'Chaque équipe dans son espace sécurisé.' },
  ]
  return (
    <section id="tarifs" className="px-4 md:px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            Tout ce qu&apos;il faut pour vendre <span className="text-violet-400">plus</span>
          </h2>
          <p className="mt-3 text-zinc-400">Une plateforme complète, pensée pour les showrooms algériens.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:border-violet-500/40 backdrop-blur-sm p-6 transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600/30 to-indigo-600/10 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────
function SocialProof() {
  const stats = [
    { fig: '+50',  label: 'leads / mois',           ar: 'عميل محتمل / شهر' },
    { fig: '3×',   label: 'plus de RDV honorés',    ar: 'مواعيد محترمة' },
    { fig: '20',   label: 'minutes pour démarrer',  ar: 'دقيقة للإعداد' },
  ]
  return (
    <section className="px-4 md:px-6 py-20 md:py-24 bg-[#0d0d1a]/80 border-y border-zinc-800/50">
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        {stats.map((s, i) => (
          <div key={i}>
            <p className="text-5xl md:text-6xl font-black tracking-tighter bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {s.fig}
            </p>
            <p className="mt-2 text-zinc-300 font-bold">{s.label}</p>
            <p dir="rtl" lang="ar" className="text-xs text-zinc-500 mt-1">{s.ar}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Capture form — POSTs to /api/prospects/capture, fires pixels.
// ─────────────────────────────────────────────────────────────────────
function CaptureForm() {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done,  setDone]  = useState<null | { duplicate: boolean }>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.full_name.trim())     { setError('Nom complet requis.'); return }
    if (!form.phone.trim())         { setError('Téléphone requis.'); return }
    if (!form.wilaya)               { setError('Wilaya requise.'); return }
    if (!form.showroom_name.trim()) { setError('Nom du showroom requis.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/prospects/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:     form.full_name.trim(),
          phone:         form.phone.trim(),
          wilaya:        form.wilaya,
          showroom_name: form.showroom_name.trim(),
          showroom_size: form.showroom_size || null,
          source:        'landing_page',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error ?? 'Une erreur est survenue. Réessayez.')
        return
      }

      // Pixel events — guarded so missing pixels don't crash the form.
      try {
        if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
          window.fbq('track', 'Lead', {
            content_name: 'AutoDex Demo Request',
            value: 0,
            currency: 'DZD',
          })
        }
      } catch {}
      try {
        if (typeof window !== 'undefined' && window.ttq && typeof window.ttq.track === 'function') {
          window.ttq.track('SubmitForm', { content_name: 'AutoDex Demo Request' })
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

  return (
    <section id="formulaire" className="px-4 md:px-6 py-20 md:py-28">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            Essayez <span className="text-violet-400">AutoDex</span> gratuitement
          </h2>
          <p dir="rtl" lang="ar" className="mt-2 text-zinc-300 text-lg">جرّب AutoDex مجاناً</p>
          <p className="mt-3 text-zinc-400">
            Essai gratuit <strong className="text-white">20 jours</strong> — sans carte bancaire.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md p-6 md:p-8 shadow-2xl shadow-violet-900/10">
          {done ? (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Demande reçue !
              </h3>
              <p className="text-zinc-300">
                Notre équipe vous contacte dans 24h.
              </p>
              <p dir="rtl" lang="ar" className="text-zinc-400 text-sm">
                تم استلام طلبك! سيتصل بك فريقنا خلال 24 ساعة.
              </p>
              {done.duplicate && (
                <p className="text-[11px] text-zinc-500 mt-2">
                  Nous avons déjà vos coordonnées — un membre de l&apos;équipe vous recontactera.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Nom complet *">
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="ex. Karim Benali"
                  className="w-full h-11 px-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 outline-none text-sm transition"
                />
              </Field>

              <Field label="Téléphone *">
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0555 XX XX XX"
                  className="w-full h-11 px-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 outline-none text-sm transition"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Wilaya *">
                  <select
                    required
                    value={form.wilaya}
                    onChange={(e) => setForm({ ...form, wilaya: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 outline-none text-sm transition"
                  >
                    <option value="">— Choisir —</option>
                    {WILAYAS_58.map((w, i) => (
                      <option key={w} value={w}>
                        {String(i + 1).padStart(2, '0')} - {w}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nom du showroom *">
                  <input
                    type="text"
                    required
                    value={form.showroom_name}
                    onChange={(e) => setForm({ ...form, showroom_name: e.target.value })}
                    placeholder="ex. AutoSphère Alger"
                    className="w-full h-11 px-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 outline-none text-sm transition"
                  />
                </Field>
              </div>

              <Field label="Taille du showroom">
                <select
                  value={form.showroom_size}
                  onChange={(e) => setForm({ ...form, showroom_size: e.target.value as FormState['showroom_size'] })}
                  className="w-full h-11 px-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 outline-none text-sm transition"
                >
                  <option value="">— Optionnel —</option>
                  {SHOWROOM_SIZE_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-violet-900/40 transition-all disabled:opacity-60"
              >
                {submitting ? 'Envoi…' : 'Je veux tester AutoDex — مجاناً'}
              </button>
              <p className="text-[11px] text-zinc-500 text-center">
                En soumettant ce formulaire, vous acceptez d&apos;être contacté par AutoDex.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer id="contact" className="border-t border-zinc-800/60 px-4 md:px-6 py-12">
      <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <p className="text-xl font-black">
            Auto<span className="text-violet-400">Dex</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            © 2026 AutoDex — Tous droits réservés
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-zinc-400">
          <Link href="/privacy" className="hover:text-white transition-colors">Politique de confidentialité</Link>
          <Link href="/terms"   className="hover:text-white transition-colors">Conditions d&apos;utilisation</Link>
          <Link href="/login"   className="hover:text-white transition-colors">Connexion</Link>
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Floating WhatsApp button
// ─────────────────────────────────────────────────────────────────────
function WhatsAppFAB() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contacter sur WhatsApp"
      className="fixed bottom-5 right-5 z-30 inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-2xl shadow-emerald-900/30 transition-colors"
    >
      <MessageCircle className="w-7 h-7" />
    </a>
  )
}
