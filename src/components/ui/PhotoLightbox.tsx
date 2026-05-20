'use client'
// ─────────────────────────────────────────────────────────────────────
// PhotoLightbox — dependency-free fullscreen photo carousel.
// ─────────────────────────────────────────────────────────────────────
// Fullscreen overlay that shows one photo at a time (object-contain),
// with:
//   • open/close animation (backdrop fade + image scale .92→1), CSS only,
//     ~220ms ease-out, motion-reduce aware
//   • prev/next arrow buttons (desktop), Left/Right keyboard arrows
//   • touch swipe on mobile (deltaX threshold), clamped at the ends
//   • "n / total" counter + dot indicators
//   • close via X button, ESC, or backdrop click (NOT image click)
//   • body scroll lock + focus move/return + role="dialog" aria-modal
//
// Photos are plain <img src> strings (public URLs for the sales catalog).
// Theme-aware via CSS variables; backdrop is a fixed dark scrim.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = {
  open:        boolean
  photos:      string[]
  startIndex?: number
  onClose:     () => void
  /** Optional alt text prefix, e.g. "Renault Clio". */
  alt?:        string
}

const ANIM_MS = 220
const SWIPE_THRESHOLD = 50

export default function PhotoLightbox({
  open, photos, startIndex = 0, onClose, alt = '',
}: Props) {
  // `render` keeps the node mounted through the close animation; `show`
  // drives the enter/exit transition state.
  const [render, setRender] = useState(open)
  const [show, setShow]     = useState(false)
  const [index, setIndex]   = useState(startIndex)

  const dialogRef    = useRef<HTMLDivElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)
  const touchStartX  = useRef<number | null>(null)
  const touchDX      = useRef(0)

  const count = photos.length

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)))
  }, [count])

  // ── Mount/unmount with enter/exit animation ─────────────────
  useEffect(() => {
    if (open) {
      setRender(true)
      const id = requestAnimationFrame(() => setShow(true))
      return () => cancelAnimationFrame(id)
    }
    setShow(false)
    const t = setTimeout(() => setRender(false), ANIM_MS)
    return () => clearTimeout(t)
  }, [open])

  // Reset to the requested start index each time it opens.
  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, startIndex), Math.max(0, count - 1)))
  }, [open, startIndex, count])

  // ── Keyboard: ESC + arrows ──────────────────────────────────
  useEffect(() => {
    if (!render) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [render, go, onClose])

  // ── Body scroll lock ────────────────────────────────────────
  useEffect(() => {
    if (!render) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [render])

  // ── Focus move on open, return on close ─────────────────────
  useEffect(() => {
    if (!render) return
    lastFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const id = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(id)
      lastFocusRef.current?.focus?.()
    }
  }, [render])

  if (!render || count === 0) return null

  const current   = photos[Math.min(index, count - 1)]
  const hasPrev   = index > 0
  const hasNext   = index < count - 1
  const multiple  = count > 1

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
    touchDX.current = 0
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current != null) {
      touchDX.current = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current
    }
  }
  function onTouchEnd() {
    const dx = touchDX.current
    if (dx > SWIPE_THRESHOLD) go(-1)
    else if (dx < -SWIPE_THRESHOLD) go(1)
    touchStartX.current = null
    touchDX.current = 0
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Galerie photos"
      tabIndex={-1}
      onClick={onClose}
      className={
        'fixed inset-0 z-[100] flex items-center justify-center outline-none ' +
        'transition-opacity duration-200 ease-out motion-reduce:transition-none ' +
        (show ? 'opacity-100' : 'opacity-0')
      }
      style={{
        background: 'rgba(8, 8, 11, 0.92)',
        backdropFilter: 'blur(6px)',
        paddingTop:    'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        paddingLeft:   'max(env(safe-area-inset-left), 12px)',
        paddingRight:  'max(env(safe-area-inset-right), 12px)',
      }}
    >
      {/* Counter */}
      {multiple && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold tabular-nums select-none"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        >
          <bdi>{index + 1}</bdi> / <bdi>{count}</bdi>
        </div>
      )}

      {/* Close */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Fermer"
        className="absolute top-2 end-2 w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors duration-150 motion-reduce:transition-none"
        style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {multiple && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(-1) }}
          disabled={!hasPrev}
          aria-label="Photo précédente"
          className="absolute start-2 sm:start-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full inline-flex items-center justify-center transition-opacity duration-150 motion-reduce:transition-none disabled:opacity-30"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        >
          <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
        </button>
      )}

      {/* Next */}
      {multiple && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(1) }}
          disabled={!hasNext}
          aria-label="Photo suivante"
          className="absolute end-2 sm:end-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full inline-flex items-center justify-center transition-opacity duration-150 motion-reduce:transition-none disabled:opacity-30"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
        >
          <ChevronRight className="w-6 h-6 rtl:rotate-180" />
        </button>
      )}

      {/* Image */}
      <img
        src={current}
        alt={alt ? `${alt} — photo ${index + 1}` : `Photo ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={
          'max-w-[92vw] max-h-[82vh] object-contain rounded-lg select-none ' +
          'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ' +
          (show ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.92]')
        }
        style={{ boxShadow: '0 24px 80px -20px rgba(0,0,0,0.7)', touchAction: 'pan-y' }}
        draggable={false}
      />

      {/* Dot indicators */}
      {multiple && count <= 12 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center gap-1.5"
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIndex(i) }}
              aria-label={`Aller à la photo ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className="h-2 rounded-full transition-all duration-150 motion-reduce:transition-none"
              style={{
                width: i === index ? 18 : 8,
                background: i === index ? 'var(--accent, #10b981)' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
