'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Menu, X, ChevronRight, MessageCircle, CheckCircle2, AlertTriangle,
  Users2, Calendar, Car, BarChart3, Zap, Shield, Sun, Moon,
  Check, Star, Sparkles,
} from 'lucide-react'
import { WILAYAS_58, type SaasPlan, type SaasPlanType } from '@/lib/types'

// Pixel globals — declared in src/types/global.d.ts.

// ─────────────────────────────────────────────────────────────────────
// Public landing page for AutoDex.
// ─────────────────────────────────────────────────────────────────────
// Bilingual French + Arabic. Light theme by default with a toggle that
// flips to the original deep-violet dark theme; the choice persists in
// localStorage. Auth-aware redirect lives in the server component
// (src/app/page.tsx) so this client component never flashes for
// authed visitors. The capture form posts to /api/prospects/capture
// and fires Meta + TikTok pixels on success.
// ─────────────────────────────────────────────────────────────────────

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_AUTODEX_WHATSAPP || '213555000000'
const THEME_STORAGE_KEY = 'autodex-landing-theme'

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

// ─────────────────────────────────────────────────────────────────────
// Theme tokens — one object built per render from `isDark` and passed
// down to every section. Keeps JSX readable; lets us switch themes
// without touching layout or markup.
// ─────────────────────────────────────────────────────────────────────
type Theme = ReturnType<typeof buildTheme>

