'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Car, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  async function handleDemoLogin() {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: 'demo@autodex.store',
      password: 'demo123',
    })

    if (error) {
      setError("Connexion démo indisponible pour l'instant.")
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4 border border-white/10">
          <Car className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-white text-3xl font-semibold tracking-tight">Autodex</h1>
        <p className="text-white/40 text-sm mt-1">Gestion commerciale automobile · Algérie</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
        <h2 className="text-white text-lg font-medium mb-6">Connexion</h2>

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
