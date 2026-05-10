'use client'
// ─────────────────────────────────────────────────────────────────────
// OrderModal — public catalog order/pré-commande form.
// ─────────────────────────────────────────────────────────────────────
// Drawer-style on mobile (slides up from bottom), centered card on
// desktop. Posts to `/api/catalog/<slug>/order` and shows a thank-you
// screen with a 1-click WhatsApp link to the showroom.
//
// Server-side handles dedupe + auto-reservation; this UI is purely a
// thin form wrapper.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { X, Loader2, Check, MessageCircle } from 'lucide-react'
import type { Vehicle, PreorderVehicle } from '@/lib/types'

export type OrderCtx =
  | { type: 'vehicle';  vehicle:  Vehicle }
  | { type: 'preorder'; preorder: PreorderVehicle }

export default function OrderModal({
  slug, showroomName, whatsappDigits, order, onClose,
}: {
  slug: string
  showroomName: string
  whatsappDigits: string
  order: OrderCtx
  onClose: () => void
}) {
  const [name, setName]             = useState('')
  const [phone, setPhone]           = useState('')
  const [message, setMessage]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [done, setDone]             = useState(false)

  // Esc-to-close + body scroll lock.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const itemLabel =
    order.type === 'vehicle'
      ? `${order.vehicle.brand} ${order.vehicle.model}${order.vehicle.year ? ' ' + order.vehicle.year : ''}`
      : `${order.preorder.marque} ${order.preorder.modele}${order.preorder.annee ? ' ' + order.preorder.annee : ''}`

  const itemTitle = order.type === 'vehicle'
    ? 'Commander ce véhicule'
    : 'Pré-commander ce modèle'

  const isPreorder = order.type === 'preorder'
  const accentBtn  = isPreorder
    ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
    : 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800'
  const accentText = isPreorder ? 'text-amber-700' : 'text-violet-700'
  const accentRing = isPreorder
    ? 'focus:ring-amber-500 focus:border-amber-500'
    : 'focus:ring-violet-500 focus:border-violet-500'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim())  { setError('Veuillez entrer votre nom complet.'); return }
    if (!phone.trim()) { setError('Veuillez entrer votre numéro de téléphone.'); return }
    setSubmitting(true)
    try {
      const body = {
        full_name:   name.trim(),
        phone:       phone.trim(),
        message:     message.trim() || null,
        type:        order.type,
        vehicle_id:  order.type === 'vehicle'  ? order.vehicle.id  : null,
        preorder_id: order.type === 'preorder' ? order.preorder.id : null,
      }
      const r = await fetch(`/api/catalog/${encodeURIComponent(slug)}/order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(data?.error ?? "Erreur lors de l'envoi. Réessayez.")
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError('Connexion perdue. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const waLink = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
        `Bonjour ${showroomName}, je viens d'envoyer une demande pour : ${itemLabel}.`,
      )}`
    : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer handle (mobile only) */}
        <div className="sm:hidden pt-2 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="px-5 pt-4 pb-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{itemTitle}</h3>
              <p className={'text-sm font-medium truncate ' + accentText}>{itemLabel}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="size-9 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"
            >
              <X className="size-5" />
            </button>
          </div>

          {done ? (
            <div className="py-4 text-center">
              <div className="mx-auto size-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <Check className="size-7 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-slate-900">
                Merci, c&apos;est bien noté !
              </h4>
              <p className="mt-1 text-sm text-slate-600">
                {showroomName} vous contactera très bientôt.
              </p>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  <MessageCircle className="size-4" /> Continuer sur WhatsApp
                </a>
              )}
              <button
                onClick={onClose}
                className="mt-2 w-full h-11 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nom complet *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom"
                  required
                  autoComplete="name"
                  className={
                    'w-full h-11 rounded-lg border border-slate-300 px-3 text-sm bg-white ' +
                    'focus:outline-none focus:ring-2 ' + accentRing
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Téléphone *
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0X XX XX XX XX"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel"
                  className={
                    'w-full h-11 rounded-lg border border-slate-300 px-3 text-sm bg-white ' +
                    'focus:outline-none focus:ring-2 ' + accentRing
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message (optionnel)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Couleur souhaitée, financement, ou toute question…"
                  className={
                    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white resize-none ' +
                    'focus:outline-none focus:ring-2 ' + accentRing
                  }
                />
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={
                  'w-full h-12 rounded-lg text-white text-sm font-semibold transition flex items-center justify-center gap-2 ' +
                  accentBtn +
                  (submitting ? ' opacity-80 cursor-wait' : '')
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Envoi…
                  </>
                ) : (
                  'Envoyer ma demande'
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center pt-1">
                En envoyant, vous acceptez d&apos;être contacté(e) par {showroomName}.
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