function buildTheme(isDark: boolean) {
  return {
    isDark,
    page:        isDark ? 'bg-[#0a0a0f] text-zinc-100'
                        : 'bg-white text-zinc-900',
    sectionAlt:  isDark ? 'bg-[#0d0d1a]/80 border-y border-zinc-800/50'
                        : 'bg-[#f8f8fc] border-y border-zinc-200',
    statsAccent: isDark ? 'bg-[#0d0d1a]/80 border-y border-zinc-800/50'
                        : 'bg-violet-50 border-y border-violet-100',
    formAccent:  isDark ? 'bg-transparent'
                        : 'bg-violet-50/60',
    text:        isDark ? 'text-zinc-100' : 'text-zinc-900',
    textMuted:   isDark ? 'text-zinc-400' : 'text-zinc-600',
    textSubtle:  isDark ? 'text-zinc-500' : 'text-zinc-500',
    accent:      isDark ? 'text-violet-400' : 'text-violet-600',
    card:        isDark ? 'bg-zinc-900/50 border-zinc-800 hover:border-violet-500/40 backdrop-blur-sm'
                        : 'bg-white border-zinc-200 hover:border-violet-400 shadow-sm',
    cardSolid:   isDark ? 'bg-zinc-900/40 border-zinc-800 hover:border-violet-500/40 backdrop-blur-sm'
                        : 'bg-white border-zinc-200 hover:border-violet-400 shadow-sm',
    cardDivider: isDark ? 'bg-zinc-800' : 'bg-zinc-200',
    cardWarn:    isDark ? 'text-rose-300/90' : 'text-rose-600',
    cardOk:      isDark ? 'text-emerald-300/90' : 'text-emerald-700',
    iconChip:    isDark ? 'bg-violet-600/15 border-violet-500/30 text-violet-400'
                        : 'bg-violet-100 border-violet-200 text-violet-700',
    iconChipAlt: isDark ? 'bg-gradient-to-br from-violet-600/30 to-indigo-600/10 border-violet-500/30 text-violet-300'
                        : 'bg-gradient-to-br from-violet-100 to-violet-50 border-violet-200 text-violet-700',
    navbar:      isDark ? 'bg-[#0a0a0f]/70 border-zinc-800/50'
                        : 'bg-white/85 border-zinc-200',
    navbarMobileSheet: isDark ? 'border-zinc-800/50 bg-[#0a0a0f]/95'
                              : 'border-zinc-200 bg-white/95',
    navLink:     isDark ? 'text-zinc-300 hover:text-white'
                        : 'text-zinc-700 hover:text-violet-700',
    navIcon:     isDark ? 'text-zinc-300 hover:text-white hover:bg-white/5'
                        : 'text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100',
    secondaryBtn: isDark ? 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                         : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-900',
    arabicCard:  isDark ? 'border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 backdrop-blur-sm text-white'
                        : 'border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 text-zinc-900',
    arabicLabel: isDark ? 'text-violet-300' : 'text-violet-700',
    arabicLead:  isDark ? 'text-zinc-300' : 'text-zinc-700',
    badgePill:   isDark ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                        : 'bg-violet-100 border-violet-200 text-violet-700',
    formCard:    isDark ? 'border-zinc-800 bg-zinc-900/50 backdrop-blur-md shadow-2xl shadow-violet-900/10'
                        : 'border-zinc-200 bg-white shadow-2xl shadow-violet-200/30',
    input:       isDark ? 'bg-zinc-950/80 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/30'
                        : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:ring-violet-500/20',
    fieldLabel:  isDark ? 'text-zinc-400' : 'text-zinc-600',
    formError:   isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-rose-200 bg-rose-50 text-rose-700',
    formNote:    isDark ? 'text-zinc-500' : 'text-zinc-500',
    formSuccessTitle: isDark ? 'text-white' : 'text-zinc-900',
    formSuccessLead:  isDark ? 'text-zinc-300' : 'text-zinc-700',
    formSuccessAr:    isDark ? 'text-zinc-400' : 'text-zinc-600',
    statLabel:   isDark ? 'text-zinc-300' : 'text-zinc-800',
    statAr:      isDark ? 'text-zinc-500' : 'text-zinc-500',
    toggleBtn:   isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
    toggleBtnFloat: isDark ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 shadow-2xl shadow-black/40'
                           : 'bg-white text-zinc-700 hover:bg-zinc-50 shadow-2xl shadow-zinc-300/40 border border-zinc-200',
    blob1Color:  isDark ? '#7c3aed' : '#a78bfa',
    blob2Color:  isDark ? '#6366f1' : '#818cf8',
    blob1Opacity: isDark ? 0.30 : 0.18,
    blob2Opacity: isDark ? 0.25 : 0.14,
    gridLineColor: isDark ? '#ffffff' : '#000000',
    gridOpacity:   isDark ? 0.04 : 0.025,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────
export default function Landing() {
  // Synchronous initializer reads localStorage on the very first render
  // — avoids the dark-→-light flash that an effect-based read would
  // produce. SSR fallback is `false` (light); the client read replaces
  // this on hydration before paint.
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
    } catch {
      return false
    }
  })

  // Persist on change. Skipped on the very first run when state matches
  // what's already in localStorage (no-op write).
  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light') }
    catch { /* ignore quota / private mode */ }
  }, [isDark])

  const t = buildTheme(isDark)
  const toggle = () => setIsDark(v => !v)

  return (
    <div className={`relative min-h-screen overflow-x-hidden transition-colors duration-300 ${t.page}`}>
      <BackgroundBlobs t={t} />
      <Navbar t={t} onToggleTheme={toggle} />
      <Hero t={t} />
      <ProblemSolution t={t} />
      <FeaturesGrid t={t} />
      <SocialProof t={t} />
      <Tarifs t={t} />
      <CaptureForm t={t} />
      <Footer />
      <WhatsAppFAB />
      {/* Mobile-only floating theme toggle. Desktop has the same toggle
          inline in the navbar; we hide this one on md+. */}
      <button
        onClick={toggle}
        aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
        className={`md:hidden fixed bottom-5 left-5 z-50 inline-flex items-center justify-center w-12 h-12 rounded-full transition-colors ${t.toggleBtnFloat}`}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Animated background — pure CSS, GPU-friendly.
// ─────────────────────────────────────────────────────────────────────
function BackgroundBlobs({ t }: { t: Theme }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${t.blob1Color} 0%, transparent 60%)`,
          opacity:    t.blob1Opacity,
          animation:  'autodex-blob1 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${t.blob2Color} 0%, transparent 60%)`,
          opacity:    t.blob2Opacity,
          animation:  'autodex-blob2 28s ease-in-out infinite',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            `linear-gradient(to right, ${t.gridLineColor} 1px, transparent 1px), linear-gradient(to bottom, ${t.gridLineColor} 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          opacity:        t.gridOpacity,
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
// Navbar — sticky, with desktop theme toggle.
// ─────────────────────────────────────────────────────────────────────
function Navbar({ t, onToggleTheme }: { t: Theme; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${t.navbar}`}>
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href="/" className={`text-xl font-black tracking-tight ${t.text}`}>
          Auto<span className={t.accent}>Dex</span>
        </Link>
        <nav className={`hidden md:flex items-center gap-7 text-sm font-medium`}>
          <a href="#features" className={`transition-colors ${t.navLink}`}>Fonctionnalités</a>
          <a href="#tarifs"   className={`transition-colors ${t.navLink}`}>Tarifs</a>
          <a href="#contact"  className={`transition-colors ${t.navLink}`}>Contact</a>
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onToggleTheme}
            aria-label={t.isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            className={`p-2 rounded-full transition-colors ${t.toggleBtn}`}
          >
            {t.isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
          >
            Connexion
          </Link>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Menu"
          className={`md:hidden p-2 rounded-lg transition-colors ${t.navIcon}`}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className={`md:hidden border-t backdrop-blur-md px-4 py-3 space-y-2 ${t.navbarMobileSheet}`}>
          <a href="#features" onClick={() => setOpen(false)} className={`block py-2 text-sm ${t.navLink}`}>Fonctionnalités</a>
          <a href="#tarifs"   onClick={() => setOpen(false)} className={`block py-2 text-sm ${t.navLink}`}>Tarifs</a>
          <a href="#contact"  onClick={() => setOpen(false)} className={`block py-2 text-sm ${t.navLink}`}>Contact</a>
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
function Hero({ t }: { t: Theme }) {
  return (
    <section className="relative min-h-[90vh] flex items-center px-4 md:px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-widest ${t.badgePill}`}>
            <Zap className="w-3.5 h-3.5" /> SaaS pour l&apos;automobile en Algérie
          </span>
          <h1 className={`mt-6 text-4xl md:text-6xl font-black tracking-tight leading-[1.05] ${t.text}`}>
            Le CRM des concessionnaires{' '}
            <span className={t.accent}>algériens</span>
          </h1>
          <p className={`mt-5 text-lg md:text-xl max-w-xl leading-relaxed ${t.textMuted}`}>
            Gérez vos prospects, vos rendez-vous et votre inventaire depuis une seule plateforme.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#formulaire"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-lg shadow-violet-600/30 transition-colors"
            >
              Demander une démo gratuite <ChevronRight className="w-4 h-4" />
            </a>
            <a
              href="#features"
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-bold transition-colors ${t.secondaryBtn}`}
            >
              Voir les fonctionnalités
            </a>
          </div>
          <p className={`mt-6 text-xs font-medium uppercase tracking-widest ${t.textSubtle}`}>
            Déjà utilisé par des showrooms à Alger, Oran, Constantine
          </p>
        </div>

        {/* Arabic counterpart — inline RTL block. */}
        <div className="lg:col-span-5">
          <div
            dir="rtl"
            lang="ar"
            className={`rounded-2xl border p-8 ${t.arabicCard}`}
          >
            <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${t.arabicLabel}`}>بالعربية</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight">
              الـ CRM لوكالات السيارات الجزائرية
            </h2>
            <p className={`mt-4 text-base leading-relaxed ${t.arabicLead}`}>
              سيّر عملاءك، مواعيدك ومخزون سياراتك من مكان واحد.
            </p>
            <a
              href="#formulaire"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
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
function ProblemSolution({ t }: { t: Theme }) {
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
    <section id="features" className={`px-4 md:px-6 py-20 md:py-28 transition-colors ${t.sectionAlt}`}>
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${t.text}`}>
            Pourquoi <span className={t.accent}>AutoDex</span> ?
          </h2>
          <p dir="rtl" lang="ar" className={`mt-2 text-lg ${t.textMuted}`}>لماذا AutoDex ؟</p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((it, i) => {
            const Icon = it.icon
            return (
              <div
                key={i}
                className={`group rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 ${t.card}`}
              >
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${t.iconChip}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className={`mt-4 text-sm font-medium leading-relaxed ${t.cardWarn}`}>
                  ❌ {it.problem}
                </p>
                <div className={`my-3 h-px ${t.cardDivider}`} />
                <p className={`text-sm font-bold leading-relaxed ${t.cardOk}`}>
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
function FeaturesGrid({ t }: { t: Theme }) {
  const features = [
    { icon: Users2,    title: 'Gestion des prospects', desc: 'Suivez chaque lead de la prise de contact à la vente.' },
    { icon: Calendar,  title: 'RDV & Pipeline',        desc: 'Planifiez, suivez, relancez automatiquement.' },
    { icon: Car,       title: 'Inventaire véhicules',  desc: 'Stock en temps réel avec photos et fiches détaillées.' },
    { icon: BarChart3, title: 'Tableau de bord',       desc: 'Statistiques de ventes et performance de l\'équipe.' },
    { icon: MessageCircle, title: 'Intégrations',      desc: 'WhatsApp, Facebook, Instagram connectés.' },
    { icon: Shield,    title: 'Multi-showrooms',       desc: 'Chaque équipe dans son espace sécurisé.' },
  ]
  return (
    <section className="px-4 md:px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${t.text}`}>
            Tout ce qu&apos;il faut pour vendre <span className={t.accent}>plus</span>
          </h2>
          <p className={`mt-3 ${t.textMuted}`}>Une plateforme complète, pensée pour les showrooms algériens.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className={`rounded-2xl border p-6 transition-colors ${t.cardSolid}`}
              >
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${t.iconChipAlt}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className={`mt-4 text-base font-bold ${t.text}`}>{f.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${t.textMuted}`}>{f.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Stats — light mode uses violet-50 bg per spec.
// ─────────────────────────────────────────────────────────────────────
function SocialProof({ t }: { t: Theme }) {
  const stats = [
    { fig: '+50',  label: 'leads / mois',           ar: 'عميل محتمل / شهر' },
    { fig: '3×',   label: 'plus de RDV honorés',    ar: 'مواعيد محترمة' },
    { fig: '20',   label: 'minutes pour démarrer',  ar: 'دقيقة للإعداد' },
  ]
  return (
    <section className={`px-4 md:px-6 py-20 md:py-24 transition-colors ${t.statsAccent}`}>
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        {stats.map((s, i) => (
          <div key={i}>
            <p className="text-5xl md:text-6xl font-black tracking-tighter bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent">
              {s.fig}
            </p>
            <p className={`mt-2 font-bold ${t.statLabel}`}>{s.label}</p>
            <p dir="rtl" lang="ar" className={`text-xs mt-1 ${t.statAr}`}>{s.ar}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Capture form — POSTs to /api/prospects/capture, fires pixels.
// ─────────────────────────────────────────────────────────────────────
function CaptureForm({ t }: { t: Theme }) {
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

  const inputCls =
    `w-full h-11 px-3 rounded-xl border outline-none text-sm transition focus:ring-2 ${t.input}`

  return (
    <section id="formulaire" className={`px-4 md:px-6 py-20 md:py-28 transition-colors ${t.formAccent}`}>
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${t.text}`}>
            Essayez <span className={t.accent}>AutoDex</span> gratuitement
          </h2>
          <p dir="rtl" lang="ar" className={`mt-2 text-lg ${t.textMuted}`}>جرّب AutoDex مجاناً</p>
          <p className={`mt-3 ${t.textMuted}`}>
            Essai gratuit <strong className={t.text}>20 jours</strong> — sans carte bancaire.
          </p>
        </div>

        <div className={`mt-10 rounded-3xl border p-6 md:p-8 ${t.formCard}`}>
          {done ? (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h3 className={`text-xl font-bold ${t.formSuccessTitle}`}>
                Demande reçue !
              </h3>
              <p className={t.formSuccessLead}>
                Notre équipe vous contacte dans 24h.
              </p>
              <p dir="rtl" lang="ar" className={`text-sm ${t.formSuccessAr}`}>
                تم استلام طلبك! سيتصل بك فريقنا خلال 24 ساعة.
              </p>
              {done.duplicate && (
                <p className={`text-[11px] mt-2 ${t.textSubtle}`}>
                  Nous avons déjà vos coordonnées — un membre de l&apos;équipe vous recontactera.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Nom complet *" t={t}>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="ex. Karim Benali"
                  className={inputCls}
                />
              </Field>

              <Field label="Téléphone *" t={t}>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0555 XX XX XX"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

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
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-violet-900/30 transition-all disabled:opacity-60"
              >
                {submitting ? 'Envoi…' : 'Je veux tester AutoDex — مجاناً'}
              </button>
              <p className={`text-[11px] text-center ${t.formNote}`}>
                En soumettant ce formulaire, vous acceptez d&apos;être contacté par AutoDex.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

function Field({ label, children, t }: { label: string; children: React.ReactNode; t: Theme }) {
  return (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${t.fieldLabel}`}>{label}</label>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Tarifs (pricing section) — toggle between "Classique" and "La Totale",
// 3 plan cards each, prices hidden behind "Prix sur demande". Plans
// load from GET /api/saas-plans (public endpoint).
// ─────────────────────────────────────────────────────────────────────

const CLASSIQUE_FEATURES = [
  'Gestion des prospects',
  'RDV & Pipeline de ventes',
  'Inventaire véhicules',
  'Tableau de bord',
  'Intégrations WhatsApp/Facebook',
  'Support dédié',
] as const

const TOTALE_FEATURES = [
  'Tout le Plan Classique',
  'Module Location de véhicules',
  'Gestion contrats de location',
  'Suivi des retours',
  'Rapports avancés',
] as const

function Tarifs({ t }: { t: Theme }) {
  const [grouped, setGrouped] = useState<Record<SaasPlanType, SaasPlan[]>>({ classique: [], totale: [] })
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<SaasPlanType>('classique')
  // Brief content fade when toggling type — 150ms out, swap, 150ms in.
  const [fading, setFading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/saas-plans')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        const g = (j?.grouped ?? { classique: [], totale: [] }) as Record<SaasPlanType, SaasPlan[]>
        setGrouped(g)
      })
      .catch(() => { /* silent — landing falls back to skeleton */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function pickType(next: SaasPlanType) {
    if (next === selectedType) return
    setFading(true)
    // Swap content roughly mid-fade so the user sees a clean transition.
    window.setTimeout(() => {
      setSelectedType(next)
      setFading(false)
    }, 150)
  }

  const visiblePlans = grouped[selectedType] ?? []
  const features = selectedType === 'totale' ? TOTALE_FEATURES : CLASSIQUE_FEATURES

  return (
    <section id="tarifs" className={`px-4 md:px-6 py-20 md:py-28 transition-colors ${t.sectionAlt}`}>
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${t.text}`}>
            Choisissez votre <span className={t.accent}>formule</span>
          </h2>
          <p dir="rtl" lang="ar" className={`mt-2 text-lg ${t.textMuted}`}>اختر خطتك</p>
          <p className={`mt-3 ${t.textMuted}`}>
            Sans engagement • Essai gratuit 20 jours
          </p>
        </div>

        {/* ── Plan-type toggle ─────────────────────────────────────── */}
        <div className="mt-10 flex justify-center">
          <div className={`inline-flex items-center gap-1 p-1 rounded-2xl ${t.isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-zinc-100 border border-zinc-200'}`}>
            <button
              type="button"
              onClick={() => pickType('classique')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors ${
                selectedType === 'classique'
                  ? 'bg-violet-600 text-white shadow'
                  : t.isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Plan Classique
            </button>
            <button
              type="button"
              onClick={() => pickType('totale')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors inline-flex items-center gap-2 ${
                selectedType === 'totale'
                  ? 'bg-violet-600 text-white shadow'
                  : t.isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Plan La Totale</span>
              <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                selectedType === 'totale'
                  ? 'border-white/30 text-white/90'
                  : 'border-violet-400/50 text-violet-500'
              }`}>
                Location + Vente
              </span>
            </button>
          </div>
        </div>

        {/* ── Pricing cards ────────────────────────────────────────── */}
        <div
          className={`mt-12 grid grid-cols-1 md:grid-cols-3 gap-5 transition-opacity duration-150 ${fading ? 'opacity-0' : 'opacity-100'}`}
        >
          {loading && visiblePlans.length === 0 ? (
            // Skeleton: 3 placeholder cards while plans load.
            [0, 1, 2].map(i => (
              <div key={`sk-${i}`} className={`rounded-2xl border p-6 h-80 animate-pulse ${t.cardSolid}`}>
                <div className={`h-5 w-24 rounded ${t.isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
                <div className={`mt-4 h-8 w-32 rounded ${t.isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
              </div>
            ))
          ) : visiblePlans.length === 0 ? (
            <div className={`md:col-span-3 rounded-2xl border p-8 text-center ${t.cardSolid} ${t.textMuted}`}>
              Aucun plan {selectedType === 'totale' ? '« La Totale »' : '« Classique »'} disponible pour le moment.
            </div>
          ) : (
            visiblePlans.map((plan) => {
              const isPopular = plan.duration_months === 12
              return (
                <div
                  key={plan.id}
                  className={
                    'relative rounded-2xl border p-6 transition-all duration-300 flex flex-col ' +
                    (isPopular
                      ? 'bg-violet-600 text-white border-violet-500 md:scale-105 shadow-2xl shadow-violet-600/30'
                      : `${t.cardSolid} ${t.text}`)
                  }
                >
                  {isPopular && (
                    <span className="absolute -top-3 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400 text-amber-950 shadow">
                      <Star className="w-3 h-3 fill-current" /> Populaire
                    </span>
                  )}

                  <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">
                    {plan.duration_months === 12 ? '1 An' : `${plan.duration_months} mois`}
                  </p>
                  <h3 className="mt-1 text-2xl font-black">
                    {plan.name.replace(/—.*$/, '').trim() || plan.name}
                  </h3>

                  <div className="mt-5 mb-1 text-lg font-bold">
                    Prix sur demande
                  </div>
                  <p className={`text-xs ${isPopular ? 'text-white/70' : t.textMuted}`}>
                    Contactez-nous pour un devis personnalisé.
                  </p>

                  <ul className="mt-6 space-y-2.5 flex-1">
                    {features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isPopular ? 'text-emerald-200' : 'text-violet-500'}`} />
                        <span className={isPopular ? 'text-white/90' : t.text}>{f}</span>
                      </li>
                    ))}
                    {selectedType === 'totale' && (
                      <li className={`mt-2 text-[11px] italic ${isPopular ? 'text-white/70' : t.textSubtle}`}>
                        Descriptions détaillées à venir.
                      </li>
                    )}
                  </ul>

                  <div className="mt-6 space-y-2">
                    <a
                      href="#formulaire"
                      className={`block text-center px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        isPopular
                          ? 'border-white/40 text-white hover:bg-white/10'
                          : 'border-violet-500 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                      }`}
                    >
                      Demander un devis
                    </a>
                    <Link
                      href="/register"
                      className={`block text-center px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        isPopular
                          ? 'bg-white text-violet-700 hover:bg-zinc-100'
                          : 'bg-violet-600 text-white hover:bg-violet-700'
                      }`}
                    >
                      Essai gratuit 20 jours
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom note */}
        <p className={`mt-8 text-center text-xs ${t.textSubtle} inline-flex items-center gap-1.5 justify-center w-full`}>
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          Tous les plans incluent l&apos;essai gratuit de 20 jours.
        </p>
      </div>
    </section>
  )
}


// ─────────────────────────────────────────────────────────────────────
// Footer — stays dark in BOTH modes per spec.
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer id="contact" className="bg-zinc-900 border-t border-zinc-800/60 px-4 md:px-6 py-12 text-zinc-100">
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
// Floating WhatsApp button — same green in both modes.
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
