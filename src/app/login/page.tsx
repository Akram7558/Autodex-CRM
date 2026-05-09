'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Car, Loader2, CheckCircle2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// /login — moved here from `/` when the public landing page took over
// the root. The reset-password flow redirects to `/login?reset=success`
// to surface a success banner, so the URL cleanup below targets /login.
// ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'success') {
      setResetSuccess(true)
      // Clean the URL so a refresh doesn't keep the banner forever.
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data?.user) {
      setError(error?.message ?? 'Connexion échouée.')
      setLoading(false)
      return
    }

    await routeAfterLogin(data.user.id)
  }

  async function handleDemoLogin() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'demo@autodex.store',
      password: 'demo123',
    })

    if (error || !data?.user) {
      setError("Connexion démo indisponible pour l'instant.")
      setLoading(false)
      return
    }

    await routeAfterLogin(data.user.id)
  }

  // Role-based redirect after login. Hard nav so the SSR cookie set by
  // signInWithPassword is seen by the middleware on the next request.
  async function routeAfterLogin(userId: string) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    let target = '/dashboard'
    switch (roleRow?.role) {
      case 'super_admin':       target = '/dashboard/super-admin';            break
      case 'commercial':        target = '/dashboard/super-admin';            break
      case 'prospecteur_saas':  target = '/dashboard/super-admin/prospects';  break
      case 'closer':            target = '/dashboard/rendez-vous';            break
      case 'prospecteur':       target = '/dashboard/leads';                  break
      // owner / manager / unknown → '/dashboard'
    }

    window.location.href = target
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4 border border-white/10">
          <Car className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-white text-3xl font-semibold tracking-tight">Autodex</h1>
        <p className="text-white/40 text-sm mt-1">Gestion commerciale automobile · Algérie</p>
      </div>

      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
        <h2 className="text-white text-lg font-medium mb-6">Connexion</h2>

        {resetSuccess && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Mot de passe mis à jour. Vous pouvez maintenant vous connecter.</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/60 text-sm">
              Adresse e-mail
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="exemple@autodex.store"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/8 border-white/15 text-white placeholder:text-white/25 focus-visible:ring-white/30 h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-white/60 text-sm">
              Mot de passe
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white/8 border-white/15 text-white placeholder:text-white/25 focus-visible:ring-white/30 h-10"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-white text-black hover:bg-white/90 font-medium mt-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Se connecter'
            )}
          </Button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#141414] px-3 text-white/30">ou</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleDemoLogin}
          disabled={loading}
          className="w-full h-10 border-white/15 bg-transparent text-white/70 hover:bg-white/8 hover:text-white"
        >
          Connexion démo
        </Button>

        <p className="text-white/25 text-xs text-center mt-4">
          demo@autodex.store · demo123
        </p>
      </div>

      <p className="text-white/20 text-xs mt-8">
        © {new Date().getFullYear()} Autodex — Tous droits réservés
      </p>
    </div>
  )
}
