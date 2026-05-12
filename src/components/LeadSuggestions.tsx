'use client'
// ─────────────────────────────────────────────────────────────────────
// LeadSuggestions
// ─────────────────────────────────────────────────────────────────────
// Lazy-fetched panel of suggested vehicles + pre-orders for a lead.
// Calls /api/leads/:id/suggestions on mount.
//
// Each suggestion card shows: thumbnail (or gradient placeholder),
// title, year, price, match-score chip, French match-reason tags
// (e.g. "Même marque", "Prix similaire"), and a "Proposer" button
// that opens a pre-filled WhatsApp link to the lead. The link
// includes the deep-link to /s/<slug>?v=<vehicle_id> so the customer
// can review the exact card.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Car, Package, MessageCircle, Loader2 } from 'lucide-react'
import type {
  Vehicle, PreorderVehicle, VehicleSuggestion, PreorderSuggestion,
} from '@/lib/types'

function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

function whatsappDigits(p: string | null | undefined): string {
  if (!p) return ''
  let s = p.trim().replace(/[^\d+]/g, '')
  if (s.startsWith('+')) return s.slice(1)
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  return s.startsWith('213') ? s : ('213' + s)
}

function buildWhatsappLink({
  phone, name, marque, modele, annee, prix, slug, vehicleId,
}: {
  phone:    string | null | undefined
  name:     string
  marque:   string
  modele:   string
  annee:    number | null | undefined
  prix:     number | null | undefined
  slug:     string | null
  vehicleId?: string
}): string | null {
  const digits = whatsappDigits(phone)
  if (!digits) return null
  const yearTxt = annee ? ` ${annee}` : ''
  const priceTxt = prix != null ? ` à ${formatDzd(prix)} DZD` : ''
  const link = slug && vehicleId && typeof window !== 'undefined'
    ? `${window.location.origin}/s/${slug}?v=${vehicleId}`
    : slug
      ? `autodex.store/s/${slug}`
      : ''
  const linkTxt = link ? ` Voici le lien : ${link}` : ''
  const msg = `Bonjour ${name}, nous avons aussi la ${marque} ${modele}${yearTxt}${priceTxt} qui pourrait vous intéresser !${linkTxt}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

export default function LeadSuggestions({
  leadId, leadName, leadPhone, showroomSlug,
}: {
  leadId:       string
  leadName:     string
  leadPhone:    string | null
  showroomSlug: string | null
}) {
  const [vehicles, setVehicles]   = useState<VehicleSuggestion[]>([])
  const [preorders, setPreorders] = useState<PreorderSuggestion[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/suggestions`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? 'Erreur de chargement.')
        if (cancelled) return
        setVehicles((json.vehicles ?? []) as VehicleSuggestion[])
        setPreorders((json.preorders ?? []) as PreorderSuggestion[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leadId])

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Chargement des suggestions…</span>
      </div>
    )
  }
  // Either error or empty result → friendly empty state. Errors here
  // are almost always "no reference vehicle to compare against" or a
  // transient DB hiccup, not something the owner needs to triage.
  if (error || (vehicles.length === 0 && preorders.length === 0)) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground italic">
        Aucun véhicule lié — les suggestions apparaîtront quand un véhicule sera associé à ce lead.
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {vehicles.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            💡 Véhicules suggérés
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {vehicles.map((s) => (
              <VehicleSuggestionCard
                key={s.vehicle.id}
                v={s.vehicle}
                score={s.match_score}
                reasons={s.match_reasons}
                whatsappLink={buildWhatsappLink({
                  phone:     leadPhone,
                  name:      leadName,
                  marque:    s.vehicle.brand,
                  modele:    s.vehicle.model,
                  annee:     s.vehicle.year,
                  prix:      s.vehicle.price_dzd,
                  slug:      showroomSlug,
                  vehicleId: s.vehicle.id,
                })}
              />
            ))}
          </div>
        </section>
      )}

      {preorders.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            📦 Pré-commandes suggérées
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {preorders.map((s) => (
              <PreorderSuggestionCard
                key={s.preorder.id}
                p={s.preorder}
                score={s.match_score}
                reasons={s.match_reasons}
                whatsappLink={buildWhatsappLink({
                  phone:  leadPhone,
                  name:   leadName,
                  marque: s.preorder.marque,
                  modele: s.preorder.modele,
                  annee:  s.preorder.annee,
                  prix:   s.preorder.prix_estime,
                  slug:   showroomSlug,
                })}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/30">
      Score : {score}
    </span>
  )
}

function ReasonsRow({ reasons }: { reasons: string[] }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span
          key={r}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/30"
        >
          {r}
        </span>
      ))}
    </div>
  )
}

function VehicleSuggestionCard({
  v, score, reasons, whatsappLink,
}: {
  v: Vehicle
  score: number
  reasons: string[]
  whatsappLink: string | null
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-violet-100 to-fuchsia-50 dark:from-violet-500/15 dark:to-fuchsia-500/5 flex items-center justify-center overflow-hidden">
        {v.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.image_url} alt={`${v.brand} ${v.model}`} loading="lazy"
               className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Car className="w-10 h-10 text-violet-300" />
        )}
      </div>
      <div className="p-2.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <h5 className="text-[12px] font-semibold text-foreground leading-tight truncate">
              {v.brand} {v.model}{v.year ? ` ${v.year}` : ''}
            </h5>
            <p className="text-[11px] font-bold text-foreground mt-0.5">
              {v.price_dzd != null
                ? <>{formatDzd(v.price_dzd)} <span className="text-[9px] text-muted-foreground">DZD</span></>
                : <span className="text-muted-foreground font-normal">Prix sur demande</span>}
            </p>
          </div>
          <ScoreChip score={score} />
        </div>
        <ReasonsRow reasons={reasons} />
        <div className="mt-auto pt-1">
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Proposer
            </a>
          ) : (
            <div className="inline-flex items-center justify-center w-full h-8 rounded-md bg-muted text-muted-foreground text-[11px]">
              Pas de téléphone
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreorderSuggestionCard({
  p, score, reasons, whatsappLink,
}: {
  p: PreorderVehicle
  score: number
  reasons: string[]
  whatsappLink: string | null
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-500/15 dark:to-orange-500/5 flex items-center justify-center overflow-hidden">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={`${p.marque} ${p.modele}`} loading="lazy"
               className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Package className="w-10 h-10 text-amber-300" />
        )}
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/90 text-white">
          📦 Pré-cmd
        </span>
      </div>
      <div className="p-2.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <h5 className="text-[12px] font-semibold text-foreground leading-tight truncate">
              {p.marque} {p.modele}{p.annee ? ` ${p.annee}` : ''}
            </h5>
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-0.5">
              {p.prix_estime != null
                ? `À partir de ${formatDzd(p.prix_estime)}`
                : 'Prix sur demande'}
            </p>
          </div>
          <ScoreChip score={score} />
        </div>
        <ReasonsRow reasons={reasons} />
        <div className="mt-auto pt-1">
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Proposer
            </a>
          ) : (
            <div className="inline-flex items-center justify-center w-full h-8 rounded-md bg-muted text-muted-foreground text-[11px]">
              Pas de téléphone
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
