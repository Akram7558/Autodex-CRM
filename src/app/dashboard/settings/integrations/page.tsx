'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  MessageCircle, MessageSquare, Camera, Plug, Plug2,
  CheckCircle2, XCircle, Loader2, Send, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Integration, IntegrationProvider } from '@/lib/types'
import { fbLogin, loadFacebookSDK } from '@/lib/facebook-sdk'

const WHATSAPP_SCOPE = 'whatsapp_business_management,whatsapp_business_messaging,business_management'

// ── Provider metadata ─────────────────────────────────────────

type ProviderCard = {
  id: IntegrationProvider
  title: string
  description: string
  Icon: typeof MessageCircle
  iconBg: string
  iconColor: string
  phoneRequired: boolean
  accountLabel: string
}

const PROVIDERS: ProviderCard[] = [
  {
    id: 'whatsapp',
    title: 'WhatsApp Business',
    description: 'Recevez automatiquement les messages WhatsApp de vos clients dans votre pipeline',
    Icon: MessageCircle,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    phoneRequired: true,
    accountLabel: 'Nom du compte WhatsApp Business',
  },
  {
    id: 'messenger',
    title: 'Facebook Messenger',
    description: 'Recevez les messages de votre page Facebook',
    Icon: MessageSquare,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    phoneRequired: false,
    accountLabel: 'Nom de la page Facebook',
  },
  {
    id: 'instagram',
    title: 'Instagram Business',
    description: 'Capturez les DMs Instagram de votre compte business',
    Icon: Camera,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-600',
    phoneRequired: false,
    accountLabel: 'Nom du compte Instagram Business',
  },
]

// ── Toast ─────────────────────────────────────────────────────

