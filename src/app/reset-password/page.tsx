'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Car, Loader2, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [tokenError, setTokenError]   = useState('')

  // ── Pick up the recovery session from the URL ─────────────────────
  // Supabase emails embed `?code=...` (PKCE) or `#access_token=...` in the
  // recovery URL. The supabase-js client auto-detects either when
  // `detectSessionInUrl` is enabled (the default), but we wait for the
  // session here so we can show a clear error if the link is missing/expired.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Quick check: do we have any recovery payload in the URL?
      const hash   = typeof window !== 'undefined' ? window.location.hash   : ''
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const hasRecoveryPayload =
        hash.includes('access_token=') ||
        hash.includes('type=recovery')  ||
        search.includes('code=')

      // Listen for the PASSWORD_RECOVERY event that supabase-js fires once
      // it has parsed the URL and exchanged the recovery token for a session.
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          if (!cancelled) setSessionReady(true)
        }
      })

      // Also probe directly in case the event already fired before we
      // subscribed (race on initial mount).
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        if (!cancelled) setSessionReady(true)
      } else if (!hasRecoveryPayload) {
        if (!cancelled) {
          setTokenError(
            "Lien de réinitialisation invalide ou expiré. Demandez un nouveau lien depuis la page de connexion.",
          )
        }
      }

      return () => { sub.subscription.unsubscribe() }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSuccess(true)
    // Sign out so the user lands on the login page in a clean state.
    await supabase.auth.signOut()
    setTimeout(() => {
      window.location.href = '/login?reset=success'
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4 border border-white/10">
          <Car className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-white text-3xl font-semibold tracking-tight">Autodex</h1>
        <p className="text-white/40 text-sm mt-1">Réinitialisation du mot de passe</p>
      </div>

      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
        {success ? (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-white text-lg font-medium">Mot de passe mis à jour</h2>
            <p className="text-white/50 text-sm">
              Redirection vers la page de connexion…
            </p>
          </div>
        ) : tokenError ? (
          <div className="space-y-4">
            <h2 className="text-white text-lg font-medium">Lien invalide</h2>
            <p className="text-red-400 text-sm">{tokenError}</p>
            <Button
              type="button"
              onClick={() => { window.location.href = '/login' }}
              className="w-full h-10 bg-white text-black hover:bg-white/90 font-medium mt-2"
            >
              Retour à la connexion
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-white text-lg font-medium mb-6">
              Nouveau mot de passe
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-white/60 text-sm">
                  Nouveau mot de passe
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="bg-white/8 border-white/15 text-white placeholder:text-white/25 focus-visible:ring-white/30 h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-white/60 text-sm">
                  Confirmer le mot de passe
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="bg-white/8 border-white/15 text-white placeholder:text-white/25 focus-visible:ring-white/30 h-10"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <Button
                type="submit"
                disabled={loading || !sessionReady}
                className="w-full h-10 bg-white text-black hover:bg-white/90 font-medium mt-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : sessionReady ? (
                  'Mettre à jour'
                ) : (
                  'Vérification du lien…'
                )}
              </Button>
            </form>

            <p className="text-white/25 text-xs text-center mt-6">
              Choisissez un mot de passe d&apos;au moins 8 caractères.
            </p>
          </>
        )}
      </div>

      <p className="text-white/20 text-xs mt-8">
        © {new Date().getFullYear()} Autodex — Tous droits réservés
      </p>
    </div>
  )
}
