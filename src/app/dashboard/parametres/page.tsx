'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Globe2, Phone as PhoneIcon, MapPin, Image as ImageIcon, Clock,
  Copy, CheckCircle2, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ShowroomOpeningHours, ShowroomPublicInfo } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────
// /dashboard/parametres — owner / manager catalog settings.
// Edits the public-facing showroom profile via /api/showroom/public-info.
// ─────────────────────────────────────────────────────────────────────

const DAYS: { key: keyof ShowroomOpeningHours; label: string }[] = [
  { key: 'lundi',    label: 'Lundi' },
  { key: 'mardi',    label: 'Mardi' },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi',    label: 'Jeudi' },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi',   label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' },
]

const DEFAULT_OPEN  = '08:00'
const DEFAULT_CLOSE = '18:00'

// Per-day local UI state so we can support open/close + a "fermé" toggle
// without round-tripping a half-typed string through the server.
type DayState = {
  closed: boolean
  open:   string
  close:  string
}
const emptyDay = (): DayState => ({ closed: false, open: DEFAULT_OPEN, close: DEFAULT_CLOSE })

function parseHours(value: string | undefined): DayState {
  if (!value) return emptyDay()
  const v = value.trim().toLowerCase()
  if (v === 'fermé' || v === 'ferme' || v === 'closed') {
    return { closed: true, open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
  }
  const m = v.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
  if (m) return { closed: false, open: m[1], close: m[2] }
  return emptyDay()
}

function serialiseHours(s: DayState): string {
  return s.closed ? 'fermé' : `${s.open}-${s.close}`
}

export default function ShowroomParametresPage() {
  const [info, setInfo]       = useState<ShowroomPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [catalogEnabled, setCatalogEnabled] = useState(false)
  const [phone,    setPhone]    = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address,  setAddress]  = useState('')
  const [mapsUrl,  setMapsUrl]  = useState('')
  const [logoUrl,  setLogoUrl]  = useState('')

  const [hours, setHours] = useState<Record<keyof ShowroomOpeningHours, DayState>>({
    lundi: emptyDay(), mardi: emptyDay(), mercredi: emptyDay(),
    jeudi: emptyDay(), vendredi: emptyDay(), samedi: emptyDay(), dimanche: emptyDay(),
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [toast,  setToast]  = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }
  const [copied, setCopied] = useState(false)

  async function fetchInfo() {
    setLoading(true); setLoadError('')
    const res = await fetch('/api/showroom/public-info')
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Erreur de chargement.')
      return
    }
    const sh = (json.showroom ?? null) as ShowroomPublicInfo | null
    setInfo(sh)
    if (sh) {
      setCatalogEnabled(!!sh.catalog_enabled)
      setPhone(sh.phone ?? '')
      setWhatsapp(sh.whatsapp ?? '')
      setAddress(sh.address ?? '')
      setMapsUrl(sh.google_maps_url ?? '')
      setLogoUrl(sh.logo_url ?? '')
      setHours({
        lundi:    parseHours(sh.opening_hours?.lundi),
        mardi:    parseHours(sh.opening_hours?.mardi),
        mercredi: parseHours(sh.opening_hours?.mercredi),
        jeudi:    parseHours(sh.opening_hours?.jeudi),
        vendredi: parseHours(sh.opening_hours?.vendredi),
        samedi:   parseHours(sh.opening_hours?.samedi),
        dimanche: parseHours(sh.opening_hours?.dimanche),
      })
    }
  }
  useEffect(() => { fetchInfo() }, [])

  const publicUrl = useMemo(() => {
    if (!info?.slug) return null
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/s/${info.slug}`
    }
    return `https://www.autodex.store/s/${info.slug}`
  }, [info?.slug])

  async function copyLink() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez ce lien :', publicUrl)
    }
  }

  function patchDay(key: keyof ShowroomOpeningHours, p: Partial<DayState>) {
    setHours((cur) => ({ ...cur, [key]: { ...cur[key], ...p } }))
  }

  async function save() {
    setError('')
    setSaving(true)
    const opening_hours: ShowroomOpeningHours = {}
    for (const { key } of DAYS) opening_hours[key] = serialiseHours(hours[key])
    const res = await fetch('/api/showroom/public-info', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalog_enabled: catalogEnabled,
        phone:           phone.trim()    || null,
        whatsapp:        whatsapp.trim() || null,
        address:         address.trim()  || null,
        google_maps_url: mapsUrl.trim()  || null,
        logo_url:        logoUrl.trim()  || null,
        opening_hours,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json?.error ?? 'Erreur lors de la sauvegarde.'); return }
    if (json.showroom) setInfo(json.showroom as ShowroomPublicInfo)
    flashToast('Paramètres mis à jour')
  }

  return (
    <div className="p-10 pt-2 max-w-4xl space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configuration du showroom et du catalogue public.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          {loadError}
        </div>
      )}

      {/* ── Catalog toggle + public URL ─────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Globe2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Mon Catalogue Public</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Une page publique avec votre stock + pré-commandes, partageable sur WhatsApp / Instagram.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={catalogEnabled}
            onClick={() => setCatalogEnabled(v => !v)}
            className={cn(
              'relative w-12 h-6 rounded-full transition-colors shrink-0',
              catalogEnabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700',
            )}
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              catalogEnabled && 'translate-x-6',
            )} />
          </button>
        </div>

        {publicUrl && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 px-3 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-300">🔗</span>
            <code className="text-xs font-mono text-indigo-900 dark:text-indigo-100 break-all flex-1 min-w-0">
              {publicUrl.replace(/^https?:\/\//, '')}
            </code>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={copyLink}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors',
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700',
                )}
              >
                {copied ? <><CheckCircle2 className="w-3 h-3" /> Copié</> : <><Copy className="w-3 h-3" /> Copier</>}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Ouvrir
              </a>
            </div>
          </div>
        )}
        {!publicUrl && !loading && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Aucun lien public disponible. Contactez l&apos;administrateur si le problème persiste.
          </div>
        )}
      </motion.section>

      {/* ── Contact + adresse ───────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <PhoneIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Coordonnées</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Affichées en haut de votre catalogue public.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Téléphone du showroom">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0555 XX XX XX"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="0555 XX XX XX"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </Field>
        </div>

        <Field label="Adresse">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex. 12 Rue Didouche Mourad, Alger Centre"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </Field>

        <Field label="Lien Google Maps">
          <input
            type="url"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/?q=..."
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Collez l&apos;URL exacte de votre fiche Google Maps.
          </p>
        </Field>

        <Field label="Logo (URL)">
          <div className="relative">
            <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Upload d&apos;image direct à venir.
          </p>
        </Field>
      </motion.section>

      {/* ── Horaires ────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Horaires d&apos;ouverture</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Cochez « Fermé » pour les jours non ouvrables.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const d = hours[key]
            return (
              <div
                key={key}
                className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr_auto] gap-2 items-center"
              >
                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{label}</span>
                <input
                  type="time"
                  value={d.open}
                  disabled={d.closed}
                  onChange={(e) => patchDay(key, { open: e.target.value })}
                  className="h-9 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                />
                <input
                  type="time"
                  value={d.close}
                  disabled={d.closed}
                  onChange={(e) => patchDay(key, { close: e.target.value })}
                  className="h-9 px-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                />
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={d.closed}
                    onChange={(e) => patchDay(key, { closed: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  Fermé
                </label>
              </div>
            )
          })}
        </div>
      </motion.section>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving || !info}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  )
}
