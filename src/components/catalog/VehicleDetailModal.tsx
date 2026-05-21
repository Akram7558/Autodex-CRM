'use client'
// ─────────────────────────────────────────────────────────────────────
// VehicleDetailModal — public, read-only vehicle detail sheet.
// ─────────────────────────────────────────────────────────────────────
// Anonymous-visitor facing (no auth). Opens when a catalog visitor taps
// the card body. Shows a photo gallery (tap opens the shared fullscreen
// PhotoLightbox), the price, every available spec, and a prominent
// WhatsApp CTA pre-filled with the vehicle reference.
//
// Light theme to match the public catalog (slate / violet, emerald for
// the WhatsApp action). Self-managed enter/exit animation via the
// render/show pattern, so the parent can flip `open` and still get a
// smooth close. ESC is gated while the lightbox is on top so one keypress
// doesn't close both layers.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Car, MessageCircle, X } from 'lucide-react'
import type { Vehicle } from '@/lib/types'
import PhotoLightbox from '@/components/ui/PhotoLightbox'

const ANIM_MS = 200

function formatDZD(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ') + ' DZD'
}

function fullSpecs(v: Vehicle): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (v.year != null)        out.push({ label: 'Année',        value: String(v.year) })
  if (v.kilometrage != null) out.push({
    label: 'Kilométrage',
    value: new Intl.NumberFormat('fr-FR').format(v.kilometrage).replace(/ | /g, ' ') + ' km',
  })
  if (v.type_moteur)         out.push({ label: 'Carburant',     value: v.type_moteur })
  if (v.motorisation)        out.push({ label: 'Motorisation',  value: v.motorisation })
  if (v.finition)            out.push({ label: 'Finition',      value: v.finition })
  if (v.color)               out.push({ label: 'Couleur',       value: v.color })
  if (v.etat_carrosserie)    out.push({ label: 'Carrosserie',   value: v.etat_carrosserie })
  if (v.carte_grise)         out.push({ label: 'Carte grise',   value: v.carte_grise })
  return out
}

export default function VehicleDetailModal({
  open, vehicle, showroomName, whatsappDigits, onClose,
}: {
  open:           boolean
  vehicle:        Vehicle
  showroomName:   string
  whatsappDigits: string
  onClose:        () => void
}) {
  const [render, setRender] = useState(open)
  const [show, setShow]     = useState(false)
  const [active, setActive] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const dialogRef    = useRef<HTMLDivElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  const photos = (vehicle.photos_urls && vehicle.photos_urls.length > 0)
    ? vehicle.photos_urls
    : (vehicle.image_url ? [vehicle.image_url] : [])
  const specs = fullSpecs(vehicle)
  const title = `${vehicle.brand} ${vehicle.model}${vehicle.year ? ' · ' + vehicle.year : ''}`

  // Enter/exit animation lifecycle.
  useEffect(() => {
    if (open) {
      setRender(true)
      setActive(0)
      const id = requestAnimationFrame(() => setShow(true))
      return () => cancelAnimationFrame(id)
    }
    setShow(false)
    const t = setTimeout(() => setRender(false), ANIM_MS)
    return () => clearTimeout(t)
  }, [open])

  // ESC closes — but only the modal when the lightbox isn't on top.
  useEffect(() => {
    if (!render) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lightboxOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [render, lightboxOpen, onClose])

  // Body scroll lock.
  useEffect(() => {
    if (!render) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [render])

  // Focus move-in / return.
  useEffect(() => {
    if (!render) return
    lastFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const id = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(id)
      lastFocusRef.current?.focus?.()
    }
  }, [render])

  if (!render) return null

  const priceText = vehicle.price_dzd != null ? formatDZD(vehicle.price_dzd) : null
  const waMsg =
    `Bonjour ${showroomName}, je suis intéressé(e) par la ${vehicle.brand} ${vehicle.model}` +
    `${vehicle.year ? ' ' + vehicle.year : ''}` +
    `${priceText ? ` affichée à ${priceText}` : ''}` +
    `${vehicle.reference ? ` (Réf. ${vehicle.reference})` : ''} sur votre catalogue.`
  const waHref = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(waMsg)}`

  return (
    <div
      onClick={onClose}
      className={
        'fixed inset-0 z-[90] flex items-end sm:items-center justify-center ' +
        'transition-opacity duration-200 ease-out motion-reduce:transition-none ' +
        (show ? 'opacity-100' : 'opacity-0')
      }
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={
          'w-full sm:max-w-2xl bg-white text-slate-900 shadow-2xl outline-none ' +
          'rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto ' +
          'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ' +
          (show ? 'opacity-100 translate-y-0 sm:scale-100' : 'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95')
        }
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-white/95 backdrop-blur border-b border-slate-200">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 inline-flex items-center justify-center size-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Gallery */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { if (photos.length > 0) setLightboxOpen(true) }}
              aria-label="Agrandir la photo"
              disabled={photos.length === 0}
              className="group relative block w-full aspect-[16/10] rounded-xl overflow-hidden bg-gradient-to-br from-violet-100 via-violet-50 to-fuchsia-50 outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {photos.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photos[Math.min(active, photos.length - 1)]}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  className="w-full h-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Car className="size-14 text-violet-300" />
                </span>
              )}
              {photos.length > 1 && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">
                  {Math.min(active, photos.length - 1) + 1} / {photos.length}
                </span>
              )}
            </button>

            {/* Thumbnail strip */}
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button
                    key={p + i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Photo ${i + 1}`}
                    aria-current={i === active ? 'true' : undefined}
                    className={
                      'relative shrink-0 size-16 rounded-lg overflow-hidden ring-2 transition ' +
                      (i === active ? 'ring-violet-500' : 'ring-transparent hover:ring-slate-300')
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price */}
          <div className="text-violet-700 font-bold text-2xl">
            {priceText ?? 'Prix sur demande'}
          </div>

          {vehicle.reference && (
            <div className="text-xs text-slate-500 -mt-3">Réf. {vehicle.reference}</div>
          )}

          {/* Specs grid */}
          {specs.length > 0 && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {specs.map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</dt>
                  <dd className="text-sm font-medium text-slate-900 mt-0.5 break-words">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* WhatsApp CTA — hidden when the showroom has no number */}
          {whatsappDigits && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors"
            >
              <MessageCircle className="size-5" />
              Contacter sur WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Shared fullscreen lightbox (renders above this modal). */}
      <PhotoLightbox
        open={lightboxOpen}
        photos={photos}
        startIndex={active}
        onClose={() => setLightboxOpen(false)}
        alt={`${vehicle.brand} ${vehicle.model}`}
      />
    </div>
  )
}
