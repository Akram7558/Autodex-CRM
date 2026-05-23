'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalFleetSection — public catalog "Location" tab.
// ─────────────────────────────────────────────────────────────────────
// Anonymous-visitor facing. Renders the showroom's active rental fleet as
// cards (photo → PhotoLightbox, pricing, availability badge) with a
// per-vehicle inline rental request form that posts to the public
// endpoint (chunk A). Photos arrive as already-signed URLs resolved
// server-side (the rental-documents bucket is private). Light/violet
// public theme to match the rest of the catalog.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Car, MessageCircle, Check, Loader2, CalendarRange } from 'lucide-react'
import PhotoLightbox from '@/components/ui/PhotoLightbox'
import { RENTAL_PROSPECT_REASONS } from '@/lib/rental/prospects'
import { formatDZD } from '@/components/rental/booking/types'

export type RentalFleetCard = {
  id:            string
  marque:        string
  modele:        string
  annee:         number | null
  daily_rate:    number
  weekly_rate:   number | null
  monthly_rate:  number | null
  deposit_amount: number
  photos:        string[]   // pre-resolved signed URLs (server-side)
  isAvailable:   boolean
}

// Soft client check — server (normalizePhone) is the source of truth.
function phoneLooksValid(p: string): boolean {
  const d = p.replace(/[\s.-]/g, '')
  return /^(\+213|0)(5|6|7)\d{8}$/.test(d)
}