type Toast = { id: number; tone: 'success' | 'error' | 'info'; message: string }

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium min-w-[260px] max-w-sm border ${
            t.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : t.tone === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-white border-gray-200 text-gray-800'
          }`}
        >
          {t.tone === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {t.tone === 'error'   && <XCircle       className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Connect modal ─────────────────────────────────────────────

function ConnectModal({
  provider, onClose, onSubmit,
}: {
  provider: ProviderCard
  onClose: () => void
  onSubmit: (values: { account_name: string; phone_number: string; account_id: string }) => Promise<void>
}) {
  const [accountName, setAccountName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [accountId, setAccountId]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountName.trim()) { setError('Nom du compte requis.'); return }
    if (provider.phoneRequired && !phoneNumber.trim()) {
      setError('Numéro WhatsApp requis.'); return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        account_name: accountName.trim(),
        phone_number: phoneNumber.trim(),
        account_id:   accountId.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${provider.iconBg} flex items-center justify-center`}>
              <provider.Icon className={`w-5 h-5 ${provider.iconColor}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Connecter {provider.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Mode démo — OAuth réel disponible après validation Meta
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {provider.accountLabel} *
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="ex. Autodex Automobile Oran"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {provider.phoneRequired && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Numéro WhatsApp Business *
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+213 555 12 34 56"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Identifiant Meta <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={provider.id === 'whatsapp' ? 'Phone Number ID' : 'Page / Account ID'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Connecter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [showroomId, setShowroomId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)           // provider id currently mutating
  const [modalProvider, setModalProvider] = useState<ProviderCard | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  function pushToast(tone: Toast['tone'], message: string) {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, tone, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }
  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Resolve current user's showroom on mount.
  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser()
      const authId = userData?.user?.id
      if (!authId) { setLoading(false); return }

      // Find the app user row to get showroom_id.
      const { data: appUser } = await supabase
        .from('users')
        .select('id, showroom_id')
        .eq('id', authId)
        .maybeSingle()

      let resolvedShowroom = appUser?.showroom_id ?? null

      // Fallback: first showroom in the DB for showrooms with no assigned user
      if (!resolvedShowroom) {
        const { data: rooms } = await supabase.from('showrooms').select('id').limit(1)
        resolvedShowroom = rooms?.[0]?.id ?? null
      }

      setShowroomId(resolvedShowroom)
      if (resolvedShowroom) await loadIntegrations(resolvedShowroom)
      setLoading(false)
    }
    init()
  }, [])

  async function loadIntegrations(sid: string) {
    const res = await fetch(`/api/integrations/list?showroom_id=${encodeURIComponent(sid)}`)
    const json = await res.json()
    if (json?.ok) setIntegrations(json.integrations ?? [])
  }

  function integrationFor(provider: IntegrationProvider) {
    return integrations.find((i) => i.provider === provider && i.is_active) ?? null
  }

  async function handleConnect(card: ProviderCard, values: { account_name: string; phone_number: string; account_id: string }) {
    if (!showroomId) throw new Error('Aucun showroom associé à ce compte.')
    setBusy(card.id)
    try {
      const res = await fetch('/api/integrations/connect/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          showroom_id: showroomId,
          provider:    card.id,
          account_name: values.account_name,
          phone_number: values.phone_number,
          account_id:   values.account_id,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.error || 'Connexion échouée')
      await loadIntegrations(showroomId)
      setModalProvider(null)
      pushToast('success', `${card.title} connecté avec succès`)
    } finally {
      setBusy(null)
    }
  }

  // Real Meta Embedded Signup for WhatsApp. Loads FB SDK on demand,
  // runs FB.login, then hands the short-lived token to the connect
  // endpoint which exchanges it for a long-lived token and discovers
  // the WABA + phone number.
  async function handleWhatsAppEmbeddedSignup(card: ProviderCard) {
    if (!showroomId) {
      pushToast('error', 'Aucun showroom associé à ce compte.')
      return
    }
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      pushToast('error', 'NEXT_PUBLIC_META_APP_ID manquant — impossible de lancer le SDK Meta.')
      return
    }

    setBusy(card.id)
    try {
      const fb = await loadFacebookSDK(appId)
      const response = await fbLogin(fb, WHATSAPP_SCOPE)

      if (response.status !== 'connected' || !response.authResponse?.accessToken) {
        if (response.status === 'not_authorized' || response.status === 'unknown') {
          pushToast('info', 'Connexion annulée')
        } else {
          pushToast('error', 'Connexion Meta refusée')
        }
        return
      }

      const shortToken = response.authResponse.accessToken

      const res = await fetch('/api/integrations/connect/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          showroom_id:  showroomId,
          access_token: shortToken,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        pushToast('error', json?.error || 'Connexion WhatsApp échouée')
        return
      }
      await loadIntegrations(showroomId)
      const phone = json.phone_number ? ` (${json.phone_number})` : ''
      pushToast('success', `WhatsApp Business connecté${phone}`)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Erreur SDK Facebook')
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect(card: ProviderCard) {
    if (!showroomId) return
    if (!confirm(`Déconnecter ${card.title} ?`)) return
    setBusy(card.id)
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ showroom_id: showroomId, provider: card.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.error || 'Déconnexion échouée')
      await loadIntegrations(showroomId)
      pushToast('success', `${card.title} déconnecté`)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  async function handleTest(card: ProviderCard) {
    setBusy(card.id)
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: card.id }),
      })
      const json = await res.json()
      if (!res.ok || json.ok === false) throw new Error(json?.error || 'Test échoué')
      if (json.skipped) {
        pushToast('info', `Test traité — ${json.skipped === 'duplicate' ? 'lead déjà existant' : 'pas de téléphone détecté'}`)
      } else {
        pushToast('success', 'Lead de test créé dans le pipeline')
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <p className="text-gray-400 text-sm">Chargement des intégrations…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Intégrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Connectez vos réseaux sociaux pour capturer automatiquement les leads
        </p>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {PROVIDERS.map((card) => {
          const integ = integrationFor(card.id)
          const connected = Boolean(integ)
          const isBusy = busy === card.id
          const { Icon } = card

          return (
            <div
              key={card.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              style={{ borderWidth: '0.5px' }}
            >
              <div className="p-5 flex items-start gap-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${card.iconColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        connected
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          connected ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}
                      />
                      {connected ? 'Connecté' : 'Non connecté'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{card.description}</p>

                  {connected && integ && (
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
                      {integ.account_name && (
                        <span>
                          <span className="text-gray-400">Compte : </span>
                          <span className="font-medium">{integ.account_name}</span>
                        </span>
                      )}
                      {integ.phone_number && (
                        <span>
                          <span className="text-gray-400">Numéro : </span>
                          <span className="font-medium">{integ.phone_number}</span>
                        </span>
                      )}
                      <span className="text-gray-400">
                        Connecté le {format(new Date(integ.connected_at), 'd MMM yyyy', { locale: fr })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(card)}
                      disabled={isBusy}
                      className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plug2 className="w-3.5 h-3.5" />
                      Déconnecter
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        card.id === 'whatsapp'
                          ? handleWhatsAppEmbeddedSignup(card)
                          : setModalProvider(card)
                      }
                      disabled={isBusy || !showroomId}
                      className="px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plug className="w-3.5 h-3.5" />
                      )}
                      Connecter {card.title.split(' ')[0]}
                    </button>
                  )}
                </div>
              </div>

              {/* Test section */}
              {connected && (
                <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Envoyer un message de test à travers le webhook pour vérifier la capture.
                  </p>
                  <button
                    onClick={() => handleTest(card)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Tester l&apos;intégration
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Help footer */}
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 p-4 text-xs text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Comment ça marche ?</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Connectez le compte Meta de votre showroom (WhatsApp, Messenger ou Instagram)</li>
          <li>Nos webhooks reçoivent chaque nouveau message entrant</li>
          <li>Claude extrait automatiquement le téléphone, le modèle souhaité et le budget</li>
          <li>Un lead est créé dans votre pipeline et assigné à un vendeur disponible</li>
        </ol>
        <p className="mt-2">
          <Link href="/dashboard/alerts" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Voir vos alertes →
          </Link>
        </p>
      </div>

      {modalProvider && (
        <ConnectModal
          provider={modalProvider}
          onClose={() => setModalProvider(null)}
          onSubmit={(v) => handleConnect(modalProvider, v)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
