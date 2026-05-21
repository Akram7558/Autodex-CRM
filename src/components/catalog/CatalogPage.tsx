'use client'
// ─────────────────────────────────────────────────────────────────────
// Public showroom catalog — client renderer.
// ─────────────────────────────────────────────────────────────────────
// Light-mode-only, French throughout, mobile-first. Renders:
//   • Sticky showroom header (logo, name, city, open/closed, contact CTAs)
//   • Sticky tab nav: Véhicules disponibles | Pré-commandes
//   • Vehicle grid (3 / 2 / 1 cols) with order + WhatsApp + share
//   • Preorder grid (same shape, amber accent)
//   • Footer with address, hours table (today highlighted), Google Maps embed
//   • "Propulsé par AutoDex" credit
//
// Deep-link: `?v=<vehicle_id>` auto-scrolls to that card and pulses it
// in violet. Per-vehicle share icon uses `navigator.share` on mobile and
// falls back to clipboard copy. Header `Partager` shares the showroom URL.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  MapPin, Phone, Share2, Check, MessageCircle,
  Car, Package, Clock, Image as ImageIcon,
} from 'lucide-react'
import type {
  Vehicle,
  PreorderVehicle,
  ShowroomPublicInfo,
  ShowroomOpeningHours,
} from '@/lib/types'
import OrderModal from '@/components/catalog/OrderModal'
import PhotoLightbox from '@/components/ui/PhotoLightbox'
import VehicleDetailModal from '@/components/catalog/VehicleDetailModal'

// ─── French day plumbing ────────────────────────────────────────────
// JS Date.getDay(): 0=dimanche, 1=lundi, … 6=samedi
const DAY_KEYS = [
  'dimanche', 'lundi', 'mardi', 'mercredi',
  'jeudi', 'vendredi', 'samedi',
] as const
type DayKey = typeof DAY_KEYS[number]

const DAY_LABELS: Record<DayKey, string> = {
  lundi:    'Lundi',
  mardi:    'Mardi',
  mercredi: 'Mercredi',
  jeudi:    'Jeudi',
  vendredi: 'Vendredi',
  samedi:   'Samedi',
  dimanche: 'Dimanche',
}

// Display order: Mon → Sun (Algerian convention).
const DISPLAY_ORDER: DayKey[] = [
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
]

// ─── Helpers ────────────────────────────────────────────────────────

/** French-style number with thin spaces. */
function formatDZD(n: number | null | undefined): string {
  if (n == null) return ''
  // Intl returns NBSP — swap to regular space for cross-platform consistency.
  return new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ') + ' DZD'
}

function digitsOnly(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/\D/g, '')
}

/** Returns true/false if the showroom is open right now, or null when unknown. */
function isOpenNow(hours: ShowroomOpeningHours | null | undefined): boolean | null {
  if (!hours) return null
  const now = new Date()
  const dayKey = DAY_KEYS[now.getDay()]
  const slot = hours[dayKey]?.trim().toLowerCase()
  if (!slot) return null
  if (slot === 'fermé' || slot === 'ferme' || slot === 'closed') return false
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const openMin  = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
  const nowMin   = now.getHours() * 60 + now.getMinutes()
  return nowMin >= openMin && nowMin < closeMin
}

function vehicleSpecs(v: Vehicle): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = []
  if (v.kilometrage != null) {
    specs.push({
      label: 'Km',
      value: new Intl.NumberFormat('fr-FR').format(v.kilometrage)
        .replace(/ | /g, ' ') + ' km',
    })
  }
  if (v.motorisation)     specs.push({ label: 'Motorisation', value: v.motorisation })
  if (v.type_moteur)      specs.push({ label: 'Carburant',    value: v.type_moteur })
  if (v.finition)         specs.push({ label: 'Finition',     value: v.finition })
  if (v.color)            specs.push({ label: 'Couleur',      value: v.color })
  if (v.etat_carrosserie) specs.push({ label: 'État',         value: v.etat_carrosserie })
  if (v.carte_grise)      specs.push({ label: 'Carte grise',  value: v.carte_grise })
  return specs.slice(0, 4)
}

// ─── Main component ────────────────────────────────────────────────

type Tab = 'vehicles' | 'preorders'

export type OrderCtx =
  | { type: 'vehicle';  vehicle:  Vehicle }
  | { type: 'preorder'; preorder: PreorderVehicle }