export default function RentalFleetSection({
  slug, vehicles, showroomName,
}: {
  slug: string
  vehicles: RentalFleetCard[]
  showroomName: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (vehicles.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="mx-auto size-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Car className="size-10 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Aucun véhicule de location</h3>
        <p className="mt-1 text-sm text-slate-600">Revenez bientôt — la flotte est mise à jour régulièrement.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {vehicles.map((v) => (
        <LocationCard
          key={v.id}
          v={v}
          slug={slug}
          showroomName={showroomName}
          open={openId === v.id}
          onToggle={() => setOpenId((cur) => (cur === v.id ? null : v.id))}
        />
      ))}
    </div>
  )
}

function LocationCard({
  v, slug, showroomName, open, onToggle,
}: {
  v: RentalFleetCard
  slug: string
  showroomName: string
  open: boolean
  onToggle: () => void
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const hasPhotos = v.photos.length > 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      {/* Photo — opens lightbox */}
      <div
        role={hasPhotos ? 'button' : undefined}
        tabIndex={hasPhotos ? 0 : undefined}
        aria-label={hasPhotos ? 'Agrandir les photos' : undefined}
        onClick={() => { if (hasPhotos) setLightboxOpen(true) }}
        onKeyDown={(e) => {
          if (hasPhotos && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setLightboxOpen(true) }
        }}
        className={
          'relative aspect-[16/10] bg-gradient-to-br from-violet-100 via-violet-50 to-fuchsia-50 overflow-hidden ' +
          (hasPhotos ? 'cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-violet-400' : '')
        }
      >
        {hasPhotos ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.photos[0]} alt={`${v.marque} ${v.modele}`} loading="lazy"
            className="w-full h-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Car className="size-14 text-violet-300" /></div>
        )}
        {/* Availability badge */}
        <span
          className={
            'absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full ring-1 ' +
            (v.isAvailable
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-100 text-slate-600 ring-slate-200')
          }
        >
          <span className={'size-1.5 rounded-full ' + (v.isAvailable ? 'bg-emerald-500' : 'bg-slate-400')} />
          {v.isAvailable ? 'Disponible' : 'Indisponible'}
        </span>
        {v.photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">
            {v.photos.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-slate-900 leading-tight">
          {v.marque} {v.modele}
          {v.annee ? <span className="text-slate-500 font-normal"> · {v.annee}</span> : null}
        </h3>

        <div className="space-y-0.5">
          <div className="text-violet-700 font-bold text-lg">
            <bdi>{formatDZD(v.daily_rate)}</bdi> <span className="text-xs font-normal text-slate-500">/ jour</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
            {v.weekly_rate != null && v.weekly_rate > 0 && (
              <span><bdi>{formatDZD(v.weekly_rate)}</bdi> / semaine</span>
            )}
            {v.monthly_rate != null && v.monthly_rate > 0 && (
              <span><bdi>{formatDZD(v.monthly_rate)}</bdi> / mois</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-auto h-11 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2"
        >
          <CalendarRange className="size-4" />
          {open ? 'Fermer' : 'Réserver / Demander'}
        </button>
      </div>

      {/* Expandable request form */}
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ maxHeight: open ? 900 : 0, opacity: open ? 1 : 0 }}
        aria-hidden={!open}
      >
        {open && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100">
            <RentalRequestForm
              slug={slug}
              vehicleId={v.id}
              isAvailable={v.isAvailable}
              showroomName={showroomName}
              onDone={onToggle}
            />
          </div>
        )}
      </div>

      <PhotoLightbox
        open={lightboxOpen}
        photos={v.photos}
        startIndex={0}
        onClose={() => setLightboxOpen(false)}
        alt={`${v.marque} ${v.modele}`}
      />
    </div>
  )
}

function RentalRequestForm({
  slug, vehicleId, isAvailable, showroomName, onDone,
}: {
  slug: string
  vehicleId: string
  isAvailable: boolean
  showroomName: string
  onDone: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone]       = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]   = useState('')
  const [reason, setReason]     = useState('')
  const [reasonOther, setReasonOther] = useState('')
  const [message, setMessage]   = useState('')
  const [company, setCompany]   = useState('') // honeypot
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) { setError('Nom complet requis.'); return }
    if (!phoneLooksValid(phone)) { setError('Numéro de téléphone algérien invalide (ex. 0550 12 34 56).'); return }
    if (!reason) { setError('Veuillez choisir un motif.'); return }
    if (reason === 'autre' && !reasonOther.trim()) { setError('Veuillez préciser le motif.'); return }
    if (startDate && endDate && endDate < startDate) { setError('La date de fin doit être postérieure ou égale au début.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/public/rental-prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          rental_vehicle_id: vehicleId,
          full_name: fullName.trim(),
          phone: phone.trim(),
          desired_start_date: startDate || undefined,
          desired_end_date: endDate || undefined,
          reason,
          reason_other: reason === 'autre' ? reasonOther.trim() : undefined,
          message: message.trim() || undefined,
          company, // honeypot
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? 'Une erreur est survenue. Réessayez.')
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError('Erreur réseau. Réessayez.')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto size-12 rounded-full bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center mb-3">
          <Check className="size-6 text-emerald-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900">Merci ! Votre demande a été envoyée.</p>
        <p className="mt-1 text-xs text-slate-600">{showroomName} vous contactera prochainement.</p>
        <button
          type="button"
          onClick={onDone}
          className="mt-4 inline-flex items-center justify-center h-10 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium"
        >
          Fermer
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-3">
      {!isAvailable && (
        <p className="text-[11px] rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-800 px-3 py-2">
          Actuellement indisponible — vous pouvez tout de même envoyer une demande pour des dates futures.
        </p>
      )}

      <Field label="Nom complet" required>
        <input
          value={fullName} onChange={(e) => setFullName(e.target.value)}
          required maxLength={120} autoComplete="name"
          className={inputCls} placeholder="ex. Karim Benali"
        />
      </Field>
      <Field label="Téléphone" required>
        <input
          value={phone} onChange={(e) => setPhone(e.target.value)}
          required inputMode="tel" maxLength={30} autoComplete="tel"
          className={inputCls} placeholder="0550 12 34 56"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Du (optionnel)">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Au (optionnel)">
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Motif" required>
        <select value={reason} onChange={(e) => setReason(e.target.value)} required className={inputCls}>
          <option value="">Choisir…</option>
          {RENTAL_PROSPECT_REASONS.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
      </Field>
      {reason === 'autre' && (
        <Field label="Précisez" required>
          <input
            value={reasonOther} onChange={(e) => setReasonOther(e.target.value)}
            required maxLength={200} className={inputCls} placeholder="Votre motif"
          />
        </Field>
      )}

      <Field label="Message (optionnel)">
        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)}
          rows={3} maxLength={1000}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition resize-none"
          placeholder="Précisions sur votre besoin…"
        />
      </Field>

      {/* Honeypot — hidden from users + AT */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Société
          <input
            type="text" tabIndex={-1} autoComplete="off"
            value={company} onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full h-11 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
        Envoyer la demande
      </button>
    </form>
  )
}

const inputCls = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  )
}
