'use client'
// ─────────────────────────────────────────────────────────────────────
// Booking wizard — Step 4: récap + signature.
// ─────────────────────────────────────────────────────────────────────
// Read-only recap of the whole booking, plus a raw-canvas signature pad
// (mouse + touch via Pointer Events, devicePixelRatio-crisp, no library).
// The signature is OPTIONAL at draft stage — it exports to a PNG data URL
// in wizard state; the shell uploads it and creates the rental.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Car as CarIcon, User, Eraser, PenLine, CalendarDays } from 'lucide-react'
import { getSignedReadUrl } from '@/lib/rental/storage'
import {
  type BookingAction, type BookingState,
  computeDurationDays, computePricing, formatDateFr, formatDZD,
} from '@/components/rental/booking/types'

export default function StepRecapSignature({
  state, dispatch, onValidity,
}: {
  state:      BookingState
  dispatch:   (a: BookingAction) => void
  onValidity: (valid: boolean) => void
}) {
  const durationDays = computeDurationDays(state.startDate, state.endDate)
  const { basePrice, discountAmount, total } = computePricing(
    state.vehicle?.daily_rate, durationDays, state.discountType, state.discountValue,
  )

  // Signature is optional at draft stage — step is always submittable.
  useEffect(() => { onValidity(true) }, [onValidity])

  const v = state.vehicle
  const c = state.customer

  return (
    <div className="space-y-6">
      {/* ── Recap ───────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Vehicle */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 p-3">
            <Thumb path={v?.photos_urls?.[0] ?? null} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Véhicule</p>
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {v ? `${v.marque} ${v.modele}` : '—'} {v?.annee ? <span className="font-normal text-[var(--text-secondary)]">· {v.annee}</span> : null}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{v?.immatriculation ?? ''}</p>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c?.full_name ?? '—'}</p>
            <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c?.phone ?? ''}</p>
          </div>
        </div>
      </section>

      {/* Dates + pricing */}
      <section className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <Row icon={<CalendarDays className="w-4 h-4" />} label="Période">
          {formatDateFr(state.startDate)} {state.startTime} → {formatDateFr(state.endDate)} {state.endTime}
          <span className="text-[var(--text-muted)]"> · {durationDays ?? 0} jour{(durationDays ?? 0) > 1 ? 's' : ''}</span>
        </Row>
        <hr style={{ borderColor: 'var(--border)' }} />
        <Line label="Prix de base">{formatDZD(basePrice)}</Line>
        {discountAmount > 0 && <Line label="Remise" muted>− {formatDZD(discountAmount)}</Line>}
        <Line label="Total" strong>{formatDZD(total)}</Line>
        <Line label="Caution" muted>{formatDZD(state.depositAmount)}</Line>
      </section>

      {/* ── Signature ───────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
          <PenLine className="w-4 h-4" /> Signature du client
        </h3>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Optionnel à ce stade — le brouillon peut être signé plus tard.
        </p>
        <SignaturePad
          value={state.signatureDataUrl}
          onChange={(dataUrl) => dispatch({ type: 'SET_SIGNATURE', dataUrl })}
        />
      </section>
    </div>
  )
}

// ─── Recap atoms ────────────────────────────────────────────────────
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5" style={{ color: 'var(--accent)' }}>{icon}</span>
      <span><span className="text-[var(--text-muted)]">{label} : </span><span className="text-[var(--text-primary)]">{children}</span></span>
    </div>
  )
}
function Line({ label, children, strong, muted }: { label: string; children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className={strong ? 'text-base font-bold tabular-nums' : 'tabular-nums'}
        style={{ color: muted ? 'var(--text-secondary)' : 'var(--text-primary)' }}
      >
        <bdi>{children}</bdi>
      </span>
    </div>
  )
}

function Thumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); return }
    ;(async () => { const u = await getSignedReadUrl(path); if (!cancelled) setUrl(u) })()
    return () => { cancelled = true }
  }, [path])
  return (
    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <CarIcon className="w-6 h-6" style={{ color: 'var(--accent)', opacity: 0.5 }} />
      )}
    </div>
  )
}

// ─── Signature pad (raw canvas, Pointer Events, DPR-crisp) ───────────
function SignaturePad({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef    = useRef<CanvasRenderingContext2D | null>(null)
  const drawing   = useRef(false)
  const last      = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(!!value)

  // Initialize the canvas once: size to wrapper × DPR, white bg, and
  // redraw any existing signature (so navigating back keeps it).
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const cssW = Math.max(1, Math.floor(wrap.clientWidth))
    const cssH = 180
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctxRef.current = ctx
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH)
      img.src = value
    }
    // Initialize once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointFromEvent(e)
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !ctxRef.current || !last.current) return
    const p = pointFromEvent(e)
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasInk) setHasInk(true)
  }
  function endStroke() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }
  function clear() {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, 180)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="rounded-xl overflow-hidden"
        style={{ border: '1.5px solid var(--border)' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          className="block w-full touch-none cursor-crosshair"
          style={{ touchAction: 'none', background: '#ffffff' }}
          aria-label="Zone de signature"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px]" style={{ color: hasInk ? 'var(--accent)' : 'var(--text-muted)' }}>
          {hasInk ? 'Signature capturée ✓' : 'Signez dans le cadre ci-dessus'}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 h-9 rounded-lg disabled:opacity-40"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <Eraser className="w-3.5 h-3.5" /> Effacer
        </button>
      </div>
    </div>
  )
}