export default function CatalogPage({
  data,
}: {
  data: {
    showroom: ShowroomPublicInfo
    vehicles: Vehicle[]
    preorders: PreorderVehicle[]
  }
}) {
  const { showroom, vehicles, preorders } = data
  const [tab, setTab]               = useState<Tab>('vehicles')
  const [order, setOrder]           = useState<OrderCtx | null>(null)
  const [shared, setShared]         = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Open/closed state, refreshed every minute ─────────────────────
  const [openNow, setOpenNow] = useState<boolean | null>(null)
  useEffect(() => {
    setOpenNow(isOpenNow(showroom.opening_hours))
    const t = setInterval(() => setOpenNow(isOpenNow(showroom.opening_hours)), 60_000)
    return () => clearInterval(t)
  }, [showroom.opening_hours])

  // ── ?v=<id> deep-link → auto-scroll + violet pulse ────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const target = new URLSearchParams(window.location.search).get('v')
    if (!target) return
    setTab('vehicles')
    const t = setTimeout(() => {
      const el = cardRefs.current[target]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightId(target)
        setTimeout(() => setHighlightId(null), 2400)
      }
    }, 120)
    return () => clearTimeout(t)
  }, [])

  const todayKey = useMemo<DayKey>(() => DAY_KEYS[new Date().getDay()], [])

  async function shareUrl(title: string, url: string) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ title, url }); return } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch {
      // last resort — silently swallow
    }
  }

  function shareShowroom() {
    const url = typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : ''
    void shareUrl(showroom.name, url)
  }

  function shareVehicle(v: Vehicle) {
    const base = typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : ''
    const url = `${base}?v=${v.id}`
    const title = `${v.brand} ${v.model}${v.year ? ' ' + v.year : ''} — ${showroom.name}`
    void shareUrl(title, url)
  }

  const phoneDigits    = digitsOnly(showroom.phone)
  const whatsappDigits = digitsOnly(showroom.whatsapp ?? showroom.phone ?? '')

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Sticky header (showroom identity + contact CTAs) ───────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="size-12 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 ring-1 ring-violet-200 flex items-center justify-center overflow-hidden shrink-0">
            {showroom.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={showroom.logo_url}
                alt={showroom.name}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-lg font-bold text-violet-700">
                {showroom.name?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base sm:text-lg font-semibold text-slate-900">
              {showroom.name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
              {showroom.city && <span className="truncate">{showroom.city}</span>}
              {openNow != null && (
                <span className={
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ' +
                  (openNow
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-slate-100 text-slate-600 ring-slate-200')
                }>
                  <span className={'size-1.5 rounded-full ' + (openNow ? 'bg-emerald-500' : 'bg-slate-400')} />
                  {openNow ? 'Ouvert' : 'Fermé'}
                </span>
              )}
            </div>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden sm:flex items-center gap-2">
            {phoneDigits && (
              <a
                href={`tel:+${phoneDigits}`}
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition"
              >
                <Phone className="size-4" /> Appeler
              </a>
            )}
            {whatsappDigits && (
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            <button
              onClick={shareShowroom}
              className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
            >
              {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
              {shared ? 'Lien copié' : 'Partager'}
            </button>
          </div>

          {/* Mobile share button (others go on the strip below) */}
          <button
            onClick={shareShowroom}
            aria-label="Partager"
            className="sm:hidden inline-flex items-center justify-center size-11 rounded-lg bg-violet-600 text-white"
          >
            {shared ? <Check className="size-5" /> : <Share2 className="size-5" />}
          </button>
        </div>

        {/* Mobile contact strip */}
        {(phoneDigits || whatsappDigits) && (
          <div className="sm:hidden mx-auto max-w-6xl px-4 pb-3 flex gap-2">
            {phoneDigits && (
              <a
                href={`tel:+${phoneDigits}`}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium"
              >
                <Phone className="size-4" /> Appeler
              </a>
            )}
            {whatsappDigits && (
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-emerald-600 text-white text-sm font-medium"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
          </div>
        )}

        {/* Sticky tab nav */}
        <nav className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 flex">
            <TabButton
              active={tab === 'vehicles'}
              onClick={() => setTab('vehicles')}
              icon={<Car className="size-4" />}
              label="Véhicules disponibles"
              count={vehicles.length}
              countActiveClass="bg-violet-100 text-violet-700"
            />
            <TabButton
              active={tab === 'preorders'}
              onClick={() => setTab('preorders')}
              icon={<Package className="size-4" />}
              label="Pré-commandes"
              count={preorders.length}
              countActiveClass="bg-amber-100 text-amber-700"
            />
          </div>
        </nav>
      </header>

      {/* ── Content grids ──────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {tab === 'vehicles' ? (
          vehicles.length === 0 ? (
            <EmptyState
              icon={<Car className="size-10 text-slate-400" />}
              title="Aucun véhicule disponible"
              subtitle="L'inventaire est mis à jour quotidiennement — revenez bientôt."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {vehicles.map((v) => (
                <VehicleCard
                  key={v.id}
                  v={v}
                  highlight={highlightId === v.id}
                  refSetter={(el) => { cardRefs.current[v.id] = el }}
                  onOrder={() => setOrder({ type: 'vehicle', vehicle: v })}
                  onShare={() => shareVehicle(v)}
                  whatsappDigits={whatsappDigits}
                  showroomName={showroom.name}
                />
              ))}
            </div>
          )
        ) : preorders.length === 0 ? (
          <EmptyState
            icon={<Package className="size-10 text-slate-400" />}
            title="Aucune pré-commande disponible"
            subtitle="Contactez-nous pour discuter d'un modèle particulier."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {preorders.map((p) => (
              <PreorderCard
                key={p.id}
                p={p}
                onOrder={() => setOrder({ type: 'preorder', preorder: p })}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Showroom info: address / hours / map ───────────────────── */}
      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Nous trouver</h2>

            <ul className="space-y-3 text-sm text-slate-700">
              {showroom.address && (
                <li className="flex gap-3">
                  <MapPin className="size-5 text-violet-600 shrink-0 mt-0.5" />
                  <span>
                    {showroom.address}
                    {showroom.city ? `, ${showroom.city}` : ''}
                  </span>
                </li>
              )}
              {phoneDigits && (
                <li className="flex gap-3">
                  <Phone className="size-5 text-violet-600 shrink-0 mt-0.5" />
                  <a href={`tel:+${phoneDigits}`} className="hover:text-violet-700">
                    +{phoneDigits}
                  </a>
                </li>
              )}
              {whatsappDigits && (
                <li className="flex gap-3">
                  <MessageCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-700"
                  >
                    WhatsApp
                  </a>
                </li>
              )}
            </ul>

            {/* Hours table */}
            {showroom.opening_hours && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Clock className="size-4 text-violet-600" /> Horaires d&apos;ouverture
                </h3>
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {DISPLAY_ORDER.map((day) => {
                    const slot = showroom.opening_hours?.[day]?.trim().toLowerCase()
                    const closed = !slot || slot === 'fermé' || slot === 'ferme' || slot === 'closed'
                    const isToday = day === todayKey
                    return (
                      <div
                        key={day}
                        className={
                          'flex justify-between items-center px-4 py-2 text-sm border-b last:border-b-0 border-slate-100 ' +
                          (isToday ? 'bg-violet-50' : '')
                        }
                      >
                        <span className={'font-medium ' + (isToday ? 'text-violet-700' : 'text-slate-700')}>
                          {DAY_LABELS[day]}
                          {isToday && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                              Aujourd&apos;hui
                            </span>
                          )}
                        </span>
                        <span className={closed ? 'text-rose-600 font-medium' : 'text-slate-700'}>
                          {closed ? 'Fermé' : showroom.opening_hours?.[day]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Map link card (right column hidden when no URL).
              We deliberately do NOT iframe the URL — Google's regular
              maps.app.goo.gl / google.com/maps share links refuse to
              be embedded (X-Frame-Options: DENY), which would surface
              "refused to connect" on the visitor's screen. A clickable
              preview card works with any URL the owner pastes. */}
          {showroom.google_maps_url && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Localisation</h2>
              <a
                href={showroom.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl border border-slate-200 bg-zinc-100 hover:bg-zinc-50 hover:shadow-lg hover:scale-[1.01] transition-all duration-200 aspect-[4/3] overflow-hidden"
                aria-label="Ouvrir l'itinéraire sur Google Maps"
              >
                <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
                  <div className="size-14 rounded-full bg-violet-100 ring-1 ring-violet-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MapPin className="size-7 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      📍 Voir sur Google Maps
                    </p>
                    {(showroom.address || showroom.city) && (
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                        {showroom.address}
                        {showroom.address && showroom.city ? ', ' : ''}
                        {showroom.city ?? ''}
                      </p>
                    )}
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 group-hover:text-violet-800">
                    Ouvrir l&apos;itinéraire →
                  </span>
                </div>
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500">
          Propulsé par{' '}
          <a href="/" className="font-semibold text-violet-700 hover:text-violet-800">
            AutoDex
          </a>
        </div>
      </footer>

      {/* ── Order modal ────────────────────────────────────────────── */}
      {order && (
        <OrderModal
          slug={showroom.slug ?? ''}
          showroomName={showroom.name}
          whatsappDigits={whatsappDigits}
          order={order}
          onClose={() => setOrder(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label, count, countActiveClass,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
  countActiveClass: string
}) {
  return (
    <button
      onClick={onClick}
      className={
        'relative flex-1 sm:flex-none sm:px-6 py-3 text-sm font-medium transition ' +
        (active ? 'text-violet-700' : 'text-slate-500 hover:text-slate-800')
      }
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        <span className="hidden xs:inline sm:inline">{label}</span>
        <span className="sm:hidden">{label.split(' ')[0]}</span>
        <span
          className={
            'inline-flex items-center justify-center min-w-6 h-5 px-1.5 text-[11px] rounded-full ' +
            (active ? countActiveClass : 'bg-slate-100 text-slate-600')
          }
        >
          {count}
        </span>
      </span>
      {active && (
        <motion.div
          layoutId="catalog-tab-underline"
          className="absolute left-0 right-0 -bottom-px h-0.5 bg-violet-600 rounded-full"
        />
      )}
    </button>
  )
}

function EmptyState({
  icon, title, subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center py-20">
      <div className="mx-auto size-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  )
}

function VehicleCard({
  v, highlight, refSetter, onOrder, onShare, whatsappDigits, showroomName,
}: {
  v: Vehicle
  highlight: boolean
  refSetter: (el: HTMLDivElement | null) => void
  onOrder: () => void
  onShare: () => void
  whatsappDigits: string
  showroomName: string
}) {
  const specs = vehicleSpecs(v)
  const waMsg = `Bonjour ${showroomName}, je suis intéressé(e) par : ${v.brand} ${v.model}${v.year ? ' ' + v.year : ''}${v.reference ? ' (Réf. ' + v.reference + ')' : ''}.`

  // Gallery: prefer the multi-photo array, fall back to the legacy single
  // image_url so older rows still render.
  const photos = (v.photos_urls && v.photos_urls.length > 0)
    ? v.photos_urls
    : (v.image_url ? [v.image_url] : [])

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [detailOpen, setDetailOpen]     = useState(false)

  return (
    <motion.div
      ref={refSetter}
      animate={
        highlight
          ? {
              boxShadow: [
                '0 0 0 0 rgba(139,92,246,0)',
                '0 0 0 8px rgba(139,92,246,0.35)',
                '0 0 0 0 rgba(139,92,246,0)',
              ],
            }
          : {}
      }
      transition={highlight ? { duration: 1.6, repeat: 1 } : {}}
      className={
        'group rounded-2xl border bg-white overflow-hidden flex flex-col transition ' +
        (highlight
          ? 'border-violet-400 ring-2 ring-violet-300'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md')
      }
    >
      {/* Image — CLICK ZONE 1: opens the fullscreen lightbox. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={photos.length > 0 ? 'Agrandir les photos' : `${v.brand} ${v.model}`}
        onClick={() => { if (photos.length > 0) setLightboxOpen(true) }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && photos.length > 0) {
            e.preventDefault()
            setLightboxOpen(true)
          }
        }}
        className="relative aspect-[16/10] bg-gradient-to-br from-violet-100 via-violet-50 to-fuchsia-50 overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos[0]}
            alt={`${v.brand} ${v.model}`}
            loading="lazy"
            className="w-full h-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Car className="size-14 text-violet-300" />
          </div>
        )}

        {/* Photo count badge (multi-photo only) */}
        {photos.length > 1 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5">
            <ImageIcon className="size-3" />
            {photos.length}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onShare() }}
          aria-label="Partager ce véhicule"
          className="absolute top-2 right-2 size-9 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow flex items-center justify-center backdrop-blur"
        >
          <Share2 className="size-4" />
        </button>
      </div>

      {/* Body — CLICK ZONE 2: opens the read-only detail modal. The
          action buttons stopPropagation so they don't also open it. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Voir les détails — ${v.brand} ${v.model}`}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setDetailOpen(true)
          }
        }}
        className="p-4 flex flex-col gap-3 flex-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-inset"
      >
        <div>
          <h3 className="font-semibold text-slate-900 leading-tight">
            {v.brand} {v.model}
            {v.year ? <span className="text-slate-500 font-normal"> · {v.year}</span> : null}
          </h3>
          {v.reference && (
            <div className="text-[11px] text-slate-500 mt-0.5">Réf. {v.reference}</div>
          )}
        </div>

        <div className="text-violet-700 font-bold text-lg">
          {v.price_dzd != null ? formatDZD(v.price_dzd) : 'Prix sur demande'}
        </div>

        {specs.length > 0 && (
          <ul className="grid grid-cols-2 gap-1 text-[11px]">
            {specs.map((s) => (
              <li
                key={s.label}
                className="rounded-md bg-slate-50 px-2 py-1 text-slate-700 truncate"
              >
                <span className="text-slate-500">{s.label} : </span>
                {s.value}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onOrder() }}
            className="flex-1 h-11 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition"
          >
            Commander
          </button>
          {whatsappDigits && (
            <a
              onClick={(e) => e.stopPropagation()}
              href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(waMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contacter sur WhatsApp"
              className="inline-flex items-center justify-center size-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <MessageCircle className="size-4" />
            </a>
          )}
        </div>
      </div>

      {/* Fullscreen photo lightbox + read-only detail modal */}
      <PhotoLightbox
        open={lightboxOpen}
        photos={photos}
        startIndex={0}
        onClose={() => setLightboxOpen(false)}
        alt={`${v.brand} ${v.model}`}
      />
      <VehicleDetailModal
        open={detailOpen}
        vehicle={v}
        showroomName={showroomName}
        whatsappDigits={whatsappDigits}
        onClose={() => setDetailOpen(false)}
      />
    </motion.div>
  )
}

function PreorderCard({
  p, onOrder,
}: {
  p: PreorderVehicle
  onOrder: () => void
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col hover:border-amber-300 hover:shadow-md transition">
      <div className="relative aspect-[16/10] bg-gradient-to-br from-amber-100 via-amber-50 to-orange-50 overflow-hidden">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt={`${p.marque} ${p.modele}`}
            loading="lazy"
            className="w-full h-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="size-14 text-amber-300" />
          </div>
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-100 text-amber-800 ring-1 ring-amber-300 rounded-full shadow-sm">
          📦 Pré-commande
        </span>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-slate-900 leading-tight">
          {p.marque} {p.modele}
          {p.annee ? <span className="text-slate-500 font-normal"> · {p.annee}</span> : null}
        </h3>
        <div className="text-amber-700 font-bold">
          {p.prix_estime != null
            ? `À partir de ${formatDZD(p.prix_estime)}`
            : 'Prix sur demande'}
        </div>

        {/* Compact spec strip — same shape as VehicleCard so the two
            tabs feel consistent. Only filled fields render. */}
        <ul className="grid grid-cols-2 gap-1 text-[11px]">
          {p.annee != null && (
            <li className="rounded-md bg-amber-50 px-2 py-1 text-slate-700 truncate">
              <span className="text-slate-500">Année : </span>{p.annee}
            </li>
          )}
          {p.delai_livraison && (
            <li className="rounded-md bg-amber-50 px-2 py-1 text-slate-700 truncate">
              <span className="text-slate-500">Délai : </span>{p.delai_livraison}
            </li>
          )}
          {p.budget_dedouanement != null && (
            <li className="rounded-md bg-amber-50 px-2 py-1 text-slate-700 truncate col-span-2">
              <span className="text-slate-500">Budget dédouanement : </span>
              {formatDZD(p.budget_dedouanement)}
            </li>
          )}
        </ul>

        {p.description && (
          <p className="text-xs text-slate-600 line-clamp-3">{p.description}</p>
        )}

        <div className="mt-auto pt-2">
          <button
            onClick={onOrder}
            className="w-full h-11 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-sm font-semibold transition"
          >
            Pré-commander
          </button>
        </div>
      </div>
    </div>
  )
}
